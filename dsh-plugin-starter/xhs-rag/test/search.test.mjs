/**
 * 离线测试：分词与关键词检索。
 *
 * 运行：
 *   node test/search.test.mjs
 */
import { tokenize, searchNotes } from '../search.js';

let failures = 0;
let checks = 0;

function eq(actual, expected, label) {
  checks += 1;
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    failures += 1;
    console.log(`  FAIL  ${label}\n        期望 ${b}\n        实际 ${a}`);
  } else {
    console.log(`  ok    ${label}`);
  }
}

function ok(value, label) {
  checks += 1;
  if (!value) {
    failures += 1;
    console.log(`  FAIL  ${label}（期望为真，实际 ${JSON.stringify(value)}）`);
  } else {
    console.log(`  ok    ${label}`);
  }
}

/** 取嵌套属性，缺失时返回 undefined 而不是抛错。 */
function at(value, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), value);
}

console.log('\n[tokenize]');
ok(tokenize('租房收纳').includes('收纳'), '中文产生双字 bigram「收纳」');
ok(tokenize('租房收纳').includes('租'), '中文产生单字');
eq(tokenize('abc x1'), ['abc', 'x1'], '拉丁词长度 >= 2 保留');
eq(tokenize('a b'), [], '单字母被丢弃（噪声）');
ok(tokenize('RAG 检索').includes('rag'), '拉丁词小写化');
eq(tokenize(''), [], '空串返回空数组');
eq(tokenize(undefined), [], '非字符串返回空数组');

const notes = [
  {
    noteId: 'n1',
    title: '租房收纳的5个细节',
    text: '租房空间小，收纳要讲究。竖向利用墙面，统一容器颜色，抽屉内做分隔。',
    url: 'https://www.xiaohongshu.com/explore/n1',
    author: '收纳小能手',
  },
  {
    noteId: 'n2',
    title: '厨房清洁好物',
    text: '油污清洁剂推荐，租房厨房也能用上的清洁技巧。',
    url: 'https://www.xiaohongshu.com/explore/n2',
    author: '清洁达人',
  },
  {
    noteId: 'n3',
    title: '露营装备清单',
    text: '帐篷、睡袋、天幕，新手露营装备怎么选。',
    url: 'https://www.xiaohongshu.com/explore/n3',
  },
];

console.log('\n[searchNotes]');

const byTitle = searchNotes(notes, '收纳');
eq(byTitle.results[0]?.noteId, 'n1', '标题命中排第一');
ok(
  byTitle.results[0].score > (byTitle.results[1]?.score ?? 0),
  '标题命中得分高于正文命中',
);

// 精确遍：bigram「租房」命中 n1（标题+正文）。n2 的「租房厨房」切出的是
// 「租房/房厨/厨房」，「租房」确实在 n2 里，但 n2 的正文里「租房」后面接的是「厨房」，
// 所以 n2 也有「租房」bigram —— 这一条验证词边界不同也能命中。
const crossMatch = searchNotes(notes, '租房');
eq(crossMatch.results.length, 2, '「租房」命中 n1 与 n2（n2 正文含「租房厨房」）');
eq(crossMatch.results[0]?.noteId, 'n1', '标题里含「租房」的排前面');
eq(crossMatch.matchMode, 'precise', '精确遍命中时 matchMode 为 precise');
eq(crossMatch.relaxed, false, '精确遍命中时不标记为放宽');

eq(searchNotes(notes, '露营').results[0]?.noteId, 'n3', '命中第三篇');
eq(searchNotes(notes, '完全不相干的词').results, [], '无命中返回空');
ok(
  searchNotes(notes, '完全不相干的词').queryTokens.length > 0,
  '无命中时仍回传 queryTokens（用于诊断"为什么没命中"）',
);
eq(searchNotes(notes, '!@#$').results, [], '纯标点查询返回空');

// 放宽兜底：bigram 落空、但**有区分度的单字**命中时，回退到单字并显式标注。
// 「厨洁」切出 bigram「厨洁」（不存在）+ 单字「厨」「洁」（都在 n2 里），正好走兜底路径。
const loose = searchNotes(notes, '厨洁');
eq(loose.matchMode, 'loose', '仅单字命中时 matchMode 为 loose');
eq(loose.relaxed, true, '放宽遍被标记');
eq(loose.results[0]?.noteId, 'n2', '放宽遍救回召回');

// 虚字兜底必须被拦住：单字查询「的」不该命中任何东西。
eq(searchNotes(notes, '的').results, [], '纯虚字查询返回空（停用词兜底）');

// 单字查询且该字有区分度时仍应工作。
eq(searchNotes(notes, '帐').results[0]?.noteId, 'n3', '有区分度的单字查询正常工作');

// 两遍都有命中时以精确遍为准：单字噪声不得淹没精确匹配。
const preferPrecise = searchNotes(notes, '收纳');
eq(preferPrecise.matchMode, 'precise', '精确词可用时不启用放宽遍');
ok(
  preferPrecise.results.some((r) => r.matchMode === 'precise'),
  '结果带 matchMode 供模型判断匹配质量',
);

const limited = searchNotes(notes, '租房', { limit: 1 });
eq(limited.results.length, 1, 'limit 生效');

const snippet = at(searchNotes(notes, '抽屉'), 'results.0.snippet');
ok(snippet?.includes('抽屉'), '摘要包含命中词');
ok(snippet?.length > 0, '摘要非空');
// 正文较短时摘要就是全文，此时前面不该有省略号；命中在开头不该有前导省略号。
ok(!snippet?.startsWith('…'), '命中位于开头时不加前导省略号');

eq(searchNotes(notes, '收纳').scanned, 3, '回传扫描篇数');
ok(
  Array.isArray(searchNotes(notes, '收纳').results[0].matchedTokens)
  && searchNotes(notes, '收纳').results[0].matchedTokens.length > 0,
  '回传命中 token（可解释性）',
);

// 覆盖率因子：命中两个查询词的应当胜过只命中一个高频词的。
const coverageNotes = [
  { noteId: 'c1', title: '收纳 整理', text: '收纳整理的方法', url: 'u1' },
  { noteId: 'c2', title: '收纳', text: '收纳收纳收纳收纳收纳收纳收纳收纳', url: 'u2' },
];
const coverage = searchNotes(coverageNotes, '收纳 整理');
eq(coverage.results[0]?.noteId, 'c1', '命中词种类更多者胜出，不会被单词高频刷分');

console.log(`\n${checks - failures}/${checks} 项通过`);
if (failures > 0) {
  console.log(`${failures} 项失败`);
  process.exitCode = 1;
} else {
  console.log('PASS');
}
