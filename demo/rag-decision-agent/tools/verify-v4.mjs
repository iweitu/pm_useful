/**
 * 验证 rag-demo-20261006-v4.html（产品重构版）。
 *  1. 抽出 #rag-data / #rag-core / #rag-llm 在 Node vm 里跑 —— 测的就是页面真正跑的代码。
 *  2. 两段真实 LLM 回答（有 RAG / 无 RAG）用独立复算的 FNV-1a 逐条校验 promptSha。
 *  3. 静态扫描：信息层级（首屏主角）、去重、删除理解自测、ⓘ 图层、布局加固、离线。
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const HTML = 'rag-demo-20261006-v4.html';
const JSONF = 'data/xhs-notes-3themes.json';
const ANSWERF = 'data/answers-v4.json';
const html = readFileSync(HTML, 'utf8');
const jsonFile = JSON.parse(readFileSync(JSONF, 'utf8'));
const answerFile = JSON.parse(readFileSync(ANSWERF, 'utf8'));

let pass = 0, fail = 0;
const failures = [];
function check(id, name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✅ ${id.padEnd(13)} ${name}${detail ? '  — ' + detail : ''}`); }
  else { fail++; failures.push(`${id} ${name} :: ${detail}`); console.log(`  ❌ ${id.padEnd(13)} ${name}  — ${detail}`); }
}
function section(t) { console.log(`\n=== ${t} ===`); }
const slice = (from, to) => html.slice(html.indexOf(from), to ? html.indexOf(to) : undefined);

function scriptById(id) {
  const m = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`));
  if (!m) throw new Error(`script #${id} not found`);
  return m[1];
}
const dataSrc = scriptById('rag-data');
const coreSrc = scriptById('rag-core');
const uiSrc = scriptById('rag-ui');
const llmSrc = scriptById('rag-llm');

const sandbox = { URL, console, performance };
vm.createContext(sandbox);
vm.runInContext(dataSrc + '\n;globalThis.__data = MOCK_DATA;', sandbox);
vm.runInContext(coreSrc + '\n;globalThis.__core = RAGCore;', sandbox);
vm.runInContext(llmSrc + '\n;globalThis.__llm = LLM_ANSWERS;', sandbox);
const C = sandbox.__core, DATA = sandbox.__data, LLM = sandbox.__llm;

/* ---------- 数据 ---------- */
section('内嵌构造语料');
check('data-1', '内嵌数据与构造数据源逐字段一致', JSON.stringify(DATA) === JSON.stringify(jsonFile), `${DATA.notes.length} 条`);
check('data-2', '12 条 / 3 主题各 4 条 / 可用 10 + 内容不完整 2',
  DATA.notes.length === 12 && DATA.dataset.themes.length === 3
  && DATA.dataset.themes.every((t) => DATA.notes.filter((n) => n.theme === t.id).length === 4)
  && DATA.notes.filter((n) => n.usable !== false).length === 10
  && DATA.notes.filter((n) => n.usable === false).length === 2);
check('data-3', '7 条预置 / 边界问题与数据源一致',
  DATA.dataset.presetQueries.map((p) => p.query).join(',') === '国庆节去哪儿玩,整理我的收藏夹,上海有什么好吃的,油皮粉底液怎么选,钢琴考级怎么报名'
  && DATA.dataset.boundaryReproduction.map((b) => b.query).join(',') === '雪山索道,避雷,的,露营');

