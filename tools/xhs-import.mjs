#!/usr/bin/env node
/**
 * xhs-import.mjs —— 在**没装插件**的情况下，把小红书笔记导入本地收藏库。
 *
 * 为什么存在这个脚本：`@local/xhs-rag` 插件提供 `xhs_import` / `xhs_search` 两个工具，
 * 但插件装上并重启 Harness 之前，模型拿不到这两个工具。这个脚本直接调用插件自己的
 * 模块（`urls.js` / `fetch-note.js` / `parse.js` / `store.js`），因此写出的记录形状与
 * `xhs_import` 完全一致 —— 插件装好后，之前导入的笔记可以直接被 `xhs_search` 检索到。
 * 收藏库是共享的纯派生缓存，不存在"脚本导的"与"工具导的"两套数据。
 *
 * 不重复实现的部分：链接识别、短链展开、页面解析、degraded 判定、打分检索全部复用
 * 插件模块。这里只有编排（对应 index.js 里的 `resolveCandidate` / 导入循环）。
 *
 * 与插件的一处差异（刻意的，且更诚实）：本脚本永远走纯 fetch 路径，所以每条记录都会
 * 带上「未经 ctx.web 直接抓取」的 degraded 标记。这是真实情况 —— 脚本没有 DSH 的
 * 抓取后端可用，也就没有地址安全校验。它不是内容质量问题的信号。
 *
 * 依赖：仅 Node 内置模块 + 插件自身的零依赖模块。需要外网（展开短链、抓笔记页）。
 *
 * 用法：
 *   # 导入分享链接或整段分享文案
 *   node .\tools\xhs-import.mjs "https://xhslink.cn/o/7T1Jb5Q8W37"
 *   node .\tools\xhs-import.mjs "复制这条信息，打开【小红书】查看 😊 https://xhslink.com/o/xxxx"
 *
 *   # 从标准输入读取（便于粘贴多行分享文案）
 *   Get-Clipboard | node .\tools\xhs-import.mjs
 *
 *   # 检索收藏库
 *   node .\tools\xhs-import.mjs --search "收纳"
 *
 *   # 覆盖收藏库位置（默认 $DSH_HOME\storages\xhs-rag\notes.json）
 *   node .\tools\xhs-import.mjs --store .\notes.json "https://..."
 *
 * 退出码：0 全部成功；1 有链接失败或用法错误；2 收藏库位置无法确定。
 */
import { fileURLToPath } from 'node:url';
import { isAbsolute, join, resolve } from 'node:path';

import { extractNoteLinks, resolveNoteFromFinalUrl } from '../dsh-plugin-starter/xhs-rag/urls.js';
import { expandShortLink, fetchNoteHtml } from '../dsh-plugin-starter/xhs-rag/fetch-note.js';
import { parseNoteHtml } from '../dsh-plugin-starter/xhs-rag/parse.js';
import { openNoteStore } from '../dsh-plugin-starter/xhs-rag/store.js';
import { searchNotes } from '../dsh-plugin-starter/xhs-rag/search.js';

/** 与插件 config 默认值保持一致，避免同一个收藏库在不同入口行为不同。 */
const DEFAULT_MAX_LINKS_PER_IMPORT = 20;
const DEFAULT_MAX_RESULTS = 5;

/**
 * 解析命令行参数。
 *
 * @param {string[]} argv - `process.argv.slice(2)`。
 * @returns {{ storePath?: string, search?: string, help: boolean, texts: string[] }}
 */
function parseArgs(argv) {
  const out = { help: false, texts: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      out.help = true;
    } else if (arg === '--store') {
      out.storePath = argv[i + 1];
      i += 1;
    } else if (arg === '--search') {
      out.search = argv[i + 1];
      i += 1;
    } else {
      out.texts.push(arg);
    }
  }
  return out;
}

const USAGE = `用法:
  node tools/xhs-import.mjs <链接或分享文案> [...]   导入收藏库
  node tools/xhs-import.mjs --search "<关键词>"      检索收藏库
  选项: --store <路径>  覆盖收藏库位置
`;

/**
 * 确定收藏库路径。与插件 `resolveStorePath` 同规则：显式路径 > $DSH_HOME。
 *
 * @param {string | undefined} override - `--store` 的值。
 * @returns {string} notes.json 的绝对路径。
 * @throws {Error} 无法确定位置时。
 */
