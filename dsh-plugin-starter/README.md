# 用 DSH 开发一个 agent：上手包

这个目录里是两个**可以直接安装的最小 bundle**，加上一个不依赖任何第三方库的校验脚本。
它对应 DSH 官方开发规范（`cordis-plugin-development` / `editing-cordis-compositions`）里
的最小可用形态：**普通工作区文件 → bundle 包 → 安装进当前 profile → 验证**。

## 目录

| 路径 | 作用 |
|---|---|
| `my-first-tool/` | 最小 Host 插件包：向模型注册一个 `hello_tool` 工具 |
| `my-persona-preset/` | 声明一个 agent preset：人格 + 限定工具集 |
| `check.mjs` | 校验 manifest / patch / ESM 语法，不需要 pnpm 或 TypeScript |

## 0. 先建立心智模型

DSH 里"一个 agent"不是一个独立程序，而是**一棵 Cordis 配置树 + 若干插件**：

```
profile（$DSH_HOME/profiles/<name>/）
  ├── package.json      → dsh.profile.bundles: 组合包列表（按顺序叠加）
  └── cordis.patch.yml  → 用户自己的 patch 层（按 id 覆盖上面的行）
        ↓ 叠加后得到一棵 Loader entry 树
  每一行 entry = 一个插件
    ├── dsh-llm / dsh-llm-deepseek-api-key  模型接入
    ├── dsh-agent + dsh-agent-loop          agent 内核
    ├── dsh-tools + dsh-tool-*              模型可见工具
    ├── dsh-system-prompt / dsh-persona     系统提示词与人格
    ├── dsh-session*                        会话与持久化
    └── 你自己的插件                        ← 开发点在这里
```

所以"开发一个 agent"实际是三件事之一：

1. **给现有 agent 加能力** → 写一个插件包，注册工具 / 提示词段 / 事件监听。
2. **造一个不同人格或工具集的 agent** → 写一个 `dsh-agent-preset` 声明。
3. **从零搭一个独立 agent 进程** → 写一个**组合包（bundle）**，自带完整配置树
   （参考随附的 `dsh-sdk-minimal`，它只有 159 行 YAML）。

`check.mjs` 校验这两个示例：

```powershell
$node = "C:\Users\oshen\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
& $node .\check.mjs .
```

## 1. 安装（推荐路径：让 agent 自己装）

在具备创造模式的会话里直接说：

> 把 `G:\DeepSeek_Harness\workspace\pm_useful\dsh-plugin-starter\my-first-tool`
> 用 `plugin_manager` 的 `install_bundle` 装到当前 profile。

`install_bundle` 会自己完成包安装与 bundle 选择。**不要**手工改 profile 的
`package.json` / `cordis.patch.yml`，也**不要**在 profile 目录里跑 pnpm。

UI 路径：设置 → 插件（Plugin Manager）。

## 2. 安装（CLI 路径）

```powershell
$node = "C:\Users\oshen\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
$pnpm = "C:\Users\oshen\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.cjs"

# 把本地包加进 desktop profile 的依赖，并选入 bundles
& $node $pnpm --dir "$env:DSH_PROFILE_DIR" add "file:G:\DeepSeek_Harness\workspace\pm_useful\dsh-plugin-starter\my-first-tool"
& $node $pnpm --dir "$env:DSH_PROFILE_DIR" add "file:G:\DeepSeek_Harness\workspace\pm_useful\dsh-plugin-starter\my-persona-preset"
```

然后把包名加进 `$env:DSH_PROFILE_DIR\package.json` 的 `dsh.profile.bundles`：

```json
{
  "name": "dsh-profile-desktop",
  "private": true,
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "@local/my-first-tool",
        "@local/my-persona-preset"
      ]
    }
  }
}
```

改完 `cordis.patch.yml` / profile manifest 后，HMR 会重新组合配置树；
替换已安装包的 JavaScript 需要**重启 Harness** 才会加载新的模块代次。

> `desktop` 这个 profile 名被 Electron 占用，CLI 会拒绝针对它的启动与配置 dump 请求。

## 3. 验证

```powershell
# 组合后的配置树（需要 dsh 在 PATH 上）
dsh --profile "$env:DSH_PROFILE" --dump-config

# 创造模式会话里：不需要审批的实时检查
cordis_inspect_query   # Service / Event / Config / Tool / Slots
```

看什么：

- `Config.listConfigs` 里出现 `my-first-tool` 这行，状态不是 `failed` / `overridden`；
- 新会话里模型能调用 `hello_tool`；
- preset 场景：新会话的 preset 选择器里出现 `My Reviewer`。

`list_plugins` / `list_bundles` 会返回精确标识符，但每次调用都需要审批，
只在结果决定下一步时才调用。

## 4. 常见坑

| 现象 | 原因 |
|---|---|
| 行状态 `overridden` | 更高优先级的层（home patch / 你的 `cordis.patch.yml`）覆盖了同一 `id` |
| 行状态 `restart-required` | 替换了已安装包，需要重启才能加载新 JS |
| 改了代码没生效 | bundle 是**已安装的包**，不是被引用的目录；本地 `file:` 依赖需要重新 `add` |
| patch 覆盖后配置变小 | patch **整体替换**目标行的 `config`，不是深合并 |
| `!!js` 表达式没生效 | `!!js` 只在插件配置或 `disabled` 里合法，且在子插件激活时才求值 |
| 工具注册抛错 | `output` 必须同时有 `schema` 和 `render`；`run_code` 是保留名，不可注册或遮蔽 |