/* ---------- 分词 / 分块 / 索引 / 管线 ---------- */
section('核心逻辑（分词 / 分块 / 索引 / 三遍管线）');
const vectors = [
  ['厨房收纳', ['厨', '厨房', '房', '房收', '收', '收纳', '纳']],
  ['冰箱', ['冰', '冰箱', '箱']], ['的', ['的']],
  ['樟脑丸防虫', ['樟', '樟脑', '脑', '脑丸', '丸', '丸防', '防', '防虫', '虫']],
  ['露营', ['露', '露营', '营']], ['免钉', ['免', '免钉', '钉']],
];
for (const [input, expected] of vectors) {
  check('vec', `tokenize("${input}")`, JSON.stringify(C.tokenize(input)) === JSON.stringify(expected), C.tokenize(input).join(' '));
}
const derived = C.deriveChunkParams(DATA.notes);
check('§3.3', '参数由测量推导：中位数 168 → 84 / 17', derived.median === 168 && derived.chunkSize === 84 && derived.overlap === 17);
const built = C.buildChunks(DATA.notes, derived.chunkSize, derived.overlap);
check('AC-4', '去掉重叠后拼接 == 原文（12 条全量）', built.fidelity.ok, `${built.chunks.length} chunk`);
check('FR-4', '至少 3 条切出 ≥2 个 chunk', built.multiCount >= 3, `${built.multiCount}/12`);
for (const [cs, ov] of [[40, 0], [40, 39], [200, 199]]) {
  const b = C.buildChunks(DATA.notes, cs, ov);
  check('AC-4/B14', `chunkSize=${cs}, overlap=${ov} 保真且游标不卡死`, b.fidelity.ok && b.chunks.length > 0, `${b.chunks.length} chunk`);
}
const clamp = C.normaliseParams(10, 9999, null);
check('AC-13', 'overlap ≥ chunkSize 被夹取并提示', clamp.chunkSize === 40 && clamp.overlap === 39 && clamp.messages.length >= 2);
const index = C.buildIndex(built.chunks);
const sumLen = built.chunks.reduce((a, c) => a + c.text.length, 0);
check('AC-5', 'N = chunk 总数 / avgdl = Σ|D|/N', index.N === built.chunks.length && Math.abs(index.avgdl - sumLen / index.N) < 1e-12,
  `N=${index.N}，avgdl=${index.avgdl.toFixed(3)}`);
for (const token of ['上海', '云南', '粉底', '避雷', '道', '国庆']) {
  const manual = built.chunks.filter((c) => c.text.toLowerCase().includes(token)).length;
  check('AC-5', `df("${token}") == 含该词的 chunk 数`, (index.df.get(token) || 0) === manual, `${index.df.get(token) || 0} vs ${manual}`);
}