function resolveStorePath(override) {
  if (override) return isAbsolute(override) ? override : resolve(process.cwd(), override);
  const home = process.env.DSH_HOME;
  if (!home) {
    throw new Error(
      '无法确定收藏库位置：环境变量 DSH_HOME 不存在，请用 --store 指定路径。',
    );
  }
  return join(home, 'storages', 'xhs-rag', 'notes.json');
}

/**
 * 处理单个链接：展开 → 抓取 → 解析。
 *
 * 对应 index.js 的 `resolveCandidate`。脚本里不存在 `ctx.web`，因此总是纯 fetch 路径。
 *
 * @param {{ url: string, kind: 'short' | 'note', raw: string, noteId?: string }} candidate
 * @returns {Promise<object>} 始终带 `status` 的结果条目。
 */
async function resolveCandidate(candidate) {
  let canonical;
  try {
    if (candidate.kind === 'short') {
      const { finalUrl, hops } = await expandShortLink(candidate.url);
      const resolved = resolveNoteFromFinalUrl(finalUrl);
      if (!resolved) {
        return {
          input: candidate.raw,
          status: 'fail',
          reason: `短链展开成功但终点不是小红书笔记页：${finalUrl}`,
          hops,
        };
      }
      canonical = resolved;
    } else {
      canonical = {
        noteId: candidate.noteId,
        canonicalUrl: `https://www.xiaohongshu.com/explore/${candidate.noteId}`,
      };
    }
  } catch (error) {
    return {
      input: candidate.raw,
      status: 'fail',
      reason: `展开短链失败：${error?.message ?? String(error)}`,
    };
  }

  let page;
  try {
    page = await fetchNoteHtml({ url: canonical.canonicalUrl });
  } catch (error) {
    return {
      input: candidate.raw,
      noteId: canonical.noteId,
      status: 'fail',
      reason: `抓取失败：${error?.message ?? String(error)}`,
    };
  }

  const parsed = parseNoteHtml({
    html: page.html,
    noteId: canonical.noteId,
    url: canonical.canonicalUrl,
    statusCode: page.statusCode,
  });

  if (page.truncated) parsed.degraded.push('抓取结果被字符上限截断，正文可能不完整');
  if (page.via === 'plain-fetch') {
    parsed.degraded.push('未经 ctx.web 直接抓取（本脚本没有 web 服务），未做地址安全校验');
  }

  return { input: candidate.raw, ...parsed, status: parsed.usable ? 'ok' : 'degraded', via: page.via };
}

/** @param {object} result @returns {object} 落库记录（字段与插件一致）。 */
function toRecord(result) {
  return {
    noteId: result.noteId,
    url: result.url,
    title: result.title,
    text: result.text,
    author: result.author,
    degraded: result.degraded,
    usable: result.usable,
    importedAt: new Date().toISOString(),
  };
}

/**
 * 导入若干段分享文本。
 *
 * @param {object} options - 选项。
 * @param {object} options.store - 存储句柄。
 * @param {string[]} options.texts - 原始文本块。
 * @returns {Promise<number>} 退出码。
 */
