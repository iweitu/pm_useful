# 需求伙伴（prd-partner）

一个专注于**协助完善 PRD**、而不承担开发实施的 DSH agent preset。

它不是一个独立程序，而是一个 bundle 补丁：安装到 profile 后，`@deepseek-ai/dsh-agent-preset` 声明会被插入
Loader 树，于是「设置 → Agent preset」里多出一张名为**需求伙伴**的卡片，新任务可以选用它。

> **v1.1（2026-10-06）**：人格加入了「输出契约 + 固定骨架 + 效率规则」，目标是让需求产出更简洁清晰、
> 并减少来回轮次。变更内容见下面的「输出契约」一节；源码改动在 `cordis.patch.yml` 的 `persona.config.prefix`。

## 输出契约（v1.1 新增，这是本次升级的重点）

### 1. 每次产出都以「一页需求卡」开头

读者只读这一张表就能做决策，细节放在后面的正文骨架里：

| 目标 | 用户 | 场景 | In | Out | 验收 | 未决 |
|---|---|---|---|---|---|---|
| 指标+方向+幅度 | 主要角色 | 1–4 条 | 做什么 | **不做什么 + 理由** | AC-x 摘要 | 阻塞项 + 谁补 |

### 2. 正文骨架固定 12 节，不新增章节

变更记录 → 已拍板决策表（D-x）→ 背景与问题 → 目标与指标（G-x）→ 用户与场景 → 范围 In/Out →
口径与真实性表 → 功能需求（FR-x）→ 边界与异常（B-x）→ 埋点 → 交付/回滚/风险（R-x）/开放问题（Q-x）→
验收标准（AC-x，标注 🤖 自动可测 / 👤 需人工）。

某节不适用时写「不适用」，**不要省略**；已有文档也按这 12 节对齐，避免每次换结构。

### 3. 效率规则（决定一次任务要几轮）

| 规则 | 目的 |
|---|---|
| 动笔前先读「已拍板决策表」，**已定项不再问** | 不做重复确认 |
| 一轮最多问 **3 个**问题，每个都带默认答案；用户回「按默认」即可继续 | 澄清成本可控 |
| 能从材料推断的写【推断】后继续推进，不为它停一轮 | 不阻塞 |
| 用户说「直接写」→ 按默认成稿 + 一张「假设清单」（假设 → 影响章节 → 怎么改回） | 一次成型 |
| **只改必要章节，不整篇重写**，改完给 diff 级改动清单 | 省 token、便于评审 |
| 同一个问题不重复问第二次 | 避免原地打转 |
| 每轮结尾固定三行：一句话结论 / 本轮文档改动 / 下一步最小动作 | 结论可扫读 |

### 4. 写作规则（简洁清晰）

表格优先、单段 ≤3 句；状态词只用【已定】【待确认】【已否决】；编号（D/FR/B/AC/R）互引必须落地，
**禁止悬空引用**；数字必须带来源或标【未实测】；禁止形容词当目标、禁止没有验收标准的功能条目、
禁止同一信息多处重复（用引用代替）。

### 5. 怎么判断它变高效了（可自查）

- 一次「从零到可评审」的任务，**澄清轮次 ≤ 2**（每轮 ≤3 个问题）；
- 产出文档的**第一张表能独立读懂**，不需要翻正文；
- 全文没有悬空引用（每个 AC 都能指回 FR/B）；
- 同一份文档的第二次修改只动了必要章节，而不是整篇重写。

## 它和默认 agent 的区别

| | 默认（standard） | 需求伙伴（prd-partner） |
|---|---|---|
| 身份 | 编码 agent | 产品经理 / 需求分析师，只对需求侧负责 |
| 命令执行 | `pwsh` / `bash` | **不挂载** |
| 后台任务、持久终端 | 有 | **不挂载** |
| 子 agent、workflow、Ralph 循环 | 有 | **不挂载** |
| 插件管理工具 | 有（默认禁用） | **不挂载** |
| 实现计划（plan mode） | 有 | **不挂载** |
| 文件读写 / 检索 | 有 | 有（写 PRD 必需） |
| 技能加载 | 有 | 有（`prd-writer`、`prd-review`、`priority-scoring` 等） |
| 提问、待办、联网检索、交付物卡片 | 有 | 有 |
| 自动压缩 | 有 | 有 |