section('独立重算三遍管线（不复用 core 的 searchPlan）');
const K1 = 1.2, B = 0.75;
function myTokenize(text) {
  if (typeof text !== 'string' || !text) return [];
  const low = text.toLowerCase(); const out = [];
  for (const m of low.match(/[a-z0-9_]+/g) || []) if (m.length >= 2) out.push(m);
  const isCjk = (ch) => /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(ch);
  for (const run of low.split(/[^\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/)) {
    const chars = [...run];
    for (let i = 0; i < chars.length; i++) {
      if (!isCjk(chars[i])) continue;
      out.push(chars[i]);
      if (i + 1 < chars.length && isCjk(chars[i + 1])) out.push(chars[i] + chars[i + 1]);
    }
  }
  return out;
}
const chunks = built.chunks, N = chunks.length;
const docTf = chunks.map((c) => { const m = new Map(); for (const t of myTokenize(c.text)) m.set(t, (m.get(t) || 0) + 1); return m; });
const dfMap = new Map();
docTf.forEach((m) => { for (const t of m.keys()) dfMap.set(t, (dfMap.get(t) || 0) + 1); });
const lens = chunks.map((c) => c.text.length);
const avgdl = lens.reduce((a, b) => a + b, 0) / N;
function myScore(tokens, sourceMap, limit = 5) {
  const out = [];
  chunks.forEach((c, i) => {
    let s = 0; const parts = [];
    for (const t of tokens) {
      const f = docTf[i].get(t) || 0; if (!f) continue;
      const d = dfMap.get(t) || 0;
      s += Math.log(1 + (N - d + 0.5) / (d + 0.5)) * (f * (K1 + 1)) / (f + K1 * (1 - B + B * lens[i] / avgdl));
      parts.push({ token: t, source: sourceMap[t] || 'query' });
    }
    if (s > 0) out.push({ chunkId: c.chunkId, score: s });
  });
  out.sort((a, b) => (b.score !== a.score ? b.score - a.score : (a.chunkId < b.chunkId ? -1 : 1)));
  return out.slice(0, limit);
}
function myPipeline(plan) {
  const sourceMap = {}; plan.searchTokens.forEach((x) => { sourceMap[x.token] = x.source; });
  const loose = plan.originalTokens.filter((t) => [...t].length >= 2 || !C.CJK_STOPWORDS.has(t));
  if (plan.collectionMode) {
    const ft = plan.searchTokens.filter((x) => x.source === 'theme').map((x) => x.token);
    const focus = ft.length ? myScore(ft, sourceMap) : [];
    return { pass: '收藏夹整理', tokenSource: focus.length ? 'mixed' : 'query', results: focus, reason: 'collection' };
  }
  if (!plan.allTokens.length) return { pass: '-', tokenSource: 'query', results: [], reason: 'no-token' };
  if (!plan.originalTokens.length || !loose.length) return { pass: '-', tokenSource: 'query', results: [], reason: 'stopwords-only' };
  const a = myScore(plan.originalPrecise, sourceMap);
  if (a.length) return { pass: '原词精确遍', tokenSource: 'query', results: a, reason: 'ok' };
  const mixed = plan.searchTokens.filter((x) => [...x.token].length >= 2).map((x) => x.token);
  const b = myScore(mixed, sourceMap);
  if (b.length) return { pass: '改写遍（模拟）', tokenSource: 'mixed', results: b, reason: 'ok' };
  const c = myScore(loose, sourceMap);
  return { pass: '放宽遍（单字）', tokenSource: 'query', results: c, reason: c.length ? 'ok' : 'none' };
}
const overview = C.buildCollectionOverview(DATA.notes, built.chunks);
overview.themes.forEach((t) => { t.label = (DATA.dataset.themes.find((x) => x.id === t.id) || {}).name || t.id; });
for (const q of ['国庆节去哪儿玩', '整理我的收藏夹', '上海有什么好吃的', '油皮粉底液怎么选', '钢琴考级怎么报名', '雪山索道', '避雷', '的', '露营']) {
  const plan = C.buildQueryPlan(q);
  const mine = myPipeline(plan);
  const theirs = C.searchPlan(index, chunks, plan, { limit: 5 });
  const sameIds = JSON.stringify(mine.results.map((r) => r.chunkId)) === JSON.stringify(theirs.results.map((r) => r.chunkId));
  const maxDiff = Math.max(0, ...mine.results.map((r, i) => Math.abs(r.score - theirs.results[i].score)));
  check('AC-6/管线', `"${q}" 与独立实现一致`, sameIds && maxDiff < 1e-9 && mine.pass === theirs.pass && mine.tokenSource === theirs.tokenSource && (mine.reason || 'ok') === theirs.reason,
    `pass=${theirs.pass} 来源=${theirs.tokenSource} 命中=${theirs.results.length} 分差=${maxDiff.toExponential(1)}`);
}
const t1 = C.searchPlan(index, chunks, C.buildQueryPlan('油皮粉底液怎么选'), {}).results[0];
const reSum = t1.parts.reduce((a, pt) => {
  const d = index.df.get(pt.token) || 0;
  return a + Math.log(1 + (index.N - d + 0.5) / (d + 0.5)) * (pt.tf * (C.K1 + 1)) / (pt.tf + C.K1 * (1 - C.B + C.B * t1.chars / index.avgdl));
}, 0);
check('AC-6b', 'top-1 分数可按 4.2 公式人工核算（3 位小数一致）', t1.rounded === Math.round(reSum * 1000) / 1000, `页面 ${t1.rounded.toFixed(3)} vs 独立 ${reSum.toFixed(6)}`);

/* ---------- 两段真实 LLM 回答 ---------- */
section('⑨ 两段真实 LLM 回答（有 RAG / 无 RAG）');
const keys = ['国庆节去哪儿玩', '整理我的收藏夹', '上海有什么好吃的', '油皮粉底液怎么选', '钢琴考级怎么报名', '避雷', '雪山索道'];
check('llm-1', '内嵌 7 条 query × {有RAG, 无RAG, 对照小结}',
  Object.keys(LLM).length === 7 && keys.every((k) => LLM[k] && LLM[k].rag && LLM[k].norag && LLM[k].diff));
check('llm-2', '内嵌内容与答案源文件逐字段一致', JSON.stringify(LLM) === JSON.stringify(answerFile));
let ragBad = [], noragBad = [], citeBad = [];
for (const q of keys) {
  const plan = C.buildQueryPlan(q);
  const res = C.searchPlan(index, chunks, plan, {});
  const ragP = C.buildPrompt({
    query: q, plan, results: res.results, overview: plan.collectionMode ? overview : null,
    pass: res.pass, tokenSource: res.tokenSource, generic: C.genericNotesFor(plan.intent.id)
  });
  const noP = C.buildNoRagPrompt(q);
  const rec = LLM[q];
  if (rec.rag.promptSha !== C.hashText(ragP.text) || rec.rag.promptLen !== ragP.text.length) ragBad.push(q);
  if (rec.norag.promptSha !== C.hashText(noP.text) || rec.norag.promptLen !== noP.text.length) noragBad.push(q);
  const citeCount = (plan.collectionMode && !res.results.length) ? DATA.notes.length : res.results.length;
  for (const p of rec.rag.paragraphs) for (const ci of p.c) if (!(ci >= 1 && ci <= citeCount)) citeBad.push(`${q}:${ci}`);
}
check('llm-3', '有 RAG 那段的 promptSha / promptLen 与当前有 RAG prompt 严格一致',
  ragBad.length === 0, ragBad.length ? '不一致：' + ragBad.join('、') : '7/7 一致（独立复算 FNV-1a）');
check('llm-4', '无 RAG 那段的 promptSha / promptLen 与当前基线 prompt 严格一致',
  noragBad.length === 0, noragBad.length ? '不一致：' + noragBad.join('、') : '7/7 一致');
check('llm-5', '有 RAG 那段的引用编号都能落到真实引用上', citeBad.length === 0, citeBad.join(' ') || '全部在范围内');
check('llm-6', '两段回答都不含置信度 / 相似度 / 概率数字',
  !/置信度|相似度|概率|\d{1,3}%/.test(keys.map((k) => LLM[k].rag.paragraphs.map((p) => p.t).join('') + LLM[k].norag.paragraphs.map((p) => p.t).join('')).join('\n')));
check('llm-7', '每段都标了模型与生成时间',
  keys.every((k) => LLM[k].rag.model && LLM[k].rag.generatedAt && LLM[k].norag.model && LLM[k].norag.generatedAt),
  LLM[keys[0]].rag.model + ' · ' + LLM[keys[0]].norag.generatedAt);
check('llm-8', '每条 query 都有人工对照小结', keys.every((k) => LLM[k].diff.length > 20));
check('llm-9', '两段内容明显不同（不是同一段复制两遍）',
  keys.every((k) => LLM[k].rag.paragraphs.map((p) => p.t).join('') !== LLM[k].norag.paragraphs.map((p) => p.t).join('')));
check('llm-10', '有 RAG 段落区分「收藏内容 / 非收藏库内容」',
  keys.filter((k) => LLM[k].rag.paragraphs.some((p) => p.g === true)).length >= 6);
check('llm-11', '无 RAG 段落不含任何引用标记', keys.every((k) => LLM[k].norag.paragraphs.every((p) => !p.c && !/\[收藏\s*\d+\]/.test(p.t))));

/* ---------- ⑧ 两份 prompt ---------- */
section('⑧ Prompt：有 RAG / 无 RAG 两份');
const q0 = '上海有什么好吃的';
const plan0 = C.buildQueryPlan(q0);
const res0 = C.searchPlan(index, chunks, plan0, {});
const ragPrompt = C.buildPrompt({ query: q0, plan: plan0, results: res0.results, overview: null, pass: res0.pass, tokenSource: res0.tokenSource, generic: C.genericNotesFor(plan0.intent.id) });
const noRagPrompt = C.buildNoRagPrompt(q0);
check('FR-9', '有 RAG prompt 含 意图说明 / 收藏引用 / 其他参考内容（非收藏库）/ 用户问题',
  ['【本次意图与检索说明】', '【用户收藏库引用】', '【其他参考内容（非收藏库）】', '【用户问题】'].every((s) => ragPrompt.text.includes(s)));
check('FR-9', '无 RAG prompt 只有角色规则 + 用户问题（不给收藏、不要出处）',
  noRagPrompt.text.includes('没有提供任何私人资料') && noRagPrompt.text.includes('不需要标注出处')
  && !noRagPrompt.text.includes('用户收藏') && noRagPrompt.chars < 200, `${noRagPrompt.chars} 字符`);
check('FR-9', '收藏夹整理时 prompt 带整库总览',
  (() => {
    const p = C.buildQueryPlan('整理我的收藏夹');
    const r = C.searchPlan(index, chunks, p, {});
    const pr = C.buildPrompt({ query: '整理我的收藏夹', plan: p, results: r.results, overview, pass: r.pass, tokenSource: r.tokenSource, generic: C.genericNotesFor('organize') });
    return pr.text.includes('【用户收藏库总览】') && overview.themes.every((t) => pr.text.includes(t.notes[0].title));
  })());
check('FR-9', '无命中时 prompt 留明确指令而不是留空',
  (() => {
    const p = C.buildQueryPlan('露营');
    const pr = C.buildPrompt({ query: '露营', plan: p, results: [], overview: null, pass: '放宽遍（单字）', tokenSource: 'query', generic: C.genericNotesFor('generic') });
    return pr.text.includes('收藏里没有找到') && pr.chunkCount === 0;
  })());

/* ---------- 结构 / 层级 / 删除项 ---------- */
section('信息层级与删除项（PM 重构）');
const idxAsk = html.indexOf('id="secAsk"'), idxDecision = html.indexOf('id="secDecision"'), idxLayout = html.indexOf('<div class="layout">');
check('层级-1', '「我的问题」与「最终决策建议」都在细节区之前（首屏主角）',
  idxAsk > 0 && idxDecision > idxAsk && idxLayout > idxDecision,
  `secAsk@${idxAsk} secDecision@${idxDecision} layout@${idxLayout}`);
check('层级-2', '两块主角有独立的视觉强调（左边框 + 独立配色）',
  html.includes('.ask{border:1px solid var(--accent-line);border-left:6px solid var(--accent)')
  && html.includes('.decision{border:1px solid var(--real-line);border-left:6px solid var(--real)'));
check('层级-3', '决策建议是双栏对比（有 RAG / 无 RAG）',
  html.includes('.cmp{display:grid;gap:12px;grid-template-columns:minmax(0,1fr) minmax(0,1fr)')
  && uiSrc.includes('cmp-card rag') && uiSrc.includes('cmp-card norag'));
check('层级-4', '机制细节降级：③④⑤ 收进「预处理」折叠模块',
  /id="secPrep"[\s\S]*id="secChunk"[\s\S]*id="secToken"[\s\S]*id="secIndex"[\s\S]*<\/details>/.test(html)
  && !/id="secChunk" open/.test(html) && !/id="secPrep" open/.test(html));
check('层级-5', '⑥⑦⑧ 默认收起（表头带关键数字）',
  !/id="secPlan" open/.test(html) && !/id="secScore" open/.test(html) && !/id="secPrompt" open/.test(html)
  && uiSrc.includes("setSum('sumPlan'") && uiSrc.includes("setSum('sumScore'") && uiSrc.includes("setSum('sumPrompt'"));
check('层级-6', '⑦ 不再重复列引用（引用只出现在决策建议里）',
  !slice('id="secScore"', 'id="secPrompt"').includes('cite-group') && !slice('id="secScore"', 'id="secPrompt"').includes('收藏出处')
  && uiSrc.includes('引用列表只在「最终决策建议」里出现'),
  '⑦ 里没有引用列表代码');
check('删除-1', '理解自测的功能已删除（只保留「已删除」的文字说明）',
  !html.includes('id="secQuiz"') && !uiSrc.includes('data-quiz') && !uiSrc.includes('function answerQuiz')
  && !uiSrc.includes('var QUIZ') && !/<input type="radio" name="q\d"/.test(html)
  && C.EVENT_TYPES.indexOf('quiz_submit') === -1);
check('删除-2', '事件类型降为 8 类（去掉 link_parse 与 quiz_submit）',
  C.EVENT_TYPES.join(',') === 'demo_load,index_build,query_submit,query_result,prompt_preview,answer_render,sim_badge_view,export_events',
  C.EVENT_TYPES.length + ' 类');
check('层级-7', '顶部流程条把核心流程串成一条线（收藏 → 预处理 → 提问 → 检索 → 有/无 RAG 建议）',
  html.includes('class="flow"') && /你的收藏 12 条[\s\S]*预处理[\s\S]*我的问题[\s\S]*检索（BM25[\s\S]*有 RAG 的建议[\s\S]*无 RAG 的通用回答/.test(html));
check('层级-8', '模块总数从 12 降到 7（顶层层级更少）',
  (html.match(/<details class="mod"/g) || []).length === 7,
  (html.match(/<details class="mod"/g) || []).length + ' 个顶层模块');

/* ---------- 静态扫描 ---------- */
section('静态扫描（离线 / 标记 / ⓘ / 布局加固）');
for (const api of ['fetch(', 'new XMLHttpRequest', 'XMLHttpRequest()', 'new WebSocket', 'new EventSource', '.sendBeacon(', 'importScripts(', 'navigator.serviceWorker']) {
  check('net', `不出现可发请求的调用 ${api}`, !html.includes(api));
}
check('net-2', '没有 <script src / <link / <img / @import / url(http', !/<script[^>]+src=/i.test(html)
  && !/<link\b/i.test(html) && !/<img\b/i.test(html) && !/@import/i.test(html) && !/url\(\s*['"]?https?:/i.test(html));
const externalHttp = [...html.matchAll(/https?:\/\/[^\s"'`)<]+/g)].map((m) => m[0])
  .filter((u) => !u.includes('xiaohongshu.com') && !u.includes('xhslink.') && !u.includes('w3.org'));
check('net-3', 'HTML 里的 http(s) 只有数据里的示例链接', externalHttp.length === 0, externalHttp.slice(0, 3).join(' '));
check('B10', '不持久化：无 localStorage / sessionStorage / cookie',
  !html.includes('localStorage') && !html.includes('sessionStorage') && !html.includes('document.cookie'));
check('体积', '单文件体积 < 200KB（R5）', Buffer.byteLength(html, 'utf8') < 200 * 1024, (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1) + ' KB');
const slots = [...html.matchAll(/data-badge="(\d)"/g)].map((m) => m[1]);
check('AC-15', '7 个环节标记槽位齐全（③–⑨，文档顺序里 ⑨ 在首屏主角、机制在后）',
  slots.slice().sort().join(',') === '3,4,5,6,7,8,9', slots.join(','));
check('AC-15b', 'STAGES：7 条 / 4 真实 + 1 真实 LLM + 1 模拟 + 1 混合',
  (uiSrc.match(/kind: '(real|sim|mix|llm)'/g) || []).length === 7
  && (uiSrc.match(/kind: 'real'/g) || []).length === 4 && (uiSrc.match(/kind: 'llm'/g) || []).length === 1
  && (uiSrc.match(/kind: 'mix'/g) || []).length === 1);
check('AC-15c', '图例写明四类标记，且写明 🔶 的结果是预置的',
  html.includes('四类标记') && html.includes('🔶 的结果是预置的，不是计算出来的'));
check('R1', '写明与 xhs-rag 算法不同、结论不可外推', html.includes('xhs-rag') && html.includes('不可外推'));
check('R3', '构造数据声明在顶部可见', html.includes('不是真实小红书内容'));
const infoCount = (html.match(/class="info"/g) || []).length;
check('说明符号', 'ⓘ 说明齐备且内容仍在 DOM 里', infoCount >= 10 && (html.match(/class="tip( left| right)?"/g) || []).length === infoCount, `${infoCount} 个 ⓘ`);
check('说明符号-2', '说明渲染到固定视口图层（宽高显式，不会被 16px 容器压扁）',
  html.includes('.tiplayer{position:fixed') && html.includes('.info .tip{display:none!important}')
  && !html.includes('.info:hover .tip') && html.includes('width:470px;max-width:calc(100vw - 24px)'));
check('布局加固', '容器不会被压成竖线（.grow / flow-root / box 宽度 / sum 弹性）',
  html.includes('.row>.grow') && html.includes('.mbody{display:flow-root') && html.includes('.box{width:100%}')
  && html.includes('.sum{flex:1 1 auto;min-width:0;'));
check('布局自检', '页面内置布局自检（父宽子窄才算异常）',
  uiSrc.includes('function layoutAudit') && uiSrc.includes('w < 48 && pw > 200'));
check('self', '页面内置 selfCheck 并输出 SELFCHECK', uiSrc.includes('SELFCHECK:'));
check('常量', 'k1=1.2 / b=0.75 / topK=5 / padding=60', C.K1 === 1.2 && C.B === 0.75 && C.TOP_K === 5 && C.SNIPPET_PADDING === 60);

console.log(`\n================ 结果：${pass} 通过 / ${fail} 失败 ================`);
if (failures.length) { console.log('失败明细：'); failures.forEach((f) => console.log(' - ' + f)); process.exitCode = 1; }
