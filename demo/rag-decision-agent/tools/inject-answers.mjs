/** 把真实 LLM 回答 JSON 注入 v4 的 __LLM_ANSWERS_JSON__ 占位符。 */
import { readFileSync, writeFileSync } from 'node:fs';

const htmlPath = process.argv[2] || 'rag-demo-20261006-v4.html';
const jsonPath = process.argv[3] || 'data/answers-v4.json';
const PLACEHOLDER = '__LLM_ANSWERS_JSON__';

const json = readFileSync(jsonPath, 'utf8');
for (const bad of ['</script', '<script', '<!--', '-->']) {
  if (json.includes(bad)) throw new Error(`answers file contains ${bad}`);
}
const parsed = JSON.parse(json);
const keys = Object.keys(parsed);
if (keys.length !== 7) throw new Error(`expected 7 queries, got ${keys.length}`);
for (const k of keys) {
  const r = parsed[k];
  if (!r.rag || !r.norag || !r.diff) throw new Error(`${k}: missing rag/norag/diff`);
  if (!r.rag.promptSha || !r.norag.promptSha) throw new Error(`${k}: missing promptSha`);
  for (const p of r.rag.paragraphs) if (typeof p.t !== 'string' || !Array.isArray(p.c)) throw new Error(`${k}: bad rag paragraph`);
  for (const p of r.norag.paragraphs) if (typeof p.t !== 'string') throw new Error(`${k}: bad norag paragraph`);
}

const html = readFileSync(htmlPath, 'utf8');
const count = html.split(PLACEHOLDER).length - 1;
if (count !== 1) throw new Error(`expected exactly 1 placeholder, found ${count}`);
writeFileSync(htmlPath, html.replace(PLACEHOLDER, json.trim()), 'utf8');
console.log(`injected ${keys.length} queries (rag+norag+diff) into ${htmlPath}`);
