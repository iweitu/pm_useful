# 小红书收藏 → 生活决策助手（RAG 教学演示页）

一个**单文件、离线可用、不发任何网络请求**的 RAG 教学演示页：把 12 条构造的小红书帖子当作「你的收藏」，
走完 `分块 → 分词 → 建索引 → 意图与检索词 → BM25 打分 → Prompt → 决策建议`，
并在首屏用**有 RAG / 无 RAG 两栏对照**说明「把收藏喂给模型」到底带来了什么。

- **规格**：[`docs/prd/02-rag-web-demo-PRD.md`](../../docs/prd/02-rag-web-demo-PRD.md)（v0.4，权威）
- **施工图**：[`docs/prd/05-实现交接说明.md`](../../docs/prd/05-实现交接说明.md)
- **页面**：[`rag-demo-20261006-v4.html`](rag-demo-20261006-v4.html)（160 KB）

## 快速开始

```powershell
# 方式 A：本地 HTTP（推荐，便于多浏览器/截图/录屏）
node tools/serve.mjs            # 默认 http://127.0.0.1:8788/，端口被占用会自动往后找
node tools/serve.mjs 9000       # 也可指定端口

# 方式 B：直接双击（file:// 同样全功能）
start rag-demo-20261006-v4.html

# 重跑验证（需要 Node ≥ 18，无第三方依赖）
node tools/verify-v4.mjs        # 核心逻辑 + 静态检查：81 项
node tools/ui-smoke-v4.mjs      # UI 冒烟（自带最小 DOM 垫片，不需要浏览器）：39 项
node tools/ground-truth.mjs     # 打印语料 / 索引 / 回答的真值，便于人工核对
```

预期输出：`81 通过 / 0 失败`、`39 通过 / 0 失败`；页面内还有 23 项**加载时当场复算**的「实现自检」。

## 目录

| 路径 | 说明 |
|---|---|
| `rag-demo-20261006-v4.html` | **当前交付物**（单文件，CSS/JS/数据全内嵌） |
| `data/xhs-notes-3themes.json` | 语料源（12 条构造帖子，3 主题：云南旅游 / 上海餐厅 / 敏感肌油皮粉底液） |
| `data/answers-v4.json` | 真实 LLM 回答源（7 条 query × 有 RAG / 无 RAG 两段 + 人工对照小结） |
| `tools/serve.mjs` | 零依赖本地静态服务器（只在 127.0.0.1 监听），把页面挂在 http:// 上 |
| `tools/verify-v4.mjs` | 从交付物里**抽出真实代码**跑检查（核心/静态 81 项），含独立重写的 BM25 与三遍管线比对 |
| `tools/ui-smoke-v4.mjs` | 最小 DOM 垫片跑 UI 全链路（39 项），不需要浏览器 |
| `tools/ground-truth.mjs` | 打印真值（N / 词典 / avgdl / 保真 / prompt hash 等） |
| `tools/inject.mjs`、`tools/inject-answers.mjs` | 把 `data/` 注入页面占位符（`__MOCK_DATA_JSON__` / `__LLM_ANSWERS_JSON__`） |
| `archive/` | 历史版本：`-20261005`、`-20261006`、`-20261006-v3`（回滚 = 换回旧文件） |

## 页面里有什么（7 个环节 / 四类标记）

| 标记 | 环节 | 说明 |
|---|---|---|
| ✅ 真实 | ③ 分块 · ④ 分词 · ⑤ 建索引 · ⑧ Prompt 组装 | 页面当场计算，可人工复算 |
| ✅ 真实 LLM 产出 | ⑨ 决策建议与出处 | 真实模型输出，**离线预生成后内嵌**；用 `promptSha` 校验，一致才展示 |
| 🔶 模拟 | ⑥ 意图识别与检索词构建 | 真实系统里由 LLM 完成，页面用规则 + 预置映射近似 |
| 🔶 混合来源 | ⑦ 检索与打分 | BM25 计算是真的，但参与打分的词有一部分来自 ⑥ 的改写；逐词标出来源 |

**首屏两块主角**：`❓ 我的问题`（5 条预置 + 4 条边界复现，点一下只填入不执行）与
`✅ 最终决策建议`（有 RAG / 无 RAG 两栏并排 + 人工对照小结）。其余模块默认收起，
表头保留关键数字；标题旁的 **i** 悬停即出说明。

## 改数据的正确姿势

页面是自包含的，数据已经内嵌进 HTML。要改语料或回答：

1. 改 `data/xhs-notes-3themes.json` 或 `data/answers-v4.json`；
2. 用 `tools/inject*.mjs` 注入回页面 —— **注意**这两个脚本要求 HTML 里各有一个占位符
   （`__MOCK_DATA_JSON__` / `__LLM_ANSWERS_JSON__`），已经注入过的文件不再有占位符；
   从 `archive/` 里的原始骨架重建，或直接用脚本第二形态（见脚本头部注释的用法）；
3. 改完必须重跑 `node tools/verify-v4.mjs`：**改了 prompt 模板却忘了重生成回答时，脚本会红字报错**
   （它逐条比对 `promptSha`）。

## 已知未验证项（需要人在真机上过一遍）

- **断网双击**：本页无任何网络请求（脚本已静态扫描确认），但「真机断网打开」仍建议人工确认一次；
- **窄窗口**：1040px 以下会退化成单栏；页面内置「布局自检」，刷新后在底部「实现自检」里能看到结果。

## 关联

- 需求伙伴 agent：[`agents/prd-partner/`](../../agents/prd-partner/README.md)（只写需求、不做实现）
- 知识来源：`knowledge/一文完全读懂RAG.md`
- 真实检索实现参照：`dsh-plugin-starter/xhs-rag/`（本页用真 BM25，与它**不同**，结论不可外推）