关键点是第一栏以外的那几个「不挂载」：**它没有执行命令的手段**，所以不会在完善需求的过程中跑构建、
改实现文件或部署。这比只写一句"请不要写代码"的提示词要硬，因为模型根本没有那个工具可调。

## 能力边界（要说清楚的部分）

- **不是权限沙箱。** preset 只决定 agent 看见哪些工具，不构成安全隔离。真正的强制来自权限预设与
  沙箱策略。它能 `read`/`write`/`edit` 文件（写 PRD 必需），因此无法从机制上阻止它改到 PRD 以外的
  文件——这一层靠人格约束和你的复核。
- **不执行开发流程**：没有 shell、没有测试、没有构建、没有子 agent 编排。
- 人格文本（见 `cordis.patch.yml` 的 `persona.config.prefix`）要求它：先澄清再动笔、**一轮最多问 3 个
  带默认答案的问题**、把「功能诉求」翻译成「场景障碍」、区分事实/推断/决策、不虚构任何数据、
  只改必要章节、每轮结尾固定三行（结论 / 改动 / 下一步）、收尾给「距可评审还差什么」。
- **参考风格**：`docs/prd/02-rag-web-demo-PRD.md` 是本仓库的 PRD 样板（含决策表索引、真实性四类标记、
  🤖/👤 验收标注），写新 PRD 时对齐它的结构。

## 安装

推荐路径是在具备**创造模式**的会话里让 agent 装（它会自己完成包安装与 bundle 选择）：

> 把 `G:\DeepSeek_Harness\workspace\pm_useful\agents\prd-partner` 用 `plugin_manager` 的
> `install_bundle` 装到当前 profile。

CLI 备选（两步：装包 + 登记 bundle）：

```powershell
$node = "C:\Users\oshen\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
$pnpm = "C:\Users\oshen\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.cjs"
$profile = $env:DSH_PROFILE_DIR

# 0) 先备份，这一步别省
Copy-Item "$profile\package.json"   "$profile\package.json.backup"
Copy-Item "$profile\pnpm-lock.yaml" "$profile\pnpm-lock.yaml.backup"

# 1) 把包放进 profile 的 node_modules
& $node $pnpm --dir $profile add "file:G:\DeepSeek_Harness\workspace\pm_useful\agents\prd-partner"

# 2) 登记进 bundle 列表（幂等；加 --dry-run 只看会改什么，不写入）
& $node .\tools\add-profile-bundle.mjs $profile "@local/dsh-prd-partner"
```

第 2 步的脚本只追加 `dsh.profile.bundles` 这一个数组，不动其它字段。不要手工改 profile 的
`cordis.patch.yml`，也不要在 profile 目录里跑裸 pnpm——`install_bundle` 已经包含这些步骤。

### 当前安装状态（2026-10-05 安装 v1.0.0；2026-10-06 更新到 v1.1.0，desktop profile）

| 项 | 结果 |
|---|---|
| `pnpm add file:...` | 成功，`@local/dsh-prd-partner` 进 `dependencies`；lockfile `resolution: {type: directory}` |
| `dsh.profile.bundles` | 已追加 `@local/dsh-prd-partner`（置末位，不覆盖内置 preset） |
| 安装副本 | profile 里是**副本**而非符号链接；**改源码后必须重新同步**（pnpm 会认为「已经是最新」而不重新复制，见下） |
| 备份 | `package.json.prd-partner-backup`、`pnpm-lock.yaml.prd-partner-backup`；v1.1.0 更新时另存了 `node_modules\@local\dsh-prd-partner.backup-20261006` |
| 运行时激活 | 需要你在 GUI 里看一眼（见下）|

**v1.1.0 的更新方式（可复用）**：`plugin_manager` 的 `install_bundle` 对同一个 `file:` 依赖会返回
`ambiguous-install` / `changed:false`（pnpm 报 "Already up to date"，不重新复制文件）。此时按下面的方式
把 3 个文件同步进 profile 副本（先备份），校验 `cordis.patch.yml` 与源文件 SHA256 一致即可：

```powershell
$src = "<仓库>\agents\prd-partner"
$dst = "$env:DSH_PROFILE_DIR\node_modules\@local\dsh-prd-partner"
Copy-Item "$dst\*" "$dst.backup-$(Get-Date -Format yyyyMMdd)" -Force   # 先备份
foreach ($f in 'cordis.patch.yml','package.json','README.md') { Copy-Item "$src\$f" "$dst\$f" -Force }
(Get-FileHash "$src\cordis.patch.yml").Hash -eq (Get-FileHash "$dst\cordis.patch.yml").Hash   # 应为 True
```

