---
name: xhs-link-parse
description: 解析小红书（RED）分享链接/分享文案，把笔记的结构化内容交给 Agent 使用，或在拿不到正文时准确说明原因（登录墙 / 风控 / 仅浅解析）。适用于用户给出小红书链接、分享文案、笔记截图、已保存的网页 HTML/JSON，或要求分析“某 App 为什么能解析小红书链接”的场景。也适用于判断一份“小红书内容总结”是不是幻觉。
author: shenziang
whenToUse: 需要读取小红书笔记内容、解析小红书链接/短链、排查解析失败原因，或调研第三方 App 的小红书数据来源时使用。
---

# 小红书链接解析（xhs-link-parse）

工具与完整文档：`G:\DeepSeek_Harness\workspace\pm_useful\xhs-kit\`
- `xhs_kit.py`：零依赖（纯标准库）解析器
- `SKILL.md`：完整决策树、CDP 浏览器桥步骤、合规红线
- 背景调研：`G:\DeepSeek_Harness\workspace\pm_useful\小红书链接解析_调研与能力方案.md`

Python 解释器：`C:\Users\oshen\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe`

## 核心前提（先记住再动手）

小红书 Web 是**强登录站点**：未登录匿名请求 `GET /explore` 会 302 到 `/login?redirectPath=`（登录墙），
带 `note_id` 但缺 `xsec_token` 的直链会 302 到 `/404/sec_xxx?source=xhs_sec_server`（风控安全页）。
**"用户未登录"不等于"服务端未登录"**——竞品能拿到正文，本质是服务端有自己的登录态、或买了外部数据服务。

## 决策树

1. **只有分享文案** → `xhs_kit.py share "<文案>"`：抽链接、`note_id`、`xsec_token`，并提示"文案不含正文"。
2. **用户提供了 HTML / DevTools JSON 快照** → `xhs_kit.py html <文件> --md`：输出标题/正文/图集/话题/作者/互动。
   注意看 `parse_depth`：`full_state` 才是真正文，`metadata_only` 只是标题+封面。
3. **链接带有效 `xsec_token` 且本机可出网** → `xhs_kit.py fetch "<链接>" --save tmp/note.html` 试一次。
   出现 `status=login_wall` 或 `status=risk_control` **立即停止重试**，改走第 4 步。
4. **用户已在本机 Chrome 登录小红书** → 走 CDP 浏览器桥（脚本片段见 `xhs-kit/SKILL.md`），
   让用户通过站内点击进入详情页（`xsec_token` 是站内交互生成的，直接拼 URL 常失败），单 IP ≤30 次/分钟。
5. **都不行** → 请用户提供截图（图文笔记正文常在图上，可用视觉直读）、粘贴正文、或导出长图/PDF。
6. **要批量/要规模** → 采购外部解析服务（`xhs_kit.py api --endpoint ... --key ...`）或走官方开放平台/商务合作。

## 红线

- 不做签名逆向（`x-s`/`x-t`）、账号池、IP 轮换、验证码绕过；杭州中院已终审认定同类行为构成不正当竞争（判赔 490 万元）。
- 只处理用户自己可见并主动提供的内容；不批量抓取、不转售数据。
- **拿不到正文时绝不"顺着标题编内容"**：明确告诉用户只拿到了标题/封面，并给出获取正文的替代路径。
