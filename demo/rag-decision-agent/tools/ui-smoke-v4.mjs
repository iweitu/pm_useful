/**
 * UI 冒烟测试（v4 产品重构版）：最小 DOM 垫片跑交付物里的 #rag-ui。
 * 重点覆盖：信息层级（问题/建议是主角）、有 RAG / 无 RAG 对照、理解自测已删除、ⓘ 图层、折叠。
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync('rag-demo-20261006-v4.html', 'utf8');
let pass = 0, fail = 0; const failures = [];
function section(t) { console.log(`\n=== ${t} ===`); }
function check(id, name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✅ ${id.padEnd(11)} ${name}${detail ? '  — ' + detail : ''}`); }
  else { fail++; failures.push(`${id} ${name} :: ${detail}`); console.log(`  ❌ ${id.padEnd(11)} ${name}  — ${detail}`); }
}
section('UI 冒烟（最小 DOM 垫片 · v4）');

const VOID = new Set(['META', 'INPUT', 'BR', 'IMG', 'LINK', 'HR']);
const RAWTEXT = new Set(['SCRIPT', 'STYLE', 'TITLE']);
class El {
  constructor(tag) {
    this.tagName = String(tag || '').toUpperCase();
    this.attrs = {}; this.children = []; this.parentNode = null;
    this._listeners = []; this.checked = false; this.disabled = false;
    this.open = false; this._value = ''; this._text = ''; this.style = {};
  }
  get id() { return this.attrs.id || ''; }
  set id(v) { this.attrs.id = String(v); }
  getAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attrs, n) ? this.attrs[n] : null; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  get classList() {
    const self = this;
    const list = () => String(self.attrs.class || '').split(/\s+/).filter(Boolean);
    return {
      add(c) { const l = list(); if (!l.includes(c)) l.push(c); self.attrs.class = l.join(' '); },
      remove(c) { self.attrs.class = list().filter((x) => x !== c).join(' '); },
      toggle(c) { if (list().includes(c)) this.remove(c); else this.add(c); },
      contains(c) { return list().includes(c); },
    };
  }
  get value() {
    if (this.tagName === 'SELECT' && !this._value) {
      const opt = this.children.find((c) => c instanceof El && c.tagName === 'OPTION' && c.attrs.value !== undefined);
      return opt ? opt.attrs.value : '';
    }
    return this._value;
  }
  set value(v) { this._value = String(v == null ? '' : v); }
  appendChild(node) { node.parentNode = this; this.children.push(node); if (node instanceof El) syncProps(node); return node; }
  removeChild(node) { this.children = this.children.filter((c) => c !== node); node.parentNode = null; return node; }
  get textContent() {
    if (this.children.length) return this.children.map((c) => (c instanceof El ? c.textContent : c.text)).join('');
    return this._text;
  }
  set textContent(v) { this.children = []; this._text = String(v); }
  set innerHTML(v) { this.children = []; this._text = ''; for (const n of parseFragment(String(v))) this.appendChild(n); }
  get innerHTML() { return this.children.length ? serializeChildren(this.children) : this._text; }
  set outerHTML(v) {
    const parent = this.parentNode;
    const nodes = parseFragment(String(v));
    if (!parent) return;
    const idx = parent.children.indexOf(this);
    nodes.forEach((n) => { n.parentNode = parent; });
    parent.children.splice(idx, 1, ...nodes);
  }
  get outerHTML() {
    const tag = this.tagName.toLowerCase();
    const attrs = Object.entries(this.attrs).map(([k, v]) => ' ' + k + '="' + String(v).replace(/"/g, '&quot;') + '"').join('');
    if (VOID.has(this.tagName)) return '<' + tag + attrs + '>';
    return '<' + tag + attrs + '>' + this.innerHTML + '</' + tag + '>';
  }
  addEventListener(type, fn) { this._listeners.push({ type, fn }); }
  closest(sel) { let n = this; while (n) { if (n instanceof El && matchSimple(n, sel)) return n; n = n.parentNode; } return null; }
  querySelectorAll(sel) { const out = []; walk(this, (e) => { if (e !== this && matchesSelector(e, sel)) out.push(e); }); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  focus() {} select() {} scrollIntoView() {}
  click() { dispatch(this, 'click'); }
}
function walk(node, fn) { for (const c of node.children) if (c instanceof El) { fn(c); walk(c, fn); } }
function syncProps(el) {
  if ('value' in el.attrs && el._value === '') el.value = el.attrs.value;
  if ('open' in el.attrs) el.open = true;
  if ('checked' in el.attrs) el.checked = true;
  if ('disabled' in el.attrs) el.disabled = true;
}
function serializeChildren(children) { return children.map((c) => (c instanceof El ? c.outerHTML : String(c.text))).join(''); }
function parseFragment(src) {
  const root = new El('#root'); const stack = [root]; let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt === -1) { pushText(stack[stack.length - 1], src.slice(i)); break; }
    if (lt > i) pushText(stack[stack.length - 1], src.slice(i, lt));
    if (src.startsWith('<!--', lt)) { const end = src.indexOf('-->', lt); i = end === -1 ? src.length : end + 3; continue; }
    if (src.startsWith('<!', lt)) { const end = src.indexOf('>', lt); i = end === -1 ? src.length : end + 1; continue; }
    if (src.startsWith('</', lt)) {
      const end = src.indexOf('>', lt);
      const tag = src.slice(lt + 2, end).trim().toUpperCase();
      for (let s = stack.length - 1; s > 0; s--) if (stack[s].tagName === tag) { stack.length = s; break; }
      i = end + 1; continue;
    }
    const end = findTagEnd(src, lt);
    const raw = src.slice(lt + 1, end);
    const tagMatch = raw.match(/^[a-zA-Z0-9-]+/);
    const tag = (tagMatch ? tagMatch[0] : '').toUpperCase();
    const attrPart = raw.slice(tagMatch ? tagMatch[0].length : 0);
    const el = new El(tag);
    for (const m of attrPart.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
      if (!m[1]) continue;
      el.attrs[m[1]] = m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : m[5] !== undefined ? m[5] : '';
    }
    stack[stack.length - 1].appendChild(el);
    i = end + 1;
    if (RAWTEXT.has(tag)) {
      const close = src.toLowerCase().indexOf('</' + tag.toLowerCase(), i);
      const text = src.slice(i, close === -1 ? src.length : close);
      if (text) pushText(el, text);
      i = close === -1 ? src.length : close;
      continue;
    }
    if (!VOID.has(tag) && !raw.trim().endsWith('/')) stack.push(el);
  }
  return root.children;
}
function findTagEnd(src, lt) {
  let quote = null;
  for (let i = lt + 1; i < src.length; i++) {
    const ch = src[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '>') return i;
  }
  return src.length;
}
function pushText(parent, text) { if (text) parent.children.push({ text }); }
function matchSimple(el, sel) {
  const m = sel.match(/^([a-zA-Z0-9]*)((?:[.#][\w-]+|\[[^\]]*\]|:checked)*)$/);
  if (!m) return false;
  if (m[1] && el.tagName !== m[1].toUpperCase()) return false;
  for (const part of (m[2].match(/[.#][\w-]+|\[[^\]]*\]|:checked/g) || [])) {
    if (part === ':checked') { if (!el.checked) return false; continue; }
    if (part[0] === '.') { if (!el.classList.contains(part.slice(1))) return false; continue; }
    if (part[0] === '#') { if (el.id !== part.slice(1)) return false; continue; }
    if (part === '[]') return false;
    const a = part.slice(1, -1).match(/^([\w-]+)(?:=["']?([^"']*)["']?)?$/);
    if (!a) return false;
    if (el.getAttribute(a[1]) === null) return false;
    if (a[2] !== undefined && el.getAttribute(a[1]) !== a[2]) return false;
  }
  return true;
}
function matchesSelector(el, selector) {
  const parts = String(selector).trim().split(/\s+/);
  if (!matchSimple(el, parts[parts.length - 1])) return false;
  let node = el.parentNode;
  for (let p = parts.length - 2; p >= 0; p--) {
    let found = false;
    while (node) { if (node instanceof El && matchSimple(node, parts[p])) { found = true; node = node.parentNode; break; } node = node.parentNode; }
    if (!found) return false;
  }
  return true;
}
function dispatchEventOn(target, type, ev) {
  const path = [];
  for (let n = target; n; n = n.parentNode) path.push(n);
  for (const node of path) node._listeners.filter((l) => l.type === type).forEach((l) => l.fn(ev));
}
function dispatch(target, type, extra) {
  dispatchEventOn(target, type, Object.assign({ target, preventDefault() {}, stopPropagation() {} }, extra || {}));
}

const doc = new El('#document');
parseFragment(html.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1]).forEach((n) => doc.appendChild(n));
const documentStub = {
  readyState: 'complete', body: doc, documentElement: { clientWidth: 0 },
  createElement: (tag) => new El(tag),
  getElementById: (id) => doc.querySelector('#' + id),
  querySelector: (sel) => doc.querySelector(sel),
  querySelectorAll: (sel) => doc.querySelectorAll(sel),
  addEventListener: (t, fn) => doc.addEventListener(t, fn),
  execCommand: () => true,
};
const timers = [];
const sandbox = {
  console: { log() {}, warn() {}, error() {} },
  document: documentStub,
  navigator: { onLine: false, clipboard: null },
  performance, URL,
  setTimeout: (fn, ms) => { timers.push({ fn, ms: ms || 0 }); return timers.length; },
  clearTimeout: () => {},
  Blob: class Blob { constructor(parts) { this.text = (parts || []).join(''); } },
  Date, Math, JSON, Map, Set, Array, Object, String, Number, RegExp, Error, isFinite, parseInt, parseFloat,
};
sandbox.URL.createObjectURL = () => 'blob:smoke/1';
sandbox.URL.revokeObjectURL = () => {};
sandbox.globalThis = sandbox; sandbox.window = sandbox;
function flushTimers(limit = 400) { let n = 0; while (timers.length && n < limit) { const t = timers.shift(); t.fn(); n++; } }

vm.createContext(sandbox);
const errors = [];
try {
  vm.runInContext(html.match(/<script id="rag-data">([\s\S]*?)<\/script>/)[1], sandbox);
  vm.runInContext(html.match(/<script id="rag-core">([\s\S]*?)<\/script>/)[1], sandbox);
  vm.runInContext(html.match(/<script id="rag-llm">([\s\S]*?)<\/script>/)[1], sandbox);
  vm.runInContext(html.match(/<script id="rag-ui">([\s\S]*?)<\/script>/)[1], sandbox);
  flushTimers();
} catch (e) { errors.push(e); }
check('G1-1', 'init() 执行无异常（0 报错）', errors.length === 0,
  errors.length ? String(errors[0] && errors[0].stack).split('\n').slice(0, 3).join(' | ') : '');
if (errors.length) { console.log('\n初始化即失败。'); process.exit(1); }

const $ = (id) => documentStub.getElementById(id);
const txt = (id) => ($(id) ? $(id).innerHTML : '');
const eventTypes = () => [...txt('eventList').matchAll(/class="evt-type">([a-z_]+)</g)].map((m) => m[1]);
const search = (q) => { $('queryInput').value = q; dispatch($('searchBtn'), 'click'); flushTimers(); };

section('信息层级与折叠');
check('标记-1', '7 个环节标记槽位全部被真实标记替换（③④⑤⑥⑦⑧⑨）',
  documentStub.querySelectorAll('[data-badge]').length === 0
  && (doc.innerHTML.match(/badge (real|sim|mix|llm)">(✅ 真实|🔶 模拟|🔶 混合来源|✅ 真实 LLM 产出)/g) || []).length >= 7,
  (doc.innerHTML.match(/badge (real|sim|mix|llm)">(✅ 真实|🔶 模拟|🔶 混合来源|✅ 真实 LLM 产出)/g) || []).length + ' 个标记');
check('层级-1', '首屏主角是「我的问题」和「最终决策建议」，都在细节区之前',
  !!$('secAsk') && !!$('secDecision') && !$('secAsk').closest('details')
  && !$('secDecision').closest('details'),
  '两块都不是折叠面板');
check('层级-2', '顶层层级 7 个折叠模块，机制细节全部默认收起',
  documentStub.querySelectorAll('details.mod').length === 7
  && $('secLib').open && !$('secPrep').open && !$('secPlan').open && !$('secScore').open && !$('secPrompt').open);
check('层级-3', '③④⑤ 收在「预处理」里，且各自带标记与摘要',
  ['secChunk', 'secToken', 'secIndex'].every((id) => {
    const el = $(id);
    return !!el && el.classList.contains('plain') && !!el.closest('#secPrep');
  })
  && (txt('sumChunk').length > 0) && (txt('sumIndex').length > 0),
  `③ ${txt('sumChunk').slice(0, 24)} · ⑤ ${txt('sumIndex').slice(0, 24)}`);
check('层级-4', '每个折叠模块表头都有关键数字摘要',
  ['sumLib', 'sumPrep', 'sumPlan', 'sumScore', 'sumPrompt', 'sumEvents', 'sumSelfCheck'].every((id) => ($(id).textContent || '').length > 0),
  '③ ' + $('sumPrep').textContent);
dispatch($('expandAllBtn'), 'click');
check('层级-5', '「全部展开」会把顶层模块与内部细节都打开',
  documentStub.querySelectorAll('details.mod').every((d) => d.open) && documentStub.querySelectorAll('details.plain').every((d) => d.open));
dispatch($('collapseAllBtn'), 'click');
check('层级-6', '「全部收起」把顶层模块收起来', documentStub.querySelectorAll('details.mod').every((d) => d.open === false));
dispatch($('expandAllBtn'), 'click');

section('首屏：我的问题');
check('问题-1', '输入框 + 5 个预置 + 4 个边界复现按钮',
  !!$('queryInput') && documentStub.querySelectorAll('#presetBtns .btn').length === 5
  && ($('secAsk').innerHTML.match(/data-fill=/g) || []).length === 9,
  ($('secAsk').innerHTML.match(/data-fill=/g) || []).length + ' 个可填入按钮');
check('问题-2', '未检索时决策区给的是引导文案（不是空白）',
  txt('decisionBox').includes('还没有问题') && txt('decisionBox').includes('有 RAG') && txt('decisionBox').includes('基线'));
dispatch(documentStub.querySelector('#presetBtns .btn'), 'click');
check('问题-3', '点预置只填入、不自动检索', $('queryInput').value === '国庆节去哪儿玩' && !txt('decisionBox').includes('✅ 有收藏 RAG'));

section('核心：最终决策建议（有 RAG / 无 RAG 对照）');
search('国庆节去哪儿玩');
check('决策-1', '两栏并排：有 RAG / 无 RAG 基线',
  txt('decisionBox').includes('✅ 有收藏 RAG') && txt('decisionBox').includes('🔶 无 RAG 基线'));
check('决策-2', '两栏都标为真实 LLM 产出并给出 prompt 校验值',
  (txt('decisionBox').match(/✅ 真实 LLM 产出/g) || []).length >= 2
  && txt('decisionBox').includes('2147e47c') && txt('decisionBox').includes('6c42de4c'));
check('决策-3', '有 RAG 栏给出可点击收藏引用',
  (txt('decisionBox').match(/data-jump=/g) || []).length >= 3
  && txt('decisionBox').includes('[收藏 1]'),
  (txt('decisionBox').match(/data-jump=/g) || []).length + ' 个引用链接');
check('决策-4', '无 RAG 栏明确说明「没有任何出处」',
  txt('decisionBox').includes('这栏') && txt('decisionBox').includes('没有任何出处'));
check('决策-5', '有人工对照小结', txt('decisionBox').includes('对照小结') && txt('decisionBox').includes('人工整理'));
check('决策-6', '决策摘要显示两栏来源与引用数',
  ($('sumDecision').textContent || '').includes('真实 LLM') && ($('sumDecision').textContent || '').includes('无 RAG 基线'),
  $('sumDecision').textContent);
check('决策-7', '回答区不出现置信度 / 相似度数字',
  !/置信度[:：]\s*[0-9]|相似度[:：]\s*[0-9]|概率[:：]\s*[0-9]/.test(txt('decisionBox')));
search('上海有什么好吃的');
check('决策-8', '上海问题：有 RAG 栏提醒命中的风控页不可信',
  txt('decisionBox').includes('内容不完整') && txt('decisionBox').includes('风控'));
search('整理我的收藏夹');
check('决策-9', '收藏夹整理：有 RAG 栏给出 12 条可点引用，无 RAG 栏仍只给方法论',
  (txt('decisionBox').match(/data-jump=/g) || []).length >= 12 && txt('decisionBox').includes('按主题分组'));
search('钢琴考级怎么报名');
check('决策-10', '空态：有 RAG 栏如实说收藏里没有，无 RAG 栏给通用流程',
  txt('decisionBox').includes('收藏里没有钢琴考级相关') && txt('decisionBox').includes('考级机构'));
search('云南');
check('决策-11', '非预置 query：两栏都退回并说明原因（左=模板，右=无基线）',
  txt('decisionBox').includes('🔶 模板拼接') && txt('decisionBox').includes('没有内嵌的无 RAG 基线回答'));
search('国庆节去哪儿玩');
$('csInput').value = '60'; dispatch($('applyParamsBtn'), 'click');
search('国庆节去哪儿玩');
check('决策-12', '改了分块参数 → 有 RAG 栏提示 hash 不一致并退回模板',
  txt('decisionBox').includes('不一致') && txt('decisionBox').includes('🔶 模板拼接'));
dispatch($('resetParamsBtn'), 'click');
search('国庆节去哪儿玩');
check('决策-13', '参数调回后恢复真实 LLM 回答', txt('decisionBox').includes('✅ 真实 LLM 产出'));

section('细节区：检索 / Prompt / 语料 / 分块');
check('细节-1', '⑦ 有命中列表且不再重复列引用',
  txt('results').includes('score ') && !txt('results').includes('收藏出处'));
check('细节-2', '⑧ 给出两份 prompt（有 RAG / 无 RAG）',
  txt('promptBox').includes('有 RAG 的 prompt') && txt('promptBox').includes('无 RAG 基线的 prompt')
  && txt('promptBox').includes('【用户收藏库引用】') && txt('promptBox').includes('没有提供任何私人资料'));
check('细节-3', '语料 12 条卡片按 3 主题分组，只显示标题 + 字数',
  documentStub.querySelectorAll('#noteCards details.note').length === 12
  && documentStub.querySelectorAll('#noteCards .theme-head').length === 3
  && (txt('noteCards').match(/note-meta/g) || []).length === 12
  && documentStub.querySelectorAll('#noteCards .note-body').length === 12);
check('细节-4', '③ 用覆盖区间条 + 文本块（无表格），保真与块数可见',
  documentStub.querySelectorAll('#chunkList .cover-band').length === 34
  && documentStub.querySelectorAll('#chunkList .ck-text').length === 34
  && !txt('chunkList').includes('<table')
  && txt('chunkSummary').includes('保真'));
check('细节-5', '④⑤ 渲染分词与索引',
  txt('queryTokens').includes('query') && txt('chunkTokens').includes('token')
  && txt('indexStats').includes('avgdl') && txt('indexTokens').includes('来源'));
check('细节-6', '⑥ 渲染意图 + 三类来源词',
  txt('intentBox').includes('意图') && txt('termsBox').includes('原词') && txt('termsBox').includes('改写词') && txt('termsBox').includes('主题词'));

section('事件 / 自检 / ⓘ / 删除项');
check('删除-1', '页面上没有理解自测模块（也没有 radio 选项）',
  !$('secQuiz') && documentStub.querySelectorAll('input[type=radio]').length === 0);
check('FR-12', '8 类事件覆盖齐全，没有 quiz_submit / link_parse',
  (txt('eventCoverage').match(/✅ [a-z_]+ ×/g) || []).length >= 6
  && !txt('eventCoverage').includes('quiz_submit ×') && !eventTypes().includes('link_parse'));
$('legend').open = true; dispatch($('legend'), 'toggle');
dispatch($('exportBtn'), 'click'); flushTimers();
check('AC-16', '8 类事件全部触发', (txt('eventCoverage').match(/✅ [a-z_]+ ×/g) || []).length === 8,
  (txt('eventCoverage').match(/⬜ [a-z_]+ 未触发/g) || []).join(' ') || '8 类全部已触发');
check('附录', '实现自检 PASS', txt('selfCheckBox').includes('SELFCHECK: PASS'),
  (txt('selfCheckBox').match(/SELFCHECK: (PASS|FAIL) \d+\/\d+/) || [''])[0]);
if (!txt('selfCheckBox').includes('SELFCHECK: PASS')) {
  const rows = [...txt('selfCheckBox').matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
  rows.filter((r) => r.includes('selfcheck-fail')).forEach((r) => console.log('     [自检失败行] ' + r.replace(/<[^>]+>/g, ' | ').slice(0, 300)));
}
check('自检-2', '自检表里有「布局自检」并且非浏览器环境跳过',
  txt('selfCheckBox').includes('布局自检') && txt('selfCheckBox').includes('已跳过'));
check('自检-3', '自检表里有「两段真实回答 promptSha 校验」项',
  txt('selfCheckBox').includes('promptSha') && txt('selfCheckBox').includes('校验一致'));
check('ⓘ-1', 'ⓘ 说明渲染到固定视口图层，点击钉住、Esc 关闭',
  (() => {
    const info = documentStub.querySelector('#secPrep .info');
    dispatch(info, 'click');
    const layer = $('tipLayer');
    const opened = !!layer && layer.classList.contains('show') && layer.innerHTML.length > 20;
    const pinned = documentStub.querySelectorAll('.info.pinned').length === 1;
    dispatch(doc, 'keydown', { key: 'Escape' });
    return opened && pinned && documentStub.querySelectorAll('.info.pinned').length === 0;
  })());
check('ⓘ-2', '旧的会被压扁的写法已移除', !html.includes('.info:hover .tip') && html.includes('.tiplayer{position:fixed'));
dispatch(documentStub.querySelector('#decisionBox [data-jump]'), 'click');
check('AC-8', '点引用跳回原帖（并自动展开语料模块）', $('secLib').open === true);

console.log(`\n================ UI 冒烟结果：${pass} 通过 / ${fail} 失败 ================`);
if (failures.length) { console.log('失败明细：'); failures.forEach((f) => console.log(' - ' + f)); process.exitCode = 1; }
