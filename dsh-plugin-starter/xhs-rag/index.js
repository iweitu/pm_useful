/**
 * @local/xhs-rag —— 小红书收藏库 + 关键词检索。
 *
 * 提供两个模型可见工具：
 *   - `xhs_import`  粘贴分享文本 → 展开短链 → 抓取 → 解析 → 落库
 *   - `xhs_search`  关键词检索收藏库
 *
 * 设计上的两个关键取舍（都有实证依据，不是偏好）：
 *
 * 1. **不做 embedding。** DeepSeek 不提供 embedding API，本安装包里也没有任何
 *    向量检索包。纯关键词打分让"为什么命中"完全可解释 —— 命中的 token 会随结果
 *    一起返回，这正是 demo 里需要看到的东西。
 *
 * 2. **降级信息必须传到模型，不能只写日志。** 小红书笔记页是 JS 渲染的，
 *    纯 HTTP 只能拿到 meta description。图片型笔记（正文就一句"看图"）抓回来
 *    几乎是空的。这类笔记**会入库**（用户可以事后补），但检索结果里会带上
 *    `degraded`/`usable` 标记，让模型知道"这条内容不完整"，而不是把它当权威内容引用。
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import z from '@deepseek-ai/schemastery';

import { extractNoteLinks, isShortLink, resolveNoteFromFinalUrl } from './urls.js';
import { parseNoteHtml } from './parse.js';
import { searchNotes } from './search.js';
import { openNoteStore } from './store.js';
import { expandShortLink, fetchNoteHtml } from './fetch-note.js';

/** 工具名。避开内置工具与保留名（`run_code` 被 PTC 传输占用）。 */
const IMPORT_TOOL = 'xhs_import';
const SEARCH_TOOL = 'xhs_search';

/** 检索结果里附带降级标记的截断长度，避免把整段诊断塞进每次请求。 */
const DEGRADED_NOTE_MAX = 200;

/**
 * 把返回值渲染成模型可读的紧凑 JSON。
 *
 * 不用 `JSON.stringify(value, null, 2)`：缩进在每次工具调用上都要花 token，
 * 而这里的数据是给模型读的结构化结果，不是给人读的报告。
 *
 * @param {unknown} value - 工具返回值。
 * @returns {Array<{ type: 'text', text: string }>}
 */
function renderJson(value) {
  return [{ type: 'text', text: JSON.stringify(value) }];
}

/**
 * 处理单个链接：展开 → 抓取 → 解析。
 *
 * @param {object} input - 输入。
 * @param {{ url: string, kind: 'short' | 'note', raw: string, noteId?: string }} input.candidate
 *   来自 `extractNoteLinks` 的候选。
 * @param {object | undefined} input.web - `ctx.web`。
 * @param {AbortSignal | undefined} input.signal - 取消信号。
 * @returns {Promise<object>} 结果条目，始终带 `status`。
 */
