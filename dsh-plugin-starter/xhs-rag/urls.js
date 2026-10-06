/**
 * 从用户粘贴的分享文本里提取小红书笔记链接。
 *
 * 这里有意做得比"匹配一个正则"啰嗦，原因是实测教训：小红书分享短链有两个域名，
 * `xhslink.com`（桌面端／旧分享）和 `xhslink.cn`（iOS 分享）。只认一个不会报错 ——
 * 它会安静地走到通用分支，返回一个"看起来成功但内容稀薄"的结果。
 * 具体现象与数据见 https://dev.to/programming_withjackche/xiaohongshu-share-links-have-two-domains-and-one-of-them-will-fail-silently-hpd
 *
 * 因此本模块的契约是：凡是"看起来像小红书链接但我认不出来"的，必须显式报告，
 * 绝不静默跳过或降级。
 */

/** 已知的小红书域名。短链需要展开，长链可以直接用。 */
const SHORT_LINK_HOSTS = new Set(['xhslink.com', 'xhslink.cn']);
const NOTE_HOSTS = new Set(['xiaohongshu.com', 'www.xiaohongshu.com']);

/** 笔记页路径前缀。已知 /explore/ 与 /discovery/item/ 两种。 */
const NOTE_PATH_PREFIXES = ['/explore/', '/discovery/item/'];

/**
 * 分享文本里可能同时出现多条链接和中文文案，且常带全角标点。
 * 这里刻意不用 \b 之类的边界，因为中文与 ASCII 混排时其行为不可靠。
 */
const URL_IN_TEXT = /https?:\/\/[^\s，。,；;）)】\]"'<>#]+/gi;

/**
 * 悬浮在 URL 结尾的标点，通常是文案带来的，不属于链接。
 *
 * 注意 `?` 与 `#` 不在此列：它们是 URL 自身的分隔符，出现在结尾意味着
 * 后面本该跟查询串或片段。把它们当标点剥掉会把长链截断成错误的路径。
 */
const TRAILING_PUNCTUATION = /[.,;:!，。；：！、）)】\]"'』」]+$/;

function normaliseHost(hostname) {
  return hostname.toLowerCase().replace(/\.$/, '');
}

/**
 * 判断一个主机是否属于小红书，并给出它是否需要先展开。
 *
 * @param {string} hostname - 已小写化的主机名。
 * @returns {'short' | 'note' | 'other'}
 */
function classifyHost(hostname) {
  const host = normaliseHost(hostname);
  if (SHORT_LINK_HOSTS.has(host)) return 'short';
  if (NOTE_HOSTS.has(host)) return 'note';
  // 兼容任意子域，例如 www.xiaohongshu.com 之外的边缘子域。
  if (host.endsWith('.xiaohongshu.com')) return 'note';
  if (host.endsWith('.xhslink.com') || host.endsWith('.xhslink.cn')) return 'short';
  return 'other';
}

/**
 * 从规范化的 URL 里取笔记 id。
 *
 * 前缀按路径段逐个比较，而不是拼字符串：`/explore/<id>` 是单段前缀，
 * `/discovery/item/<id>` 是两段前缀，用同一套逻辑处理可以避免
 * 单段前缀被误判（`/explore/` 后紧跟 id，没有中间段）。
 *
 * @param {URL} url - 已经确认属于笔记域名的 URL。
 * @returns {string | undefined} 笔记 id，路径不匹配时为 undefined。
 */
function noteIdFromUrl(url) {
  const segments = url.pathname.split('/').filter(Boolean);
  for (const prefix of NOTE_PATH_PREFIXES) {
    const parts = prefix.split('/').filter(Boolean);
    if (parts.every((part, index) => segments[index] === part) && segments[parts.length]) {
      return segments[parts.length];
    }
  }
  return undefined;
}

/**
 * 去掉 URL 尾部的文案标点，并处理成对括号被文案截断的情况。
 *
 * @param {string} raw - 正则匹配到的原始 URL 文本。
 * @returns {string} 清理后的 URL 文本。
 */
function trimTrailingPunctuation(raw) {
  let value = raw;
  for (;;) {
    const next = value.replace(TRAILING_PUNCTUATION, '');
    if (next === value) break;
    value = next;
  }
  return value;
}

/**
 * 从一段（或多段）分享文本中提取小红书链接。
 *
 * @param {string | string[]} input - 用户粘贴的原始文本，或文本数组。
 * @returns {{
 *   candidates: Array<{ raw: string, url: string, kind: 'short' | 'note', noteId?: string }>,
 *   unrecognised: string[],
 *   duplicateCount: number,
 * }}
 *   `candidates` 按首次出现顺序去重；`unrecognised` 是看起来像小红书域名但无法归类的
 *   URL 原文（必须让调用方看到，不能丢）。
 */
export function extractNoteLinks(input) {
  const texts = Array.isArray(input) ? input : [input];
  const candidates = [];
  const unrecognised = [];
  const seen = new Set();
  let duplicateCount = 0;

  for (const text of texts) {
    if (typeof text !== 'string') continue;
    URL_IN_TEXT.lastIndex = 0;
    for (const match of text.matchAll(URL_IN_TEXT)) {
      const raw = trimTrailingPunctuation(match[0]);
      if (!raw) continue;

      let url;
      try {
        url = new URL(raw);
      } catch {
        unrecognised.push(raw);
        continue;
      }

      const kind = classifyHost(url.hostname);
      if (kind === 'other') {
        // 不是小红书链接：分享文案里出现别的链接是常事，静默忽略是正确的。
        continue;
      }

      const key = url.href;
      if (seen.has(key)) {
        duplicateCount += 1;
        continue;
      }
      seen.add(key);

      if (kind === 'short') {
        candidates.push({ raw, url: url.href, kind: 'short' });
        continue;
      }

      const noteId = noteIdFromUrl(url);
      if (!noteId) {
        // 是小红书域名但不是笔记路径（首页、用户主页、搜索页…）。
        // 这类链接拿不到笔记，必须显式报告而不是当成解析失败。
        unrecognised.push(raw);
        continue;
      }
      candidates.push({ raw, url: url.href, kind: 'note', noteId });
    }
  }

  return { candidates, unrecognised, duplicateCount };
}

/**
 * 判断一个 URL 是否是需要展开的短链。
 *
 * @param {string} href - 待判断的绝对 URL。
 * @returns {boolean}
 */
export function isShortLink(href) {
  try {
    return classifyHost(new URL(href).hostname) === 'short';
  } catch {
    return false;
  }
}

/**
 * 从展开后的最终 URL 提取笔记 id，并校验它确实落在小红书笔记页上。
 *
 * 展开短链时这一步是必需的：如果对方站点改了结构，我们应当明确失败，
 * 而不是把一个 id 猜出来。
 *
 * @param {string} href - 重定向之后的最终 URL。
 * @returns {{ noteId: string, canonicalUrl: string } | undefined}
 */
export function resolveNoteFromFinalUrl(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return undefined;
  }
  if (classifyHost(url.hostname) !== 'note') return undefined;
  const noteId = noteIdFromUrl(url);
  if (!noteId) return undefined;
  return {
    noteId,
    // 只保留干净路径：原始 URL 上的分享追踪参数（xsec_token / app_platform…）
    // 对后续抓取没有价值，留着只会让同一篇笔记产生多个不同 key。
    canonicalUrl: `https://www.xiaohongshu.com/explore/${noteId}`,
  };
}
