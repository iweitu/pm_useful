/**
 * 离线测试：链接提取与笔记解析。
 *
 * 这两个模块是纯函数，不碰网络，所以它们的全部行为都可以在这里证明。
 * 网络路径（短链展开、页面抓取）无法离线证明，由 README 的「已证 / 待证」清单标注。
 *
 * 运行：
 *   node test/offline.test.mjs
 */
import { extractNoteLinks, isShortLink, resolveNoteFromFinalUrl } from '../urls.js';
import { parseNoteHtml, decodeEntities } from '../parse.js';

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

/** 取嵌套属性，缺失时返回 undefined 而不是抛错 —— 一个断言失败不该中断整轮测试。 */
function at(value, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), value);
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

// ---------------------------------------------------------------- 链接提取

console.log('\n[extractNoteLinks]');

// 真实分享文案的样子：中文文案 + 表情 + 短链 + 全角标点。
const shareText = `超好用的收纳技巧分享给大家～
复制这条信息，打开【小红书】查看
😊 https://xhslink.cn/o/AxnRePgIokn，
还有这个 https://xhslink.com/o/1WiQ1QI6Uc0。`;

const share = extractNoteLinks(shareText);
eq(share.candidates.length, 2, '两条分享短链都被提取');
eq(
  share.candidates.map((c) => c.kind),
  ['short', 'short'],
  '两条都识别为短链',
);
eq(
  share.candidates.map((c) => new URL(c.url).hostname),
  ['xhslink.cn', 'xhslink.com'],
  '两个短链域名都被认出来（这条是防静默降级的回归测试）',
);
eq(share.unrecognised, [], '没有未识别链接');
eq(share.duplicateCount, 0, '没有重复');

// 长链直接拿 id。
const long = extractNoteLinks('https://www.xiaohongshu.com/explore/6a9d0eb2000000002a024480?xsec_token=CB7rCz&type=normal');
eq(at(long, 'candidates.length'), 1, '长链被提取');
eq(at(long, 'candidates.0.noteId'), '6a9d0eb2000000002a024480', '从 /explore/ 路径取到笔记 id');
eq(at(long, 'candidates.0.kind'), 'note', '长链标记为 note（无需展开）');

// /discovery/item/ 是另一种真实路径。
const discovery = extractNoteLinks('https://www.xiaohongshu.com/discovery/item/abc123def?app_platform=ios');
eq(at(discovery, 'candidates.0.noteId'), 'abc123def', '从 /discovery/item/ 路径取到笔记 id');

// 同一链接出现两次只处理一次，但要报告重复数。
const dup = extractNoteLinks([
  'https://www.xiaohongshu.com/explore/sameone',
  'https://www.xiaohongshu.com/explore/sameone',
]);
eq(dup.candidates.length, 1, '重复链接只保留一条');
eq(dup.duplicateCount, 1, '重复次数被报告');

// 非小红书链接静默忽略（分享文案里混别的链接是常事）。
const mixed = extractNoteLinks('看看这个 https://example.com/foo 和 https://xhslink.com/o/abc');
eq(mixed.candidates.length, 1, '非小红书链接被忽略');
eq(mixed.unrecognised.length, 0, '非小红书链接不算未识别（不该打扰用户）');

// 小红书域名但不是笔记页 → 必须显式报告，不能静默丢。
const homepage = extractNoteLinks('我的主页 https://www.xiaohongshu.com/user/profile/xyz');
eq(homepage.candidates.length, 0, '用户主页不产生候选');
eq(homepage.unrecognised.length, 1, '用户主页被显式报告为未识别');

// 尾部全角标点必须剥掉，否则 noteId 会带上脏字符。
const punctuated = extractNoteLinks('https://www.xiaohongshu.com/explore/cleanid）');
eq(at(punctuated, 'candidates.0.noteId'), 'cleanid', '剥掉尾部全角右括号');

console.log('\n[isShortLink / resolveNoteFromFinalUrl]');
ok(isShortLink('https://xhslink.cn/o/abc'), 'xhslink.cn 识别为短链');
ok(isShortLink('https://xhslink.com/o/abc'), 'xhslink.com 识别为短链');
ok(!isShortLink('https://www.xiaohongshu.com/explore/abc'), '长链不是短链');

const resolved = resolveNoteFromFinalUrl(
  'https://www.xiaohongshu.com/discovery/item/6a9d0eb2000000002a024480?app_platform=ios&xsec_token=CB7rCz&type=normal',
);
eq(resolved?.noteId, '6a9d0eb2000000002a024480', '从展开后的最终 URL 取到 id');eq(
  resolved?.canonicalUrl,
  'https://www.xiaohongshu.com/explore/6a9d0eb2000000002a024480',
  '规范化 URL 丢掉分享追踪参数（避免同一笔记产生多个 key）',
);
eq(resolveNoteFromFinalUrl('https://xhslink.com/o/abc'), undefined, '最终 URL 仍是短链时明确失败，不猜 id');
eq(resolveNoteFromFinalUrl('https://www.xiaohongshu.com/user/profile/xyz'), undefined, '最终 URL 不是笔记页时明确失败');

