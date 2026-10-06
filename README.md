# Personal AI Knowledge Base

申子昂的个人 AI 知识与自动化资产仓库，用于沉淀可复用的工作流、工具、Prompt 和领域知识。

## 目录导航

| 目录 | 用途 | 当前内容 |
|---|---|---|
| `skills/` | DSH 可加载技能（SKILL.md） | 见下方索引 |
| `agents/` | DSH agent preset（bundle 补丁） | 见 Agent 索引 |
| `demo/` | 可交付的单文件演示/工具（含数据源与验证脚本） | 见 Demo 索引 |
| `docs/` | 需求与设计过程文档 | [PRD 索引](docs/prd/) |
| `xhs-kit/` | 小红书链接解析工具包（Python，零依赖）+ 完整技能文档 | 见「小红书链接解析」一节 |
| `tools/` | 自定义工具与自动化脚本 | 见 tools 索引 |
| `prompts/` | 高质量 Prompt 模板库 | 待填充 |
| `knowledge/` | 领域知识、学习笔记与参考资料 | 见下方索引 |

## Demo 索引

每个 demo 目录都是**自包含**的：单文件产物 + 数据源 + 可重跑的验证脚本，拷到别的机器也能独立使用。

| Demo | 是什么 | 怎么用 |
|---|---|---|
| [rag-decision-agent](demo/rag-decision-agent/README.md) | 小红书收藏 → 生活决策助手：单文件离线 RAG 教学演示页，首屏用「有 RAG / 无 RAG」两栏对照证明价值 | 双击 `rag-demo-20261006-v4.html`；验证 `node tools/verify-v4.mjs`（81 项）与 `node tools/ui-smoke-v4.mjs`（39 项） |

对应的规格文档：[RAG 教学演示页 PRD](docs/prd/02-rag-web-demo-PRD.md)（v0.4）与 [实现交接说明](docs/prd/05-实现交接说明.md)。

## Agent 索引

DSH 里的"一个 agent"不是独立程序，而是一棵 Cordis 配置树加若干插件：profile 按顺序叠加 bundle 补丁，
得到 Loader entry 树。**新增或覆盖一个 agent preset，本质就是插入（或按行 id 覆盖）一行
`@deepseek-ai/dsh-agent-preset`，再用 `plugin_manager` 装到 profile。** 本目录存放这类 bundle。

| Agent | 定位 | 关键取舍 |
|---|---|---|
| [prd-partner](agents/prd-partner/README.md) | 只协助完善 PRD，不承担开发实施 | 不挂载任何命令执行、终端、后台任务、子 agent 与 workflow 工具，结构上没有开发手段 |

`prd-partner` v1.1 起带**输出契约**：每次产出都以「一页需求卡」开头，正文按固定 12 节骨架写，
有明确的效率规则（一轮最多问 3 个带默认答案的问题、已定案不再重问、只改必要章节）与写作规则
（表格优先、编号互引必须落地、状态词只用【已定】【待确认】【已否决】）。细节见它的 README。

安装、验证与调整步骤见各 agent 自己的 README。`dsh-plugin-starter/` 里有最小可用的 bundle 模板和
`check.mjs`；`tools/verify-agent-bundle.mjs` 是本仓库的补丁结构与包名校验器（对照 DSH 的可加载包清单，
能查出写错的包名）。

## 技能索引

DSH 的 skill 不是插件，靠扫描目录发现，`dsh plugin add` 装不了。本项目把技能**源文件**放在
`skills/<name>/SKILL.md`，名称须为 kebab-case，`description` 是模型唯一的路由依据。

| 技能 | 解决什么 | 怎么触发 |
|---|---|---|
| [prd-writer](skills/prd-writer/SKILL.md) | 零散需求 → 可评审的结构化 PRD | “写 PRD”“把这个需求整理成文档” |
| [prd-review](skills/prd-review/SKILL.md) | 评审视角挑 PRD 漏洞并给改法 | “评审这个 PRD”“方案有没有问题” |
| [meeting-action-items](skills/meeting-action-items/SKILL.md) | 会议纪要 → 可跟进待办清单 | “从纪要提取待办”“整理 action items” |
| [competitor-analysis](skills/competitor-analysis/SKILL.md) | 竞品功能对比与差异化结论 | “分析竞品”“我们和对手差在哪” |
| [priority-scoring](skills/priority-scoring/SKILL.md) | RICE/ICE 量化需求优先级 | “排需求优先级”“先做哪个” |
| [user-feedback-synthesis](skills/user-feedback-synthesis/SKILL.md) | 用户反馈聚类成需求主题与证据 | “整理用户反馈”“访谈总结” |
| [xhs-link-parse](skills/xhs-link-parse/SKILL.md) | 小红书链接/分享文案 → 结构化笔记内容；拿不到正文时**说明原因**（登录墙 / 风控 / 仅浅解析），不顺着标题编内容 | “解析这个小红书链接”“这段分享文案”“为什么它解析不出来” |

### 同步到扫描根（必需）

仓库里的 `skills/` **本身不是扫描根**，DSH 不会发现它——写在这里只是便于版本管理。`dsh-skill-filesystem`
按 rank 扫描的是下面这些位置：

| Rank | 来源 | 路径 |
|---|---|---|
| 100 | 项目级 | `<项目根>/.dsh/skills` |
| 200 | 项目级 | `<项目根>/.agents/skills` |
| 300 | 自定义 | `customSkillDirs` 配置项 |
| 400 | 用户级 | `~/.dsh/skills` |
| 500 | 用户级 | `~/.agents/skills` |