async function runImport({ store, texts }) {
  const { candidates, unrecognised, duplicateCount } = extractNoteLinks(texts);
  const accepted = candidates.slice(0, DEFAULT_MAX_LINKS_PER_IMPORT);
  const skippedByLimit = candidates.length - accepted.length;

  const results = [];
  for (const candidate of accepted) {
    const result = await resolveCandidate(candidate);
    if (result.status !== 'fail') {
      const existed = store.has(result.noteId);
      await store.put(toRecord(result));
      if (existed) result.status = 'updated';
    }
    results.push(result);
    const mark = { ok: 'OK  ', degraded: 'WARN', updated: 'UPD ', fail: 'FAIL' }[result.status];
    console.log(`${mark} ${result.status === 'fail' ? '' : `[${result.noteId}] `}${result.title ?? ''}`.trimEnd());
    if (result.status === 'fail') console.log(`     ${result.reason}`);
    if (result.usable === false && result.status !== 'fail') {
      for (const reason of result.degraded) console.log(`     · ${reason}`);
    }
  }

  const failed = results.filter((r) => r.status === 'fail').length;
  console.log('\n导入汇总:');
  console.log(`  识别链接   ${candidates.length}`);
  console.log(`  成功入库   ${results.filter((r) => r.status === 'ok').length}`);
  console.log(`  内容不完整 ${results.filter((r) => r.status === 'degraded').length}（已入库，正文多为图片）`);
  console.log(`  刷新覆盖   ${results.filter((r) => r.status === 'updated').length}`);
  console.log(`  失败       ${failed}`);
  console.log(`  库内总数   ${store.size()}`);
  console.log(`  收藏库     ${store.filePath}`);
  if (unrecognised.length > 0) {
    console.log(`  跳过       ${unrecognised.length} 个小红书域名但非笔记页的链接：`);
    for (const link of unrecognised) console.log(`             ${link}`);
  }
  if (skippedByLimit > 0) console.log(`  超上限     ${skippedByLimit} 条未处理，请再运行一次`);
  if (duplicateCount > 0) console.log(`  去重       ${duplicateCount} 个重复链接`);
  if (store.loadError) console.log(`  载入提示   ${store.loadError}`);
  if (candidates.length === 0 && unrecognised.length === 0) {
    console.log('\n没有从小红书链接里识别出任何笔记。检查链接是否完整。');
  }

  return failed > 0 ? 1 : 0;
}

/**
 * 检索收藏库。
 *
 * @param {object} options - 选项。
 * @param {object} options.store - 存储句柄。
 * @param {string} options.query - 查询词。
 * @returns {number} 退出码。
 */
function runSearch({ store, query }) {
  const all = store.all();
  const { results, queryTokens, scanned, matchMode, relaxed } = searchNotes(all, query, {
    limit: DEFAULT_MAX_RESULTS,
  });

  console.log(`查询「${query}」 → ${results.length} 条命中`
    + `（matchMode=${matchMode}，库内 ${scanned} 条）`);
  console.log(`分词: ${JSON.stringify(queryTokens)}`);
  if (store.loadError) console.log(`提示: ${store.loadError}`);

  if (scanned === 0) {
    console.log('收藏库是空的，先用本脚本导入一些笔记。');
    return 0;
  }
  if (results.length === 0) {
    console.log('没有命中。检索是纯关键词匹配（没有 embedding），'
      + '换用笔记里可能出现的原词会更容易命中。');
    return 0;
  }
  if (relaxed) {
    console.log('精确匹配（词组）没有命中，本次结果是放宽到单字匹配得到的，'
      + '相关度可能较低；引用前请自行核对 snippet 是否真的切题。');
  }

  for (const hit of results) {
    const note = store.get(hit.noteId);
    const unusable = note?.usable === false;
    console.log(`\n  [${hit.noteId}] ${hit.title ?? '(无标题)'}  score=${hit.score}`
      + `${unusable ? '  degraded' : ''}`);
    console.log(`  ${hit.url}`);
    console.log(`  ${hit.snippet}`);
    if (unusable) console.log(`  ⚠ 内容不完整: ${(note.degraded ?? []).join(' / ')}`);
  }

  const degradedHits = results.filter((r) => store.get(r.noteId)?.usable === false);
  if (degradedHits.length > 0) {
    console.log(`\n${degradedHits.length} 条命中的笔记内容不完整（degraded），引用时需说明。`);
  }
  return 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return 0;
  }

  let storePath;
  try {
    storePath = resolveStorePath(args.storePath);
  } catch (error) {
    console.error(error.message);
    return 2;
  }

  const store = await openNoteStore(storePath);

  if (args.search !== undefined) return runSearch({ store, query: args.search });

  let texts = args.texts;
  if (texts.length === 0) {
    // 没有位置参数时读 stdin，便于整段粘贴分享文案。
    if (process.stdin.isTTY) {
      console.log(USAGE);
      return 1;
    }
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const piped = Buffer.concat(chunks).toString('utf8').trim();
    if (!piped) {
      console.log(USAGE);
      return 1;
    }
    texts = [piped];
  }

  return runImport({ store, texts });
}

// 让 `node tools/xhs-import.mjs` 与将来可能的 import 复用都能工作。
const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  process.exitCode = await main();
}
