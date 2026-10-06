/**
 * 纯关键词检索。
 *
 * 有意不做 embedding、不做 LLM 重排：
 *   - DeepSeek 不提供 embedding API，本安装包里也没有任何向量检索包
 *   - 检索过程完全可解释，命中依据可以原样返回给模型和用户
 *
 * 中文没有词边界，所以分词策略是：
 *   - CJK 连续串 → 单字 + 相邻双字（bigram）。bigram 让「收纳」这类高频词
 *     比两个孤立单字「收」「纳」得分更高，是零依赖下最接近分词的近似。
 *   - 拉丁字母／数字 → 按非字母数字切分，长度 >= 2 的词。
 */

/** 中文（含扩展 A）与日文假名按 CJK 处理。 */
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const LATIN_WORD = /[a-z0-9_]+/g;

/**
 * 把一段文本切成检索 token。
 *
 * @param {string} text - 待切分文本。
 * @returns {string[]} token 列表，保留重复（重复代表出现次数）。
 */
export function tokenize(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const lowered = text.toLowerCase();
  const tokens = [];

  // 拉丁词与数字。
  for (const match of lowered.matchAll(LATIN_WORD)) {
    if (match[0].length >= 2) tokens.push(match[0]);
  }

  // CJK 连续串 → 单字 + bigram。
  const runs = lowered.split(/[^\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/);
  for (const run of runs) {
    if (!run) continue;
    const chars = [...run];
    for (let i = 0; i < chars.length; i += 1) {
      if (!CJK.test(chars[i])) continue;
      tokens.push(chars[i]);
      if (i + 1 < chars.length && CJK.test(chars[i + 1])) {
        tokens.push(chars[i] + chars[i + 1]);
      }
    }
  }

  return tokens;
}

/**
 * 为一篇笔记建立词频表，标题单独统计以便加权。
 *
 * @param {{ title?: string, text?: string }} note - 笔记记录。
 * @returns {{ title: Map<string, number>, body: Map<string, number> }}
 */
function termFrequencies(note) {
  const count = (value) => {
    const map = new Map();
    for (const token of tokenize(value)) {
      map.set(token, (map.get(token) ?? 0) + 1);
    }
    return map;
  };
  return { title: count(note.title ?? ''), body: count(note.text ?? '') };
}

/** 标题命中比正文命中重要得多：用权重而不是过滤器表达。 */
const TITLE_WEIGHT = 3;
const BODY_WEIGHT = 1;

/** 只出现在正文里一次的弱 token 会制造大量噪声，低于此分不返回。 */
const MIN_SCORE = 1;

/** 摘要窗口：命中位置前后各取这么多字符。 */
const SNIPPET_PADDING = 60;

/** 多字 CJK token（bigram）视为"精确"命中；单字视为"放宽"命中。 */
function isPreciseToken(token) {
  return [...token].length > 1;
}

/**
 * 放宽遍里必须排除的高频虚字。
 *
 * 没有这张表时，查询「完全不相干的词」会切出单字「的」，而「的」几乎出现在
 * 每篇中文笔记里 —— 结果是"毫不相干的查询也返回一堆结果"。
 * 单字兜底本身是必要的（bigram 跨词边界会漏），但只对**有区分度的字**成立。
 *
 * 这是一张朴素的常用虚字表，不追求语言学完备：漏掉几个最多让噪声多一点，
 * 误杀某个实词才会真的降低召回，所以只收录几乎从不承载检索意图的字。
 */
const CJK_STOPWORDS = new Set([
  ...'的了吧呢吗啊呀哦嗯是在有和与及或也就都还很太更最把被给让使对从向往上下里中'
  + '这个那个这些那些一个什么怎么为什么可以能够因为所以但是如果那么虽然不过然后而且'
  + '我你他她它们自己之其于以为所被把着过起来出来进去下去不过还再又已经正在将要想说',
]);

/**
 * 一个 token 是否适合参与放宽遍。
 *
 * @param {string} token - 待判断 token。
 * @returns {boolean} 多字 token 或非虚字单字返回 true。
 */
function isDiscriminative(token) {
  if (isPreciseToken(token)) return true;
  return !CJK_STOPWORDS.has(token);
}

/**
 * 生成以命中位置为中心的摘要。
 *
 * @param {string} text - 正文。
 * @param {string[]} queryTokens - 查询 token（已小写）。
 * @returns {string} 摘要文本。
 */
function buildSnippet(text, queryTokens) {
  if (!text) return '';
  const lowered = text.toLowerCase();
  let hit = -1;
  for (const token of queryTokens) {
    const index = lowered.indexOf(token);
    if (index !== -1 && (hit === -1 || index < hit)) hit = index;
  }
  if (hit === -1) {
    return text.length <= SNIPPET_PADDING * 2
      ? text
      : `${text.slice(0, SNIPPET_PADDING * 2)}…`;
  }
  const start = Math.max(0, hit - SNIPPET_PADDING);
  const end = Math.min(text.length, hit + SNIPPET_PADDING);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

/**
 * 用一组 token 给所有笔记打分。
 *
 * @param {object[]} notes - 候选笔记。
 * @param {string[]} tokens - 参与匹配的 token。
 * @param {number} limit - 最多返回条数。
 * @returns {object[]} 已排序结果。
 */
function scoreNotes(notes, tokens, limit) {
  const scored = [];
  for (const note of notes) {
    const frequencies = termFrequencies(note);
    let score = 0;
    const matchedTokens = [];

    for (const token of tokens) {
      const inTitle = frequencies.title.get(token) ?? 0;
      const inBody = frequencies.body.get(token) ?? 0;
      if (inTitle === 0 && inBody === 0) continue;

      // 子线性：同一 token 出现 10 次不等于相关度是 1 次的 10 倍。
      //
      // 必须逐个判零再取对数：`Math.log(0)` 是 `-Infinity`，而标题没命中、
      // 正文命中是**最常见**的情形。直接相加会让整条分数变成 `-Infinity`
      // 并被下面的下限过滤掉 —— 症状是"标题里没有查询词的笔记永远搜不到"。
      if (inTitle > 0) score += TITLE_WEIGHT * (1 + Math.log(inTitle));
      if (inBody > 0) score += BODY_WEIGHT * (1 + Math.log(inBody));
      matchedTokens.push(token);
    }

    if (score < MIN_SCORE || matchedTokens.length === 0) continue;

    // 命中 token 种类越多越相关：乘一个覆盖率因子，避免只靠一个高频字取胜。
    const coverage = matchedTokens.length / tokens.length;
    score *= 1 + coverage;

    scored.push({ note, score, matchedTokens });
  }

  scored.sort((a, b) => b.score - a.score || a.note.noteId.localeCompare(b.note.noteId));

  // 设 XHS_RAG_DEBUG=1 时打印打分结果，用于排查"为什么这篇没搜到"。
  // 文件名与函数名曾经因为缺这条日志而查了很久，所以保留它。
  if (process.env.XHS_RAG_DEBUG) {
    console.log(`[xhs-rag] tokens=${JSON.stringify(tokens)} `
      + `scored=${JSON.stringify(scored.map((s) => [s.note.noteId, s.score]))}`);
  }

  return scored.slice(0, limit);
}

/**
 * 在笔记集合中检索。
 *
 * 分两遍，这是中文检索的固有权衡：
 *
 * - **精确遍** 只用多字 token（中文 bigram、拉丁词）。它不会把「租房」误配到
 *   一段只含「房」的文本，但也因此会漏掉「租房厨房」这种词边界切分不同的情况。
 * - **放宽遍** 只在精确遍**完全没有命中**时执行，加入中文单字。它救回召回，
 *   代价是精确度下降，所以结果会被标成 `matchMode: 'loose'`。
 *
 * 两遍都命中时以精确遍为准：宁可少给几条，也不让单字噪声淹没真正的匹配。
 *
 * @param {Array<{ noteId: string, title?: string, text?: string, url: string, author?: string }>} notes
 *   候选笔记。
 * @param {string} query - 用户查询。
 * @param {{ limit?: number }} [options] - `limit` 默认 5。
 * @returns {{
 *   results: Array<{ noteId: string, title?: string, author?: string, url: string,
 *                    snippet: string, score: number, matchedTokens: string[],
 *                    matchMode: 'precise' | 'loose' }>,
 *   queryTokens: string[],
 *   matchMode: 'precise' | 'loose',
 *   relaxed: boolean,
 *   scanned: number,
 * }}
 *   `queryTokens` 与 `matchMode` 回传是为了让"为什么命中/没命中"可诊断。
 */
export function searchNotes(notes, query, options = {}) {
  const limit = options.limit ?? 5;
  const queryTokens = [...new Set(tokenize(query))];

  if (queryTokens.length === 0) {
    return {
      results: [], queryTokens, matchMode: 'precise', relaxed: false, scanned: notes.length,
    };
  }

  const preciseTokens = queryTokens.filter(isPreciseToken);

  // 放宽遍的候选：排除虚字，避免「的」这种几乎无处不在的字制造满屏噪声。
  // 单字查询同样要过滤 —— 否则搜「的」会命中几乎所有笔记。
  const looseTokens = queryTokens.filter(isDiscriminative);

  if (looseTokens.length === 0) {
    // 查询里一个有区分度的 token 都没有（例如只输入了「的」）。
    return {
      results: [], queryTokens, matchMode: 'precise', relaxed: false, scanned: notes.length,
    };
  }

  // 精确遍只用多字 token；查询本身就是单字时退回放宽候选（已排除虚字）。
  const fallbackTokens = preciseTokens.length > 0 ? preciseTokens : looseTokens;

  let matchMode = 'precise';
  let relaxed = false;
  let hits = scoreNotes(notes, fallbackTokens, limit);

  // 精确遍空手而归，且查询里确实还有单字可放宽时才放宽 —— 否则就是真的没命中。
  if (hits.length === 0 && preciseTokens.length > 0 && preciseTokens.length < looseTokens.length) {
    hits = scoreNotes(notes, looseTokens, limit);
    if (hits.length > 0) {
      matchMode = 'loose';
      relaxed = true;
    }
  }

  const results = hits.map(({ note, score, matchedTokens }) => ({
    noteId: note.noteId,
    title: note.title,
    author: note.author,
    url: note.url,
    snippet: buildSnippet(note.text ?? '', matchedTokens),
    score: Math.round(score * 1000) / 1000,
    matchedTokens,
    matchMode,
  }));

  return { results, queryTokens, matchMode, relaxed, scanned: notes.length };
}
