/** 从 v4 交付物里提取「事实真值」，用于更新 PRD（避免凭记忆写数字）。 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync('rag-demo-20261006-v4.html', 'utf8');
const g = (id) => html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`))[1];
const sb = { URL, console, performance };
vm.createContext(sb);
vm.runInContext(g('rag-data') + ';globalThis.D=MOCK_DATA;', sb);
vm.runInContext(g('rag-core') + ';globalThis.C=RAGCore;', sb);
vm.runInContext(g('rag-llm') + ';globalThis.L=LLM_ANSWERS;', sb);
const C = sb.C, D = sb.D, L = sb.L;
const ui = g('rag-ui');

const p = C.deriveChunkParams(D.notes);
const built = C.buildChunks(D.notes, p.chunkSize, p.overlap);
const index = C.buildIndex(built.chunks);
const ov = C.buildCollectionOverview(D.notes, built.chunks);
const perTheme = ov.themes.map((t) => `${t.id}:${t.count}条(可用${t.usable}/不完整${t.degraded})`).join(' ');

console.log('### 分块/索引真值');
console.log(`  正文长度中位数=${p.median} chunkSize=${p.chunkSize} overlap=${p.overlap}`);
console.log(`  N(chunk) =${index.N}  词典=${index.vocabSize}  Σ|D|=${index.totalChars}  avgdl=${C.round3(index.avgdl)}`);
console.log(`  保真=${built.fidelity.ok ? '12/12 通过' : '失败'}  ≥2块笔记=${built.multiCount}/12`);
console.log(`  单篇块数分布 = ${built.perNote.map((n) => n.count).join(',')}`);

console.log('\n### 语料真值');
console.log(`  笔记=${D.notes.length}  可用=${ov.usable}  不完整=${ov.degraded}  主题=${ov.themeCount}（${perTheme}）`);
console.log(`  不完整原因：`);
D.notes.filter((n) => n.usable === false).forEach((n) => console.log(`    · ${n.noteId.slice(-4)} ${n.title} —— ${n.degraded[0].slice(0, 40)}…`));

console.log('\n### 环节（STAGES）');
[...ui.matchAll(/\{ n: '([^']+)', badge: (\d+), name: '([^']+)', kind: '([^']+)', prd: '([^']+)' \}/g)]
  .forEach((m) => console.log(`  ${m[1]} ${m[3].padEnd(22)} kind=${m[4].padEnd(5)} ${m[5]}`));

console.log('\n### 预置 / 边界 query 与结果态');
for (const pq of D.dataset.presetQueries) {
  const plan = C.buildQueryPlan(pq.query);
  const res = C.searchPlan(index, built.chunks, plan, {});
  console.log(`  [预置] ${pq.query.padEnd(9)} 意图=${plan.intent.id.padEnd(9)} pass=${(res.pass || '-').padEnd(12)} 来源=${res.tokenSource} 命中=${res.results.length}`);
}
for (const bq of D.dataset.boundaryReproduction) {
  const plan = C.buildQueryPlan(bq.query);
  const res = C.searchPlan(index, built.chunks, plan, {});
  console.log(`  [边界] ${bq.query.padEnd(9)} pass=${(res.pass || '-').padEnd(12)} mode=${res.matchMode.padEnd(9)} reason=${res.reason} 命中=${res.results.length}`);
}

console.log('\n### 事件类型（' + C.EVENT_TYPES.length + ' 类）');
console.log('  ' + C.EVENT_TYPES.join(', '));

console.log('\n### 真实 LLM 回答');
Object.keys(L).forEach((k) => {
  const r = L[k];
  console.log(`  ${k.padEnd(9)} 有RAG: sha=${r.rag.promptSha} len=${r.rag.promptLen} 段=${r.rag.paragraphs.length} 引用=${r.rag.paragraphs.reduce((a, x) => a + x.c.length, 0)} | 无RAG: sha=${r.norag.promptSha} len=${r.norag.promptLen} 段=${r.norag.paragraphs.length} | 小结=${r.diff.length}字`);
});

console.log('\n### 页面结构');
console.log(`  顶层折叠模块 = ${(html.match(/<details class="mod"/g) || []).length}`);
console.log(`  ⓘ 说明符号 = ${(html.match(/class="info"/g) || []).length}`);
console.log(`  环节标记槽位 = ${[...html.matchAll(/data-badge="(\d)"/g)].map((m) => m[1]).join(',')}`);
console.log(`  自检项 = ${(ui.match(/add\('/g) || []).length} 条`);
console.log(`  文件体积 = ${(Buffer.byteLength(html, 'utf8') / 1024).toFixed(1)} KB`);
console.log(`  内嵌数据 = ${(g('rag-data').length / 1024).toFixed(1)} KB，回答 = ${(g('rag-llm').length / 1024).toFixed(1)} KB，核心 = ${(g('rag-core').length / 1024).toFixed(1)} KB，UI = ${(ui.length / 1024).toFixed(1)} KB`);
