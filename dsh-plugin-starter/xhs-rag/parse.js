/**
 * 小红书笔记页的解析。
 *
 * 关键约束（实测得出，不是推测）：小红书笔记页是 JS 渲染的，正文**不在 HTML 里**。
 * 剥掉 <script> 之后只剩导航外壳。因此纯 HTTP 能拿到的只有：
 *   - <title>
 *   - <meta name="description">  ← 这个恰好包含完整文案
 *   - 部分页面里的作者信息
 *
 * 拿不到：图片、互动数据、评论。
 *
 * 所以本模块的第一职责不是"尽力提取"，而是**判断提取结果是否可用**，
 * 并在不可用时给出 degraded 原因。一个返回 200、有标题、却几乎没有正文的结果，
 * 比一个明确的失败更危险 —— 它会让 demo 看起来是成功的。
 */

const ENTITIES = new Map([
  ['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"],
  ['nbsp', ' '], ['#39', "'"], ['#34', '"'], ['mdash', '—'], ['ndash', '–'],
  ['hellip', '…'], ['ldquo', '“'], ['rdquo', '”'], ['lsquo', '‘'], ['rsquo', '’'],
]);

/** 出现这些词说明抓到的不是笔记内容，而是风控页／登录页。 */
const BLOCK_PAGE_MARKERS = [
  '当前笔记暂时无法浏览',
  '请打开小红书App',
  '扫码查看',
  '登录后查看',
  '安全验证',
  '访问频繁',
];

/** 正文短于此长度时认为内容不充分。 */
const MIN_USABLE_TEXT = 40;

/**
 * 解码常见 HTML 实体（含数字实体）。
 *
 * @param {string} value - 含实体的文本。
 * @returns {string} 解码后的文本。
 */
export function decodeEntities(value) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body) => {
    const key = body.toLowerCase();
    if (ENTITIES.has(key)) return ENTITIES.get(key);
    if (key.startsWith('#x')) {
      const code = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (key.startsWith('#')) {
      const code = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return whole;
  });
}

/**
 * 从 HTML 中取一个 meta 标签的 content。
 *
 * 属性顺序在真实页面里不固定（name 可能在 content 前后），所以这里对两种顺序都匹配，
 * 并且区分单双引号。
 *
 * @param {string} html - 页面 HTML。
 * @param {string} attr - 'name' 或 'property'。
 * @param {string} key - 属性值，例如 'description'。
 * @returns {string | undefined}
 */
function metaContent(html, attr, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]*${attr}=["']${escaped}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*${attr}=["']${escaped}["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeEntities(match[1]).trim();
  }
  return undefined;
}

/**
 * 取 <title> 的文本。
 *
 * @param {string} html - 页面 HTML。
 * @returns {string | undefined}
 */
function titleText(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return undefined;
  const value = decodeEntities(match[1]).replace(/\s+/g, ' ').trim();
  return value || undefined;
}

/**
 * 去掉小红书标题后缀，例如 "标题 - 小红书"。
 *
 * @param {string | undefined} title - 原始标题。
 * @returns {string | undefined}
 */
function stripSiteSuffix(title) {
  if (!title) return undefined;
  const stripped = title.replace(/\s*[-|·]\s*小红书\s*$/, '').trim();
  return stripped || undefined;
}

/**
 * 检测风控／登录页。
 *
 * @param {string} text - 待检测文本。
 * @returns {string | undefined} 命中的标记。
 */
function blockMarker(text) {
  return BLOCK_PAGE_MARKERS.find((marker) => text.includes(marker));
}

/**
 * 解析一份笔记页 HTML。
 *
 * @param {object} input - 解析输入。
 * @param {string} input.html - 页面正文（`ctx.web.fetch` 的 `body.content`）。
 * @param {string} input.noteId - 笔记 id。
 * @param {string} input.url - 规范化后的笔记 URL。
 * @param {number} [input.statusCode] - HTTP 状态码，用于诊断。
 * @returns {{
 *   noteId: string, url: string, title?: string, text: string,
 *   author?: string, degraded: string[], usable: boolean, statusCode?: number,
 * }}
 */
export function parseNoteHtml({ html, noteId, url, statusCode }) {
  const degraded = [];
  const pageTitle = titleText(html);
  const description = metaContent(html, 'name', 'description')
    ?? metaContent(html, 'property', 'og:description');

  // 作者信息在不同页面结构里位置不同，尽力而为，取不到不算 degraded。
  const nickname = html.match(/"nickname"\s*:\s*"([^"]{1,64})"/)?.[1];
  const author = metaContent(html, 'name', 'author')
    ?? metaContent(html, 'property', 'og:article:author')
    ?? (nickname ? decodeEntities(nickname) : undefined);

  const title = stripSiteSuffix(pageTitle);

  // 正文优先取 meta description；它缺失时退回标题，但那样基本没有检索价值。
  let text = description ?? '';
  if (!description && title) {
    degraded.push('页面没有 meta description，只能退回标题，检索价值很低');
    text = title;
  }

  const marker = blockMarker(html);
  if (marker) {
    degraded.push(`页面疑似风控或登录页（命中「${marker}」），内容不可信`);
  }

  if (statusCode !== undefined && (statusCode < 200 || statusCode >= 300)) {
    degraded.push(`HTTP ${statusCode}`);
  }

  if (text.length < MIN_USABLE_TEXT) {
    degraded.push(
      `正文仅 ${text.length} 字符，达不到可用阈值 ${MIN_USABLE_TEXT}；`
      + '该笔记很可能是图片型（正文只有「看图」之类），纯文本抓取无法还原其内容',
    );
  }

  if (pageTitle && description && title && description.startsWith(title)) {
    degraded.push('正文与标题重复，页面可能只回传了标题');
  }

  const usable = text.length >= MIN_USABLE_TEXT && !marker
    && !(statusCode !== undefined && (statusCode < 200 || statusCode >= 300));

  return { noteId, url, title, text, author, degraded, usable, statusCode };
}