async function resolveCandidate({ candidate, web, signal }) {
  let canonical;
  try {
    if (candidate.kind === 'short') {
      const { finalUrl, hops } = await expandShortLink(candidate.url, { signal });
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
    page = await fetchNoteHtml({ url: canonical.canonicalUrl, web, signal });
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

  if (page.truncated) {
    parsed.degraded.push('抓取结果被字符上限截断，正文可能不完整');
  }
  if (page.via === 'plain-fetch') {
    parsed.degraded.push('未经 ctx.web 直接抓取（组合里没有 web 服务），未做地址安全校验');
  }

  return {
    input: candidate.raw,
    ...parsed,
    status: parsed.usable ? 'ok' : 'degraded',
    via: page.via,
  };
}

/**
 * 注册 `xhs_import`：把粘贴的分享文本导入收藏库。
 *
 * @param {object} ctx - Cordis 上下文。
 * @param {object} config - 已解析配置。
 * @param {() => Promise<object>} getStore - 存储句柄的惰性 getter。
 */
function registerImportTool(ctx, config, getStore) {
  ctx.tools.register(defineTool({
    name: IMPORT_TOOL,
    description:
      'Import Xiaohongshu (小红书) notes into the local collection by pasting share text '
      + 'or note links. Accepts both short links (xhslink.com / xhslink.cn) and full note '
      + 'URLs. Returns a per-link report; entries marked "degraded" were stored but have '
      + 'incomplete text (typically image-first notes) and should not be quoted as '
      + 'authoritative content.',
    parameters: {
      text: {
        type: 'array',
        required: true,
        items: { type: 'string' },
        description:
          'Raw share text blocks or bare note links, one entry per pasted message. '
          + 'Text may contain surrounding prose, emoji and full-width punctuation.',
      },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => renderJson(value),
    },
    timeoutMs: 120000,
    // 导入会写文件，且展开短链依赖网络；并发调用容易互相覆盖，标为非并发安全。
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const store = await getStore();
      const { candidates, unrecognised, duplicateCount } = extractNoteLinks(args.text ?? []);

      const limit = config.maxLinksPerImport;
      const accepted = candidates.slice(0, limit);
      const skippedByLimit = candidates.length - accepted.length;

      const results = [];
      let imported = 0;
      let skipped = 0;
      let degraded = 0;
      let failed = 0;

      for (const candidate of accepted) {
        if (exec?.signal?.aborted) {
          results.push({ input: candidate.raw, status: 'fail', reason: '调用被取消' });
          failed += 1;
          continue;
        }

        const result = await resolveCandidate({ candidate, web: ctx.get('web'), signal: exec?.signal });

        if (result.status === 'fail') {
          failed += 1;
        } else if (store.has(result.noteId)) {
          // 已存在：覆盖，让用户重新粘贴即可刷新内容（笔记可能被编辑过）。
          await store.put({
            noteId: result.noteId,
            url: result.url,
            title: result.title,
            text: result.text,
            author: result.author,
            degraded: result.degraded,
            usable: result.usable,
            importedAt: new Date().toISOString(),
          });
          result.status = 'updated';
          skipped += 1;
        } else {
          await store.put({
            noteId: result.noteId,
            url: result.url,
            title: result.title,
            text: result.text,
            author: result.author,
            degraded: result.degraded,
            usable: result.usable,
            importedAt: new Date().toISOString(),
          });
          if (result.usable) imported += 1;
          else degraded += 1;
        }

        results.push(result);
      }

      const unusable = results.filter((r) => r.status === 'degraded');
      const notes = [];

      if (unrecognised.length > 0) {
        notes.push(
          `${unrecognised.length} 个链接属于小红书域名但不是笔记页（例如用户主页），已跳过`,
        );
      }
      if (skippedByLimit > 0) {
        notes.push(`超过单次上限 ${limit}，还有 ${skippedByLimit} 条未处理，请再粘贴一次`);
      }
      if (duplicateCount > 0) {
        notes.push(`${duplicateCount} 个重复链接已去重`);
      }
      if (unusable.length > 0) {
        notes.push(
          `${unusable.length} 条已入库但内容不完整（多为图片型笔记，纯文本抓取无法还原图片）`
          + '，检索结果里会带 degraded 标记',
        );
      }
      if (store.loadError) {
        notes.push(`存储载入提示：${store.loadError}`);
      }

      return {
        total: candidates.length,
        imported,
        degraded,
        updated: skipped,
        failed,
        unrecognised: unrecognised.length,
        totalInStore: store.size(),
        notes,
        results: results.slice(0, config.maxLinksPerImport + 1),
        unrecognisedLinks: unrecognised,
      };
    },
  }));
}

/**
 * 注册 `xhs_search`：在收藏库里做关键词检索。
 *
 * @param {object} ctx - Cordis 上下文。
 * @param {object} config - 已解析配置。
 * @param {() => Promise<object>} getStore - 存储句柄的惰性 getter。
 */
function registerSearchTool(ctx, config, getStore) {
  ctx.tools.register(defineTool({
    name: SEARCH_TOOL,
    description:
      'Search the local Xiaohongshu (小红书) collection by keyword and return matching notes. '
      + 'Call this whenever the user refers to their 收藏 / saved posts / bookmarks. '
      + 'Each result carries a "degraded" flag: a degraded note is stored but its text is '
      + 'incomplete (usually an image-first post), so mention that limitation instead of '
      + 'treating the text as the full content.',
    parameters: {
      query: {
        type: 'string',
        required: true,
        description: 'Keywords to search for, in the user\'s own wording.',
      },
      limit: {
        type: 'number',
        description: `Maximum results to return (default ${config.maxResults}, max ${config.maxResults}).`,
      },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => renderJson(value),
    },
    // 纯内存读取 + 无副作用。
    isConcurrencySafe: () => true,
    async execute(args) {
      const store = await getStore();
      const requested = Number.isFinite(args.limit) ? Number(args.limit) : config.maxResults;
      const limit = Math.max(1, Math.min(Math.trunc(requested), config.maxResults));

      const all = store.all();
      const { results, queryTokens, scanned, matchMode, relaxed } = searchNotes(
        all,
        args.query ?? '',
        { limit },
      );

      const notes = [];
      if (scanned === 0) {
        notes.push('收藏库是空的，先用 xhs_import 导入一些笔记');
      } else if (results.length === 0) {
        notes.push(
          `在 ${scanned} 篇笔记里没有命中。检索是纯关键词匹配（没有 embedding），`
          + '换用笔记里可能出现的原词会更容易命中',
        );
      } else if (relaxed) {
        notes.push(
          '精确匹配（词组）没有命中，本次结果是放宽到单字匹配得到的，相关度可能较低；'
          + '引用前请自行核对 snippet 是否真的切题',
        );
      }
      if (config.surfaceDegraded) {
        const degradedHits = results.filter((r) => !store.get(r.noteId)?.usable);
        if (degradedHits.length > 0) {
          notes.push(`${degradedHits.length} 条命中的笔记内容不完整（degraded）`);
        }
      }

      return {
        query: args.query,
        queryTokens,
        matchMode,
        scanned,
        totalInStore: all.length,
        hits: results.map((hit) => {
          const note = store.get(hit.noteId);
          const entry = {
            noteId: hit.noteId,
            title: hit.title,
            author: hit.author,
            url: hit.url,
            snippet: hit.snippet,
            score: hit.score,
            matchedTokens: hit.matchedTokens,
            degraded: note?.usable === false,
          };
          if (note?.usable === false && config.surfaceDegraded) {
            entry.degradedReasons = (note.degraded ?? [])
              .map((reason) => (reason.length > DEGRADED_NOTE_MAX
                ? `${reason.slice(0, DEGRADED_NOTE_MAX)}…`
                : reason))
              .slice(0, 3);
          }
          return entry;
        }),
        notes,
      };
    },
  }));
}

/**
 * 注册 system prompt 段。
 *
 * 这是整套设计里唯一的"行为引导"：如果不告诉模型什么时候该检索，
 * 它会对每个问题都去查收藏库。"提到收藏才查"这个约束必须显式写出来。
 *
 * @param {object} ctx - Cordis 上下文。
 * @param {object} config - 已解析配置。
 */
function registerPromptSection(ctx, config) {
  ctx.systemPrompt.section({
    name: 'tool:xhs-rag',
    // 100 附近是工具指导类段落的位置；用固定值避免依赖 getSectionOrder 的具名表。
    order: 150,
    // 用函数形式而不是静态字符串：函数每次组装都重新求值，因此段落里的工具名
    // 与实际注册的工具名永远一致，不会因为改名而留下过期文案。
    text: ({ scope }) => {
      // 该 agent 看不到这两个工具时（例如被 restrict 掉）就不贡献任何文本。
      if (ctx.tools.get(SEARCH_TOOL, scope) === undefined
          && ctx.tools.get(IMPORT_TOOL, scope) === undefined) {
        return '';
      }
      return [
        `## 小红书收藏库`,
        ``,
        `本会话挂载了本地小红书收藏库（工具：\`${IMPORT_TOOL}\`、\`${SEARCH_TOOL}\`）。`,
        ``,
        `- **只有当用户提到「收藏」「我存的」「收藏夹」或明显在指代自己保存过的内容时，才调用 \`${SEARCH_TOOL}\`。** 其他情况不要检索，不要主动把收藏内容塞进回答。`,
        `- 检索是纯关键词匹配（没有向量检索）。没命中时换用更朴素的词再试一次，而不是直接告诉用户没有。`,
        `- 用户粘贴小红书分享链接或分享文案时，用 \`${IMPORT_TOOL}\` 导入。导入报告里标 \`degraded\` 的条目内容不完整（小红书正文常在图里，纯文本抓不到），引用时必须说明这一点。`,
        `- 收藏库是本地文件，不是会话日志的一部分；不要声称你"记得"之前导入过什么，除非检索结果里有。`,
      ].join('\n');
    },
  });
}

/** 由 `config` 解析存储文件路径。 */
function resolveStorePath(config) {
  const home = config.homeDir || process.env.DSH_HOME || '';
  if (!home) {
    throw new Error(
      '@local/xhs-rag: 无法确定收藏库位置。请设置配置项 homeDir，或确保 DSH_HOME 环境变量存在。',
    );
  }
  return { home, path: `${home}/storages/xhs-rag/notes.json` };
}

/**
 * 插件配置。用户可在 cordis.patch.yml 的这一行里覆盖。
 *
 * 必须用 schemastery 的调用形式（`z.natural().default(5)`），不能写成
 * `{ type: 'natural', default: 5 }` 这种字面量：`Schema.from()` 只接受原生类型、
 * 构造函数或已经是 schema 的值，传普通对象会抛
 * `cannot infer schema from [object Object]`，插件直接加载不了。
 */
export const Config = z.object({
  /** 留空时回退到 $DSH_HOME。收藏库落在 <homeDir>/storages/xhs-rag/notes.json。 */
  homeDir: z.string().default(''),
  /** 单次检索返回上限，同时也是工具 schema 里声明的上限。 */
  maxResults: z.natural().default(5),
  /** 单次导入处理的链接上限；超出的部分会在报告里说明。 */
  maxLinksPerImport: z.natural().default(20),
  /** 检索结果里是否附带 degraded 原因。 */
  surfaceDegraded: z.boolean().default(true),
});

/**
 * 用 `ctx.inject` 而不是 `inject` 数组来挂载。
 *
 * 差别很重要：`inject` 只声明依赖并在缺失时阻止激活，而 `ctx.inject([...], callback)`
 * 保证**回调只在服务齐全时运行**，服务消失时自动重放。这里三个服务都是硬依赖
 * （没有 `ctx.tools` 就无从注册工具，没有 `ctx.systemPrompt` 就写不了引导文本），
 * 所以用后者，让组合缺服务时明确地什么都不做，而不是抛错。
 */
export function apply(ctx, config) {
  const { path } = resolveStorePath(config);

  // 存储的打开是异步的，但 apply 必须同步。用惰性 promise 让两个工具共享同一次打开，
  // 避免并发首调重复读文件。
  let storePromise;
  const getStore = () => {
    storePromise ??= openNoteStore(path);
    return storePromise;
  };

  ctx.inject(['tools', 'systemPrompt'], (scoped) => {
    registerImportTool(scoped, config, getStore);
    registerSearchTool(scoped, config, getStore);
    registerPromptSection(scoped, config);
  });
}