// ---------------------------------------------------------------- 页面解析

console.log('\n[parseNoteHtml]');

// 固件 1：正常笔记页。meta description 带完整文案。
const goodHtml = `<!DOCTYPE html><html><head>
<title>租房收纳的5个细节 - 小红书</title>
<meta name="description" content="租房空间小，收纳要讲究。1. 竖向利用墙面 2. 统一容器颜色 3. 抽屉内做分隔 4. 门后挂袋 5. 床下留空。">
<meta property="og:article:author" content="收纳小能手">
<script>window.__INITIAL_STATE__={"note":{"nickname":"收纳小能手"}}</script>
</head><body><div id="app"></div></body></html>`;

const good = parseNoteHtml({
  html: goodHtml,
  noteId: 'note001',
  url: 'https://www.xiaohongshu.com/explore/note001',
  statusCode: 200,
});
eq(good.title, '租房收纳的5个细节', '标题去掉了「- 小红书」后缀');
eq(good.author, '收纳小能手', '取到作者');
ok(good.text.includes('竖向利用墙面'), '正文包含文案');
eq(good.usable, true, '内容可用');
eq(good.degraded, [], '没有降级警告');

// 固件 2：图片型笔记 —— 正文就是一句「看图」。这正是用户选的处理方式：标记 degraded。
const imageNoteHtml = `<html><head>
<title>今天的穿搭 - 小红书</title>
<meta name="description" content="看图👇">
</head><body></body></html>`;
const imageNote = parseNoteHtml({
  html: imageNoteHtml,
  noteId: 'note002',
  url: 'https://www.xiaohongshu.com/explore/note002',
  statusCode: 200,
});
eq(imageNote.usable, false, '图片型笔记判定为不可用');
ok(
  imageNote.degraded.some((d) => d.includes('达不到可用阈值')),
  '给出「正文过短」的降级原因',
);
ok(
  imageNote.degraded.some((d) => d.includes('图片型')),
  '降级原因明确指出可能是图片型',
);

// 固件 3：风控 / 登录页。必须识别出来，否则会把风控文案当正文索引。
const blockHtml = `<html><head>
<title>小红书</title>
<meta name="description" content="当前笔记暂时无法浏览，请稍后再试">
</head><body></body></html>`;
const blocked = parseNoteHtml({
  html: blockHtml,
  noteId: 'note003',
  url: 'https://www.xiaohongshu.com/explore/note003',
  statusCode: 200,
});
eq(blocked.usable, false, '风控页判定为不可用');
ok(
  blocked.degraded.some((d) => d.includes('风控')),
  '降级原因指出命中风控标记',
);

// 固件 4：没有 meta description，只有 title。应当降级但不能崩。
const titleOnly = parseNoteHtml({
  html: '<html><head><title>只有标题的页面 - 小红书</title></head><body></body></html>',
  noteId: 'note004',
  url: 'https://www.xiaohongshu.com/explore/note004',
  statusCode: 200,
});
eq(titleOnly.title, '只有标题的页面', '退回标题');
eq(titleOnly.usable, false, '仅标题不可用');
ok(
  titleOnly.degraded.some((d) => d.includes('没有 meta description')),
  '降级原因指出缺少 meta description',
);

// 固件 5：404。
const notFound = parseNoteHtml({
  html: '<html><head><title>页面不存在 - 小红书</title></head><body></body></html>',
  noteId: 'note005',
  url: 'https://www.xiaohongshu.com/explore/note005',
  statusCode: 404,
});
eq(notFound.usable, false, '404 判定为不可用');
ok(notFound.degraded.some((d) => d.includes('HTTP 404')), '降级原因带上状态码');

// 固件 6：属性顺序颠倒 + 单引号 + HTML 实体。
const reversed = parseNoteHtml({
  html: `<html><head><title>A &amp; B 笔记 - 小红书</title>
<meta content='第一行&#10;第二行 &lt;标签&gt;' name='description'></head><body></body></html>`,
  noteId: 'note006',
  url: 'https://www.xiaohongshu.com/explore/note006',
  statusCode: 200,
});
eq(reversed.title, 'A & B 笔记', '属性顺序颠倒也能取到 title，且实体已解码');
ok(reversed.text.startsWith('第一行'), '逆序 + 单引号 + 实体的 description 能取到');

console.log('\n[decodeEntities]');
eq(decodeEntities('&amp;&lt;&gt;&quot;'), '&<>"', '命名实体');
eq(decodeEntities('&#39;'), "'", '十进制实体');
eq(decodeEntities('&#x27;'), "'", '十六进制实体');
eq(decodeEntities('&unknownent;'), '&unknownent;', '未知实体原样保留');

// ---------------------------------------------------------------- 结果

console.log(`\n${checks - failures}/${checks} 项通过`);
if (failures > 0) {
  console.log(`${failures} 项失败`);
  process.exitCode = 1;
} else {
  console.log('PASS');
}
