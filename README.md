# Personal AI Knowledge Base

申子昂的个人 AI 知识与自动化资产仓库，用于沉淀可复用的工作流、工具、Prompt 和领域知识。

## 目录导航

| 目录 | 用途 | 当前内容 |
|---|---|---|
| `skills/` | DSH 可加载技能（SKILL.md） | 见下方索引 |
| `agents/` | Agent 工作流与协作配置 | 待填充 |
| `tools/` | 自定义工具与自动化脚本 | 待填充 |
| `prompts/` | 高质量 Prompt 模板库 | 待填充 |
| `knowledge/` | 领域知识、学习笔记与参考资料 | 见下方索引 |

## 技能索引

DSH 的 skill 不是插件，靠扫描目录发现，`dsh plugin add` 装不了。本项目技能放在 `skills/<name>/SKILL.md`，名称须为 kebab-case，`description` 是模型唯一的路由依据。

| 技能 | 解决什么 | 怎么触发 |
|---|---|---|
| [prd-writer](skills/prd-writer/SKILL.md) | 零散需求 → 可评审的结构化 PRD | “写 PRD”“把这个需求整理成文档” |
| [prd-review](skills/prd-review/SKILL.md) | 评审视角挑 PRD 漏洞并给改法 | “评审这个 PRD”“方案有没有问题” |
| [meeting-action-items](skills/meeting-action-items/SKILL.md) | 会议纪要 → 可跟进待办清单 | “从纪要提取待办”“整理 action items” |
| [competitor-analysis](skills/competitor-analysis/SKILL.md) | 竞品功能对比与差异化结论 | “分析竞品”“我们和对手差在哪” |
| [priority-scoring](skills/priority-scoring/SKILL.md) | RICE/ICE 量化需求优先级 | “排需求优先级”“先做哪个” |
| [user-feedback-synthesis](skills/user-feedback-synthesis/SKILL.md) | 用户反馈聚类成需求主题与证据 | “整理用户反馈”“访谈总结” |

### 安装到全局（可选）

仓库内的技能只在 `pm_useful` 项目里能被扫到。要在任意项目使用，把技能同步到用户级根目录：

```powershell
Copy-Item -Recurse -Force .\skills\* "$env:USERPROFILE\.dsh\skills\"
```

DSH 按 rank 扫描六个根目录，项目级优先于用户级；同名技能不会合并，只有 rank 更小的胜出。

## 知识库索引

| 文档 | 主题 | 说明 |
|---|---|---|
| [一文完全读懂RAG](knowledge/一文完全读懂RAG.md) | RAG 全链路 | 从原理、检索方法、Query 改写、Rerank 到评估体系与框架选型，含一个完整实战 |

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
