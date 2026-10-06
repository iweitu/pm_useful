# @local/xhs-rag — 小红书收藏库 + 关键词检索

一个 DSH Host 插件包（bundle）。装进 profile 后，模型获得两个工具：

| 工具 | 作用 |
|---|---|
| `xhs_import` | 粘贴小红书分享链接或分享文案 → 展开短链 → 抓取 → 解析 → 落库 |
| `xhs_search` | 在收藏库里做关键词检索，返回带分数与命中依据的结果 |

配套一段 system prompt 段，规定**只有当用户提到「收藏」时才检索**。

没有 UI 插件：模型调用工具时对话流里会出现工具卡片，这就是"看到活动"。

---

## 一、先看这个：能力边界

这个包的诚实边界比它的功能更重要。

**小红书笔记页是 JS 渲染的，正文不在 HTML 里。** 实测（[来源](https://dev.to/programming_withjackche/xiaohongshu-share-links-have-two-domains-and-one-of-them-will-fail-silently-hpd)）：
剥掉 `<script>` 后只剩约 264 字符导航外壳。纯 HTTP 能拿到的只有
`<title>` 与 `<meta name="description">`（后者恰好包含完整文案），以及作者名。

| 能拿到 | 拿不到 |
|---|---|
| 标题、正文文案、作者、笔记 URL | 图片内容、互动数据（赞藏评）、评论 |

因此：

- **图片型笔记（正文就一句"看图"）抓回来几乎是空的。** 这类笔记仍然入库，但会带
  `degraded` 标记与具体原因；检索结果里也有 `degraded: true`，模型被要求引用时说明这一点。
- **没有 embedding。** DeepSeek 不提供 embedding API，本安装包里也没有任何向量检索包。
  检索是纯关键词匹配，所以语义相近但用词不同的查询不会命中。

这两条不是待办，是当前方案的固有上限。要让它们变好，需要接 OCR/视觉模型与外部 embedding 服务。

---

## 二、安装

### 用创造模式会话（推荐）

在带创造模式的会话里说：

> 把 `<绝对路径>\dsh-plugin-starter\xhs-rag` 用 `plugin_manager` 的
> `install_bundle` 装到当前 profile。

`install_bundle` 会自己完成包安装与 bundle 选择。**不要**手写 profile 的
`package.json` / `cordis.patch.yml`，也**不要**在 profile 目录里跑 pnpm。

### 手动（CLI）

```powershell
$node = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
$pnpm = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.cjs"

& $node $pnpm --dir "$env:DSH_PROFILE_DIR" add "file:<绝对路径>\dsh-plugin-starter\xhs-rag"
```

然后把 `@local/xhs-rag` 加进 `$env:DSH_PROFILE_DIR\package.json` 的 `dsh.profile.bundles`。

### 重启要求（重要）

- 首次安装通常能通过 HMR 生效
- **替换已安装包的 JavaScript 必须重启 Harness** 才会加载新的模块代次
- 已经打开的会话不会获得新工具集，需要**新开一个会话**
- `desktop` profile 名被 Electron 占用，CLI 会拒绝针对它的启动与配置 dump 请求

---

## 三、使用

```
你：把这几条收藏一下
    https://xhslink.cn/o/AxnRePgIokn
    复制这条信息，打开【小红书】查看 😊 https://xhslink.com/o/1WiQ1QI6Uc0

（模型调用 xhs_import，返回每条链接的状态）

你：我收藏里有没有讲收纳的？
（模型调用 xhs_search，命中后结合 snippet 回答）
```

`xhs_import` 的返回是**逐条状态**，不是笼统的成功/失败：

| status | 含义 |
|---|---|
| `ok` | 抓取成功且内容可用 |
| `degraded` | 已入库，但内容不完整（图片型笔记／风控页／正文过短） |
| `updated` | 该笔记已存在，本次覆盖刷新 |
| `fail` | 明确失败，带原因（展开超限、抓取报错…） |

报告里还会带 `notes` 数组说明被跳过的链接、去重数、超上限数，以及
`unrecognisedLinks` —— 属于小红书域名但不是笔记页的链接（例如用户主页），
它们**不会被静默丢弃**。

### 配置项

在 `cordis.patch.yml` 的 `xhs-rag` 行里覆盖：

| 字段 | 默认 | 含义 |
|---|---|---|
| `homeDir` | `''` | 留空时用 `$DSH_HOME`。收藏库落在 `<homeDir>/storages/xhs-rag/notes.json` |
| `maxResults` | `5` | 单次检索返回上限（也是工具 schema 里声明的上限） |
| `maxLinksPerImport` | `20` | 单次导入处理的链接上限，超出部分会报告 |
| `surfaceDegraded` | `true` | 检索结果里是否附带 degraded 原因 |

**注意：patch 是整体替换 config，不是深合并。** 覆盖这一行时要把想保留的字段全部重述。

---

## 四、已证 / 待证

诚实地分开：哪些是离线可证明的，哪些只能在真实环境里验证。

### 已证（离线测试，98 项断言全绿：44 + 31 + 23）

```powershell
$node = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
& $node .\test\run-all.mjs
```

| 套件 | 覆盖 |
|---|---|
| `offline.test.mjs` | 链接提取（两个短链域名、长链两种路径、去重、尾部全角标点、非笔记链接报告）、页面解析（正常／图片型／风控页／仅标题／404／属性顺序颠倒／HTML 实体） |
| `search.test.mjs` | 分词、打分、精确遍与放宽兜底的边界、虚字过滤、摘要生成 |
| `store.test.mjs` | 持久化、覆盖、删除、原子写、损坏文件容错、版本不符、入参校验 |

测试固件里包含一条**防静默降级的回归测试**：断言 `xhslink.cn` 和 `xhslink.com`
都被识别为短链。丢掉任何一个都会重现"看起来成功但内容稀薄"的故障。

### 待证（必须用真实环境验证）

| 假设 | 怎么验 |
|---|---|
| 小红书笔记页的 `meta description` 确实含完整文案 | 粘一条真链接，看 `xhs_import` 的 `text` 字段 |
| 短链 302 的 `Location` 头可读（`redirect: 'manual'` 路径） | 同上，看是否报"展开失败" |
| 桌面 UA 能拿到笔记页而不是 App 下载页 | 看 `statusCode` 与 `degraded` 原因 |
| DSH 的 `ctx.web.fetch()` 返回 `body.kind === 'html'` 且内容非空 | 看导入报告里的 `via` 字段是否为 `ctx.web` |
| 工具 schema 与 system prompt 段能正确组装进请求 | 新会话里问一个"收藏"相关问题，看模型是否调用 `xhs_search` |

### 解析层可替换性（刻意的设计）

内容获取被隔离在 `fetch-note.js` 与 `parse.js` 两个文件里：

- 短链展开走 **Node 内置 `fetch` + `redirect: 'manual'`**。这不是偏好 —— DSH 交付的
  抓取后端只允许**同源重定向**，而 `xhslink.com` → `xiaohongshu.com` 是跨源的，
  用 `ctx.web.fetch` 展开必然失败。
- 笔记页获取走 **`ctx.web.fetch()`**，它自带 URL 校验、仅公开地址、连接固定、
  charset 解码与字节上限，比裸 fetch 安全。组合里没有 `web` 服务时自动退回裸 fetch，
  并在导入报告里标注 `未经 ctx.web 直接抓取（组合里没有 web 服务），未做地址安全校验`。

要换成 MCP 数据源或自建抓取，只需替换这两个文件，其余全部不动。

---

## 五、文件结构

```
xhs-rag/
├── package.json          清单：dsh.bundle.patch 指向 cordis.patch.yml
├── cordis.patch.yml      Loader patch：插入 xhs-rag 行
├── index.js              插件入口：配置、两个工具注册、system prompt 段
├── urls.js               链接提取与规范化（纯函数，无 IO）
├── parse.js              HTML → 笔记（纯函数，含 degraded 判定）
├── search.js             分词与关键词打分（纯函数）
├── store.js              JSON 持久化 + 内存缓存（原子写）
├── fetch-note.js         短链展开 + 页面获取（唯一的 IO 边界）
└── test/                 离线测试，不依赖 DSH 运行时
```

---

## 六、开发这个包时踩到的 API 陷阱

这三条都是**动手时才会撞上、撞上就插件加载不了**的，写下来避免重复踩：

### 1. `Config` 不能用对象字面量

```js
// 错：Schema.from() 只接受原生类型、构造函数或已是 schema 的值。
// 传普通对象会抛 `cannot infer schema from [object Object]`，插件直接加载失败。
export const Config = { maxResults: { type: 'natural', default: 5 } };

// 对：schemastery 的调用形式。随附插件（dsh-tool-bash、dsh-subagent-*）都是这么写的。
import z from '@deepseek-ai/schemastery';
export const Config = z.object({ maxResults: z.natural().default(5) });
```

### 2. patch 覆盖是**整体替换 config**，不是深合并

覆盖 `id: xhs-rag` 那一行时，要把想保留的字段全部重述一遍，否则未写出的字段会消失。

### 3. 短链展开不能用 `ctx.web.fetch()`

DSH 交付的抓取后端只允许**同源重定向**；而 `xhslink.com` → `xiaohongshu.com`
是跨源的，用它展开短链必然失败。所以短链展开走 Node 内置 `fetch` +
`redirect: 'manual'`，自己读 `Location` 头。

---

## 七、排查

**设 `XHS_RAG_DEBUG=1` 会打印每次检索的分词与打分结果**，用于回答
"为什么这篇没搜到"：

```powershell
$env:XHS_RAG_DEBUG = "1"
```

| 现象 | 原因与处理 |
|---|---|
| 工具根本不出现 | 包没装成，或会话是安装前开的。**新开一个会话**；改过 JS 需重启 |
| 行状态 `overridden` | 更高优先级层覆盖了同一个 `id: xhs-rag` |
| 导入报"展开短链失败" | 短链已失效，或网络不可达。换一条链接 |
| 导入全是 `degraded` 且原因含"正文过短" | 正常现象 —— 该笔记正文在图片里，纯文本抓不到 |
| 检索没命中 | 纯关键词匹配。换用笔记里可能出现的**原词**；先看 `queryTokens` 判断分词是否合理 |
| 返回 `matchMode: "loose"` | 精确词组没命中，结果是放宽到单字匹配的，相关度较低 |
| 模型每次回答都去检索 | system prompt 段没生效（段落被覆盖或 `systemPrompt` 服务缺失） |
| 收藏库文件损坏 | 会自动按空库启动并在导入报告里提示；重新导入即可重建 |
| 插件加载报 `cannot infer schema from [object Object]` | `Config` 写成了对象字面量，见第六节第 1 条 |

收藏库是**纯派生缓存**：删掉 `notes.json` 不会丢失任何不可恢复的东西，
重新导入即可。
