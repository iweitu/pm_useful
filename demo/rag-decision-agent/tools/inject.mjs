/**
 * 把构造数据字节级注入交付物（避免手抄 12 条正文出错）。
 * 用法：node tools/inject.mjs [html] [json]（默认 rag-demo-20261006-v4.html + data/xhs-notes-3themes.json）
 * 支持两种目标：含 __MOCK_DATA_JSON__ 占位符的骨架；或已注入过、直接替换 MOCK_DATA 块。
 */
import { readFileSync, writeFileSync } from 'node:fs';

const htmlPath = process.argv[2] || 'rag-demo-20261006-v4.html';
const jsonPath = process.argv[3] || 'data/xhs-notes-3themes.json';
const PLACEHOLDER = '__MOCK_DATA_JSON__';

const json = readFileSync(jsonPath, 'utf8');
for (const bad of ['</script', '<script', '<!--', '-->']) {
  if (json.includes(bad)) throw new Error(`data file contains ${bad}, cannot inline safely`);
}
JSON.parse(json);

const html = readFileSync(htmlPath, 'utf8');
let out;
if (html.split(PLACEHOLDER).length - 1 === 1) {
  out = html.replace(PLACEHOLDER, json.trim());
} else {
  /* 已经注入过：直接把 <script id="rag-data"> 里的 MOCK_DATA 换成新的 */
  const re = /(<script id="rag-data">[\s\S]*?const MOCK_DATA = )([\s\S]*?)(;\s*<\/script>)/;
  if (!re.test(html)) throw new Error(`no placeholder and no MOCK_DATA block in ${htmlPath}`);
  out = html.replace(re, (m, a, _old, c) => a + json.trim() + c);
}
writeFileSync(htmlPath, out, 'utf8');
console.log(`injected ${json.trim().length} chars of JSON from ${jsonPath} into ${htmlPath}`);
