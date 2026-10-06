/**
 * 抓取一层：短链展开 + 笔记页获取。
 *
 * 这里有两个**必须分开**的网络操作，因为它们的约束不同：
 *
 * 1. **短链展开** 走 Node 内置 `fetch`，且必须 `redirect: 'manual'`。
 *    原因：交付的抓取后端 `dsh-web-fetch-http` 只允许**同源重定向**（跨源重定向在
 *    读取响应体之前就失败），而 `xhslink.com` → `xiaohongshu.com` 正是跨源的。
 *    自己手动解 302 既绕开这个限制，也让跨域边界显式可见。
 *
 * 2. **笔记页获取** 走 `ctx.web.fetch()`。它自带 URL 校验、仅公开地址、
 *    连接固定、charset 解码、字节上限与显式 User-Agent，比裸 fetch 安全得多。
 *    非 2xx 是结果而不是错误 —— 状态码是被抓取资源状态的一部分。
 *
 * 两条路径都可以替换：`fetchNoteHtml` 可以在没有 `ctx.web` 的组合里退回裸 fetch。
 */

/** 短链展开的最大跟随跳数。真实链路是 1 跳，留余量但不给无限循环机会。 */
const MAX_REDIRECTS = 5;

/** 展开短链时使用的桌面 UA：移动端 UA 会被导向 App 下载页。 */
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/**
 * 展开一条短链，解析出最终 URL。
 *
 * @param {string} shortUrl - 短链 URL。
 * @param {object} [options] - 选项。
 * @param {typeof fetch} [options.fetchImpl] - 可注入的 fetch，测试用。
 * @param {AbortSignal} [options.signal] - 取消信号。
 * @returns {Promise<{ finalUrl: string, hops: number }>}
 * @throws {Error} 跳数超限、网络失败或响应缺少 Location 时抛出。
 */
export async function expandShortLink(shortUrl, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('当前运行时没有可用的 fetch，无法展开短链');
  }

  let current = shortUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetchImpl(current, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'user-agent': DESKTOP_UA },
      signal: options.signal,
    });

    // `redirect: 'manual'` 下 3xx 会作为普通响应返回。
    // Header 名大小写不敏感，但 Headers 实现不统一，所以两种取法都试。
    const location = response.headers?.get?.('location') ?? response.headers?.get?.('Location');

    if (!location) {
      if (response.status >= 300 && response.status < 400) {
        throw new Error(`短链返回 ${response.status} 但没有 Location 头，无法继续展开`);
      }
      return { finalUrl: current, hops: hop };
    }

    current = new URL(location, current).href;
  }

  throw new Error(`短链展开超过 ${MAX_REDIRECTS} 跳仍未到达终点，疑似重定向循环`);
}

/**
 * 获取笔记页 HTML。
 *
 * @param {object} input - 输入。
 * @param {string} input.url - 规范化后的笔记 URL。
 * @param {object | undefined} input.web - `ctx.web`，缺失时退回裸 fetch。
 * @param {typeof fetch} [input.fetchImpl] - 退回路径使用的 fetch。
 * @param {AbortSignal} [input.signal] - 取消信号。
 * @returns {Promise<{ html: string, statusCode?: number, finalUrl?: string,
 *                     truncated?: boolean, via: 'ctx.web' | 'plain-fetch' }>}
 */
export async function fetchNoteHtml({ url, web, fetchImpl, signal }) {
  if (web && typeof web.fetch === 'function') {
    const page = await web.fetch({ url, signal });
    const body = page?.body;
    if (body?.kind === 'html' || body?.kind === 'text') {
      return {
        html: body.content ?? '',
        statusCode: page.statusCode,
        finalUrl: page.url,
        truncated: page.truncated,
        via: 'ctx.web',
      };
    }
    throw new Error(
      `抓取返回了不支持的内容类型（body.kind=${body?.kind ?? 'undefined'}），`
      + '小红书笔记页应当是 html',
    );
  }

  const impl = fetchImpl ?? globalThis.fetch;
  if (typeof impl !== 'function') {
    throw new Error('组合里没有 ctx.web，当前运行时也没有 fetch，无法抓取笔记页');
  }
  const response = await impl(url, {
    headers: { 'user-agent': DESKTOP_UA, accept: 'text/html,*/*' },
    signal,
  });
  const html = await response.text();
  return {
    html,
    statusCode: response.status,
    finalUrl: response.url || url,
    truncated: false,
    via: 'plain-fetch',
  };
}
