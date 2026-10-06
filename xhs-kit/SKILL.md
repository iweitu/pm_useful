---
name: xhs-link-parse
description: 解析小红书分享链接/分享文案，把笔记的结构化内容交给 Agent 使用。用户给出小红书链接、分享文案、笔记截图或已保存的网页时使用；也可用于诊断"某 App 为什么能解析小红书链接"这类问题。支持离线解析（分享文案、HTML 快照）与可选的联网抓取后端。
---

# 小红书链接解析（xhs-link-parse）

## 这个技能解决什么

把"小红书链接"变成 Agent 能用的结构化内容（标题/正文/图集/话题/作者/互动），
并在**拿不到正文**时给出准确的原因和替代路径，而不是瞎猜内容。

**一句话前提**：小红书 Web 是强登录站点。未登录态的匿名 HTTP 请求**拿不到正文**，
分享链接能"解析"出来的只有卡片级元数据。谁声称"未登录就能读全文"，只有三种可能：
服务端有自己的登录态、用了外部数据服务、或者只是拿到了标题+封面。

## 决策树（按顺序尝试）

1. **用户只给了分享文案** → 先抽链接与参数（离线）：
   ```bash
   <python> xhs_kit.py share "…粘贴分享文案…"
   ```
   得到 `note_id` / `xsec_token`，同时会提示"分享文案不含正文"。

2. **用户提供了网页 HTML / DevTools 复制的 JSON**（用户侧带自己的登录态）→ 离线解析：
   ```bash
   <python> xhs_kit.py html saved_note.html --md
   <python> xhs_kit.py html - --md   # 从 stdin 读
   ```

3. **本机可出网、且链接带有效 `xsec_token`** → 自建抓取器试一次（不要重试轰炸）：
   ```bash
   <python> xhs_kit.py resolve "<短链或详情页>"      # 看 302 链与最终 URL
   <python> xhs_kit.py fetch "<短链或详情页>" --save tmp/note.html
   ```
   看到 `status=login_wall` / `status=risk_control` 就**停止重试**（继续请求只会加风控），
   改走第 4/5 步。

4. **用户已在本机 Chrome 登录小红书** → 浏览器桥（CDP，唯一能稳定拿到正文的用户侧方案）：
   - 让用户用调试端口启动 Chrome：`chrome.exe --remote-debugging-port=9222 --user-data-dir=<独立目录>`
   - 在该 Chrome 里打开笔记页（**必须通过站内点击/搜索进入**，`xsec_token` 是站内交互生成的）
   - 用 Playwright 连接并取字段：
     ```python
     # 仅在用户明确授权、且访问的是用户自己可见的内容时使用
     from playwright.sync_api import sync_playwright
     with sync_playwright() as p:
         b = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
         pg = b.contexts[0].pages[0]; pg.goto(url, wait_until="domcontentloaded")
         data = pg.evaluate("""() => ({
             title: document.querySelector('#detail-title')?.innerText || '',
             desc:  document.querySelector('#detail-desc')?.innerText || '',
             images:[...document.querySelectorAll('.swiper-slide img')].map(i=>i.src),
         })""")
     ```
   - 速率：单账号/IP **≤30 次/分钟**，超过会出验证码；触发后等 5–10 分钟。
   - 别用 headless 首次访问：丢失登录态、指纹可疑。

5. **都不行** → 让用户给"人肉可读"的输入，一样能完成任务：
   - 截图（图文笔记的正文往往就印在图上）→ 用视觉能力直接读；
   - 直接粘贴正文文本；
   - 导出为 PDF/长图。

6. **有预算、要规模化** → 接**外部解析服务**（第三方 API / 数据服务商）或**小红书官方开放平台**：
   ```bash
   <python> xhs_kit.py api "<链接或分享文案>" --endpoint "<服务地址>" --key "<KEY>"
   ```
   选型与合规要求见 `../小红书链接解析_调研与能力方案.md` 第八、九节。

## 硬性红线（不要越过）

- 不实现、不推荐：签名逆向（`x-s`/`x-t`）、账号池、IP 轮换、验证码绕过。杭州中院"小红书诉蝉小红"
  终审已认定此类行为构成不正当竞争（判赔 490 万元）；另有非法爬取小红书数据牟利被判刑的案例。
- 只处理**用户自己可见、且主动提供**的内容；批量抓取、对外转售数据一律不做。
- 抓取前先看目标站 `robots.txt` 与用户协议；对个人信息的处理要走最小必要原则。

## 文件说明

| 文件 | 用途 |
|---|---|
| `xhs_kit.py` | 离线解析（分享文案 / HTML 快照）+ 可选联网后端（resolve/fetch/api/doctor） |
| `tests/` | 23 个离线回归测试，`<python> -m unittest discover -s tests` 全绿 |
| `tests/fixtures/` | 正常详情页 / 登录墙 / og-only 浅解析 / 风控 404 页 四类样本 |

`doctor` 子命令可判断当前运行时能否直连小红书（注意：不同运行时出网能力可能不同，
例如本机 PowerShell/curl 的 schannel 会失败，而 bundled Python 的 OpenSSL 可以出网）。