`<项目根>` 是包含 `.git` 的最近祖先目录。要能用，就把技能复制进项目级根，或同步到用户级根（在任意
项目都生效）：

```powershell
Copy-Item -Recurse -Force .\skills\* "$env:USERPROFILE\.dsh\skills\"
```

扫描根共六个（含 rank 600 的随包目录）。同名技能不会合并，只有 rank 更小的胜出；`dsh-skill-filesystem`
会监视这些目录，新增、改名或删除技能无需重启即可被下一次会话看到。

## tools 索引

| 脚本 | 用途 | 依赖与用法 |
|---|---|---|
| [add-profile-bundle.mjs](tools/add-profile-bundle.mjs) | 用 CLI 路径安装本地 bundle 时，把包名幂等地追加进 profile 的 `dsh.profile.bundles`（`pnpm add file:...` 只负责装包，不负责登记这一层） | 任意 Node.js；`node tools/add-profile-bundle.mjs <profile 目录> <包名...> [--dry-run]` |
| [verify-agent-bundle.mjs](tools/verify-agent-bundle.mjs) | 静态校验 agent bundle：manifest 形状、补丁方言、preset 必填字段与 id 语法、行 id 重复、以及每个插件包名是否在 DSH 可加载清单内 | 需要一个 YAML 解析器；`node tools/verify-agent-bundle.mjs <bundleDir> --yaml <yaml/dist/index.js> --packages <packages.md> [--dump]`。`--dump` 打印解析后的声明，便于人工核对块标量里的中文与多行文本 |

`tools/asar-dump.js` 是读取 `app.asar` 的通用工具（`list` / `cat` / `get` / `getdir`）。桌面版的 DSH
插件包与包内 README 都在 asar 里，PowerShell、ripgrep、glob 都打不开，只能先导出来再读。`getdir`
按相对结构导出整个目录，因此可以把 DSH 自带的 YAML 解析器提出来，供 `verify-agent-bundle.mjs`
离线校验：

```powershell
$node = "C:\Users\oshen\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
& $node .\tools\asar-dump.js getdir "G:\DeepSeek_Harness\resources\app.asar" `
    ".\.cache\dsh-yaml-lib" "/dsh/node_modules/yaml"
```

放在工作区的 `.cache/`（已 gitignore）而不是 `$env:TEMP`：DSH 每个会话会给一个新的临时目录，
临时路径下次就用不了，而 `.cache/` 能跨步骤复用。

顺带记一个坑：asar 的数据区起点是 **`8 + headerSize`**（即 `16 + jsonSize`）。写成 `16 + headerSize`
会让每个导出文件前后各错位 8 字节——文本读着还算正常，源码首行却像语法错误。`tools/asar-dump.js`
里有头部断言拦截这种读法；`dsh-extract/` 下是修好偏移后保留的旧原型，已被前者取代。

## 知识库索引

| 文档 | 主题 | 说明 |
|---|---|---|
| [一文完全读懂RAG](knowledge/一文完全读懂RAG.md) | RAG 全链路 | 从原理、检索方法、Query 改写、Rerank 到评估体系与框架选型，含一个完整实战 |

## 小红书链接解析（xhs-kit）

把「小红书链接 / 分享文案 / 已保存的网页快照」变成 Agent 能用的结构化笔记内容（标题/正文/图集/话题/作者/互动），
并在**拿不到正文时给出准确原因与替代路径**，而不是顺着标题编内容。

| 位置 | 内容 |
|---|---|
| [skills/xhs-link-parse/SKILL.md](skills/xhs-link-parse/SKILL.md) | 技能入口（决策树 + 红线），指向下面的工具与文档 |
| [xhs-kit/xhs_kit.py](xhs-kit/xhs_kit.py) | 解析器，纯标准库零依赖；子命令 `share` / `html` / `resolve` / `fetch` / `api` |
| [xhs-kit/tests/](xhs-kit/tests/) | 单元测试与 fixtures（`login_wall` / `risk_control` / `og_only` / `pc_note`） |
| [小红书链接解析_调研与能力方案.md](小红书链接解析_调研与能力方案.md) | 背景调研：豆包 / 飞猪等 App 的数据来源、合规红线与能力方案 |

**一句话前提**：小红书 Web 是强登录站点，未登录匿名请求**拿不到正文**；分享链接能解析出的只有卡片级元数据。
声称「未登录就能读全文」的，要么服务端有登录态、要么用了外部数据服务、要么只拿到了标题 + 封面。

## 使用约定

- 工具脚本应附用途、依赖和运行示例。
- Prompt 模板应说明适用场景、输入变量和预期输出。
- 知识文档优先使用清晰、可检索的 Markdown 结构。

## 文档收录约定（从飞书导出时）

本仓库的领域知识多来自飞书文档。飞书导出为 Markdown 时，**私有资源不会随导出保留**，直接提交会留下大量失效标签。收录时按以下规则处理：

- **图片**：飞书图片链接会失效，替换为 `> 📷 原图说明：…`，保留导出时携带的图片描述文字。
- **嵌入表格**（`<sheet>`）：数据不会随导出保留，替换为
  `> ⚠️ 原表格未随导出保留（飞书嵌入表格）。原表应有：…`，注明原表内容，便于回原文补齐。
- **白板 / 画板**（`<whiteboard>`）：替换为同类提示。
- **内部文档引用**（`<cite>`）：只保留文档标题，去掉内部 ID。

原则是**不静默丢弃信息**：丢失的内容必须显式标注，而不是留一个空段落。