改完刷新页面（profile manifest 的改动由 HMR 重新组合配置树，通常不必重启 Harness）。

### 卸载 / 回滚

最小回滚：只把 `@local/dsh-prd-partner` 从 `$profile\package.json` 的 `dsh.profile.bundles` 里删掉，
配置树就不再叠加这一层（刷新页面后卡片消失）。

完整回滚到安装前：

```powershell
$profile = $env:DSH_PROFILE_DIR
Copy-Item "$profile\package.json.prd-partner-backup"   "$profile\package.json"   -Force
Copy-Item "$profile\pnpm-lock.yaml.prd-partner-backup" "$profile\pnpm-lock.yaml" -Force
& $node $pnpm --dir $profile install
```

## 验证

1. 静态校验（不需要运行中的 Host）：

   ```powershell
   $node = "C:\Users\oshen\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
   & $node .\dsh-plugin-starter\check.mjs .\agents
   & $node .\tools\verify-agent-bundle.mjs .\agents\prd-partner `
       --yaml ".\.cache\dsh-yaml-lib\dist\index.js" `
       --packages ".\dsh-docs\@deepseek-ai__dsh-agent-preset__skills__cordis-composition-reference__references__packages.md"
   ```

   `--yaml` 指向一个 YAML 解析器；本仓库没有 node_modules，可从 DSH 安装包里提一份到工作区的
   `.cache/`（已 gitignore；不要用 `$env:TEMP`——DSH 每个会话给的临时目录下次就变了）：

   ```powershell
   & $node .\tools\asar-dump.js getdir "G:\DeepSeek_Harness\resources\app.asar" `
       ".\.cache\dsh-yaml-lib" "/dsh/node_modules/yaml"
   ```

2. 安装后的运行时检查（**必须做一次**，静态校验不能替代它）：
   - 「设置 → Agent preset」里出现**需求伙伴**卡片，且能打开「查看配置」；
   - 创造模式下用 `list_plugins` 确认 `preset-prd-partner` 行不是 `failed` / `overridden`；
   - 新建一个会话选它，确认工具列表里**没有** `pwsh` / `bash`，而 `skill`、`ask_user_question` 正常。

   卡片没出现时按顺序排查：先刷新页面（profile manifest 的改动由 HMR 重新组合配置树，通常不必重启
   Harness）；仍不出现就重启 Harness——`node_modules` 里新增的包可能要新进程才会被解析。若卡片出现
   但标记加载失败，说明某个插件行激活被拒，点「查看配置」看声明原文，按诊断定位是哪一行。

## 调整

- **改人格**：编辑 `cordis.patch.yml` 里 `persona.config.prefix`（块标量，`|-` 保留换行）。
  `suffix` 支持 `{{cwd}}`、`{{model}}` 这类提示词变量。
- **增减工具**：在 `config.plugins` 里加/删一行。包名必须存在于
  `dsh-docs/.../cordis-composition-reference/references/packages.md` 的清单里，`verify-agent-bundle.mjs`
  会替你核对。
- **改显示名/排序**：`config.name`、`config.description`、`config.order`。
- **想让某个内置 preset 用它**：不要改本 bundle，而是按行 id 覆盖——`id: preset-standard` 加上完整的
  `config`（覆盖是整体替换，不会深合并）。

**改完必须重新安装。** bundle 是安装进 profile 的包，改工作区里的源文件不会自动同步到 profile。

## 局限

- 本 bundle 已通过**静态校验**（YAML 可解析、补丁方言正确、所有包名都在 DSH 可加载清单内、行 id 无重复）。
  `list_bundles` 确认 `@local/dsh-prd-partner` 为 `installed: true` / `enabled: true`，行 `preset-prd-partner` 存在；
  但**「设置 → Agent preset」里的卡片与工具列表仍需你亲眼看一次**（静态校验与注册表都证明不了 UI 与工具挂载）。
- preset 声明一旦安装即被**急切激活**并由所有选用它的会话共享；已有会话保留启动时的插件版本，因此
  改动只对新会话生效。
- profile 里装的是**副本**，不是指向本目录的符号链接：改完源文件必须重新同步
  （见「当前安装状态」里的手动同步步骤），否则改了不生效。
