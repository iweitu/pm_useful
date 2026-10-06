#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""xhs-kit: 小红书分享链接解析工具箱.

设计原则
--------
把"离线可确定"的部分与"需要联网/登录态"的部分彻底分开:

* 离线可确定(本模块 core):
  - 分享文案  -> 链接 / note_id / xsec_token / 标题线索
  - 已保存的 HTML(浏览器"另存为"、DevTools 复制、用户粘贴) -> 结构化笔记字段
* 需要外部条件(本模块 backend, 默认不联网):
  - api : 第三方/自建链接解析 API (需出网 + Key)
  - doctor: 环境自检, 判断当前进程能否直连小红书

本模块不实现、也不建议实现: 绕过小红书风控(签名伪造、账号池、IP 轮换)。
理由见同目录 SKILL.md 与调研报告中的合规章节。
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs, urlsplit

# --------------------------------------------------------------------------
# 常量与正则
# --------------------------------------------------------------------------

XHS_HOST_SUFFIXES = ("xiaohongshu.com", "xhslink.com", "xhs.cn", "xhslink.cn")

# 分享文案里链接后面常紧跟中文标点/汉字, 必须排除 CJK 与全角标点, 否则会把文案粘进 URL
URL_RE = re.compile(
    r"https?://[^\s\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\"'<>()\[\]，。；、！？】]+"
)
NOTE_ID_PATH_RE = re.compile(r"/(?:explore|discovery/item|item)/([0-9a-fA-F]{16,32})")
NOTE_ID_QUERY_RE = re.compile(r"[?&](?:noteId|note_id|id)=([0-9a-fA-F]{16,32})")
XSEC_TOKEN_RE = re.compile(r"[?&]xsec_token=([^&\s#]+)")
SHARE_TAIL_RE = re.compile(
    r"(复制本条信息|打开【?小红书】?|复制打开|点击链接|打开小红书|看看【|查看精彩内容).*$"
)

# 登录墙 / 空壳特征(小红书未登录访问 web 会被重定向到 /login?redirectPath=)
LOGIN_WALL_MARKERS = (
    r"/login\?redirectPath",
    r"redirectPath=",
    r"扫码登录",
    r"登录后查看",
)
SHELL_MARKER_RE = re.compile(r'<div id="(?:app|root)">\s*</div>', re.I)

# 匿名请求被判异常/笔记不存在时, 小红书会 302 到 /404/sec_xxx?source=xhs_sec_server&originalUrl=...
RISK_CONTROL_MARKERS = ("xhs_sec_server", "/404/sec_")


# --------------------------------------------------------------------------
# 1. 链接解析(离线)
# --------------------------------------------------------------------------

def extract_links(text: str) -> List[str]:
    """从任意文本(分享文案/聊天记录/整段 HTML)中抽取全部 http(s) 链接, 保持出现顺序并去重。"""
    seen, out = set(), []
    for m in URL_RE.finditer(text or ""):
        url = m.group(0).rstrip(".,;:!?、，。；：！？")
        if url not in seen:
            seen.add(url)
            out.append(url)
    return out


def classify_link(url: str) -> Dict[str, Any]:
    """识别链接类型, 抽取 host / note_id / xsec_token。

    kind:
      note_page : 直达笔记详情页(www.xiaohongshu.com/explore|discovery/item|item/<id>)
      short     : 分享短链(xhslink.com 等), note_id 需跟随 302 才能得到
      other     : 非小红书域名
    """
    parts = urlsplit(url)
    host = (parts.netloc or "").lower().split("@")[-1].split(":")[0]
    is_xhs = any(host == s or host.endswith("." + s) for s in XHS_HOST_SUFFIXES)

    note_id = None
    m = NOTE_ID_PATH_RE.search(parts.path or "")
    if m:
        note_id = m.group(1)
    if not note_id:
        m = NOTE_ID_QUERY_RE.search(parts.query or "")
        if m:
            note_id = m.group(1)

    xsec = None
    m = XSEC_TOKEN_RE.search("?" + (parts.query or ""))
    if m:
        xsec = m.group(1)

    if not is_xhs:
        kind = "other"
    elif note_id:
        kind = "note_page"
    else:
        kind = "short"

    return {
        "url": url,
        "host": host,
        "kind": kind,
        "note_id": note_id,
        "xsec_token": xsec,
        "has_xsec_token": bool(xsec),
    }


def parse_share_text(text: str) -> Dict[str, Any]:
    """解析分享文案(如小红书 App "复制链接" 得到的那段话)。

    返回 primary(优先带 xsec_token 的笔记页) 与全部 candidates。
    """
    links = extract_links(text or "")
    candidates = [classify_link(u) for u in links]
    xhs = [c for c in candidates if c["kind"] in ("note_page", "short")]

    primary: Optional[Dict[str, Any]] = None
    for c in xhs:
        if c["kind"] == "note_page" and c["has_xsec_token"]:
            primary = c
            break
    if primary is None:
        for c in xhs:
            if c["kind"] == "note_page":
                primary = c
                break
    if primary is None and xhs:
        primary = xhs[0]

    title_guess = ""
    if primary:
        head = (text or "").split(primary["url"])[0]
        title_guess = _clean_title(head)

    if primary:
        status = "ok"
    elif candidates:
        status = "no_xhs_link"
    else:
        status = "no_link"

    return {
        "status": status,
        "title_guess": title_guess,
        "primary": primary,
        "candidates": candidates,
        "warnings": _share_warnings(primary),
    }


def _clean_title(head: str) -> str:
    t = re.sub(r"\s+", " ", head or "").strip()
    t = SHARE_TAIL_RE.sub("", t)
    t = re.sub(r"[\s\-|–—~·]+小红书[\s]*$", "", t)        # 去掉分享文案尾部的"- 小红书"
    t = re.sub(r"^[\d\s.、:：\-–—|]+", "", t)          # 去掉分享文案开头的序号
    t = re.sub(r"[，,。.；;、|~～\-\s]+$", "", t)          # 去掉结尾标点
    t = re.sub(r"[#＃]\S+$", "", t).strip()              # 去掉结尾话题
    return t.strip()


def _share_warnings(primary: Optional[Dict[str, Any]]) -> List[str]:
    if not primary:
        return []
    w = []
    if primary["kind"] == "short":
        w.append("短链需跟随 302 才能拿到 note_id / xsec_token; 请让工具或浏览器打开一次该链接")
    if not primary["has_xsec_token"]:
        w.append("链接缺少 xsec_token: 小红书 2024 年后详情页 URL 通常必须带该参数, 否则大概率落在登录墙")
    w.append("分享文案只包含标题与链接, 不包含正文与图片; 正文需另走 HTML 快照 / 浏览器桥 / 解析服务")
    return w


# --------------------------------------------------------------------------
# 2. HTML / JSON 快照解析(离线)
# --------------------------------------------------------------------------

def _balanced_json(text: str, start: int) -> Optional[str]:
    """从 start 处扫描一个平衡的 JSON 对象/数组字面量(字符串与转义安全)。"""
    i, n = start, len(text)
    while i < n and text[i] in " \t\r\n":
        i += 1
    if i >= n or text[i] not in "{[":
        return None
    depth, in_str, esc = 0, False, False
    begin = i
    while i < n:
        ch = text[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        else:
            if ch == '"':
                in_str = True
            elif ch in "{[":
                depth += 1
            elif ch in "}]":
                depth -= 1
                if depth == 0:
                    return text[begin:i + 1]
        i += 1
    return None


def extract_initial_state(html: str) -> Optional[Any]:
    """抽取 window.__INITIAL_STATE__ 并反序列化(容忍 JS 的 undefined)。"""
    m = re.search(r"__INITIAL_STATE__\s*=\s*", html or "")
    if not m:
        return None
    raw = _balanced_json(html, m.end())
    if not raw:
        return None
    raw = re.sub(r"\bundefined\b", "null", raw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def _looks_like_note(node: Any) -> bool:
    """严格判定"这是一个笔记对象", 避免把 404/风控页里的用户 profile 误判成笔记。"""
    if not isinstance(node, dict):
        return False
    if any(k in node for k in ("noteId", "note_id")):
        return True
    has_title = bool(_first_str(node, ("title", "displayTitle")))
    has_desc = bool(_first_str(node, ("desc", "description", "content")))
    has_imgs = bool(node.get("imageList") or node.get("image_list"))
    return (has_title and has_imgs) or (has_desc and has_imgs)


def find_note_node(state: Any, max_nodes: int = 6000) -> Optional[Dict[str, Any]]:
    """在 __INITIAL_STATE__ 里定位笔记对象, 兼容 web 端 note.noteDetailMap 与其它嵌套形态。"""
    if not isinstance(state, (dict, list)):
        return None

    # 常见路径优先: note.noteDetailMap.<noteId>.note
    try:
        detail_map = state["note"]["noteDetailMap"]
        if isinstance(detail_map, dict):
            for v in detail_map.values():
                cand = v.get("note") if isinstance(v, dict) else None
                if _looks_like_note(cand):
                    return cand
    except (KeyError, TypeError):
        pass

    stack: List[Any] = [state]
    visited = 0
    while stack and visited < max_nodes:
        cur = stack.pop()
        visited += 1
        if isinstance(cur, dict):
            if _looks_like_note(cur):
                return cur
            stack.extend(cur.values())
        elif isinstance(cur, list):
            stack.extend(cur)
    return None


def _first_str(node: Dict[str, Any], keys: tuple) -> str:
    for k in keys:
        v = node.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            return str(v)
    return ""


def _extract_images(node: Dict[str, Any]) -> List[str]:
    out: List[str] = []
    items = node.get("imageList") or node.get("image_list") or node.get("images") or []
    if not isinstance(items, list):
        return out
    for item in items:
        if isinstance(item, str) and item.startswith("http"):
            out.append(item)
            continue
        if not isinstance(item, dict):
            continue
        picked = ""
        for k in ("urlDefault", "url_default", "urlPre", "url_pre", "originUrl", "masterUrl", "url", "thumbnail"):
            v = item.get(k)
            if isinstance(v, str) and v.startswith("http"):
                picked = v
                break
        if not picked:
            info = item.get("infoList") or item.get("info_list") or []
            if isinstance(info, list):
                for ent in info:
                    if isinstance(ent, dict):
                        v = ent.get("url")
                        if isinstance(v, str) and v.startswith("http"):
                            picked = v
                            break
        if picked:
            out.append(picked)
    return out


def _extract_tags(node: Dict[str, Any]) -> List[str]:
    tags = node.get("tagList") or node.get("tag_list") or node.get("topics") or []
    out = []
    if isinstance(tags, list):
        for t in tags:
            if isinstance(t, str):
                out.append(t)
            elif isinstance(t, dict):
                name = _first_str(t, ("name", "title", "tagName"))
                if name:
                    out.append(name)
    return out


def _extract_author(node: Dict[str, Any]) -> Dict[str, str]:
    user = node.get("user") or node.get("author") or {}
    if not isinstance(user, dict):
        return {}
    return {
        "nickname": _first_str(user, ("nickname", "nickName", "name", "nick_name")),
        "user_id": _first_str(user, ("userId", "user_id", "id")),
        "avatar": _first_str(user, ("avatar", "image", "avatarUrl")),
    }


def _extract_interact(node: Dict[str, Any]) -> Dict[str, str]:
    info = node.get("interactInfo") or node.get("interact_info") or {}
    if not isinstance(info, dict):
        return {}
    mapping = {
        "liked": ("likedCount", "liked_count", "likes"),
        "collected": ("collectedCount", "collected_count", "collects"),
        "commented": ("commentCount", "comment_count", "comments"),
        "shared": ("shareCount", "share_count", "shares"),
    }
    return {k: _first_str(info, v) for k, v in mapping.items() if _first_str(info, v)}


def _extract_og(html: str) -> Dict[str, str]:
    def meta(prop: str) -> str:
        for pat in (
            r'<meta[^>]+(?:property|name)=["\']%s["\'][^>]*content=["\']([^"\']*)["\']' % re.escape(prop),
            r'<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']%s["\']' % re.escape(prop),
        ):
            m = re.search(pat, html, re.I)
            if m:
                return m.group(1).strip()
        return ""

    title = meta("og:title") or meta("twitter:title")
    if not title:
        m = re.search(r"<title[^>]*>(.*?)</title>", html or "", re.I | re.S)
        title = re.sub(r"\s+", " ", m.group(1)).strip() if m else ""
    return {
        "title": title,
        "description": meta("og:description") or meta("description"),
        "image": meta("og:image"),
        "url": meta("og:url"),
    }


def parse_note_html(html: str, note_id_hint: Optional[str] = None, final_url: str = "") -> Dict[str, Any]:
    """把一份已保存的笔记页 HTML 解析成结构化字段。

    status:
      ok                拿到了笔记数据
      login_wall        页面是登录墙(未登录抓取时的典型结果)
      risk_control      命中小红书风控/404 安全页(xhs_sec_server)
      empty_shell       只拿到了 SPA 空壳, 无任何可用元数据
    parse_depth:
      full_state    来自 __INITIAL_STATE__ (标题/正文/图集/标签/作者/互动)
      metadata_only 只拿到 og:title / og:image / description (浅解析)
      none          什么都没有
    """
    html = html or ""
    state = extract_initial_state(html)
    node = find_note_node(state) if state is not None else None
    og = _extract_og(html)

    has_wall_marker = is_login_wall(html, final_url)
    has_risk_marker = any(m in html or m in (final_url or "") for m in RISK_CONTROL_MARKERS) or (
        isinstance(state, dict) and "notFoundPage" in state
    )
    is_shell = bool(SHELL_MARKER_RE.search(html)) or len(html) < 1500

    result: Dict[str, Any] = {
        "status": "empty_shell",
        "parse_depth": "none",
        "source": None,
        "note_id": note_id_hint or "",
        "title": "",
        "desc": "",
        "images": [],
        "tags": [],
        "author": {},
        "interact": {},
        "type": "",
        "time": "",
        "meta": og,
        "warnings": [],
    }

    if node:
        result.update(
            {
                "status": "ok",
                "parse_depth": "full_state",
                "source": "__INITIAL_STATE__",
                "note_id": _first_str(node, ("noteId", "note_id", "id")) or (note_id_hint or ""),
                "title": _first_str(node, ("title", "displayTitle")),
                "desc": _first_str(node, ("desc", "description", "content")),
                "images": _extract_images(node),
                "tags": _extract_tags(node),
                "author": _extract_author(node),
                "interact": _extract_interact(node),
                "type": _first_str(node, ("type", "noteType")),
                "time": _first_str(node, ("time", "lastUpdateTime", "createTime", "publishTime")),
            }
        )
        if not result["title"] and og["title"]:
            result["title"] = og["title"]
        return result

    if has_wall_marker:
        result.update({"status": "login_wall", "parse_depth": "metadata_only" if og["title"] else "none"})
        result["warnings"].append(
            "命中登录墙: 未登录态访问小红书 web 会被重定向到 /login?redirectPath=, 正文不可得"
        )
        return result

    if has_risk_marker:
        result.update({"status": "risk_control", "parse_depth": "metadata_only" if og["title"] else "none"})
        result["warnings"].append(
            "命中小红书风控/404 安全页(xhs_sec_server): 匿名请求被判异常, 或该 note_id 不存在/已删除"
        )
        return result

    if og["title"] or og["image"] or og["description"]:
        result.update(
            {
                "status": "ok" if not is_shell else "empty_shell",
                "parse_depth": "metadata_only",
                "source": "og_meta",
                "title": og["title"],
                "desc": og["description"],
                "images": [og["image"]] if og["image"] else [],
            }
        )
        result["warnings"].append("只解析到分享卡片级元数据, 正文/图集缺失(浅解析)")
        return result

    result["warnings"].append("页面无 __INITIAL_STATE__ 也无 og 元数据, 很可能是 SPA 空壳")
    return result


def to_markdown(result: Dict[str, Any]) -> str:
    """把解析结果渲染成便于人读/喂给 LLM 的 Markdown。"""
    lines = [
        "## 小红书笔记(解析结果)",
        "",
        "- 状态: `%s` / 深度: `%s` / 来源: `%s`" % (
            result.get("status"), result.get("parse_depth"), result.get("source")),
        "- note_id: `%s`" % (result.get("note_id") or "未知"),
    ]
    if result.get("title"):
        lines += ["", "**标题**: " + result["title"]]
    if result.get("author") and result["author"].get("nickname"):
        lines.append("**作者**: %s (%s)" % (result["author"]["nickname"], result["author"].get("user_id", "")))
    if result.get("interact"):
        lines.append("**互动**: " + ", ".join("%s=%s" % kv for kv in result["interact"].items()))
    if result.get("tags"):
        lines.append("**话题**: " + " ".join("#" + t for t in result["tags"]))
    if result.get("desc"):
        lines += ["", "### 正文", "", result["desc"]]
    if result.get("images"):
        lines += ["", "### 图片 (%d)" % len(result["images"])] + ["- " + u for u in result["images"]]
    if result.get("warnings"):
        lines += ["", "### 提示"] + ["- " + w for w in result["warnings"]]
    return "\n".join(lines)


# --------------------------------------------------------------------------
# 3. 联网后端(可选): 短链解析 + 页面抓取
# --------------------------------------------------------------------------

UA_DESKTOP = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
UA_MOBILE = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
)


def is_login_wall(html: str, final_url: str = "") -> bool:
    """判断响应是否落在登录墙(URL 被改写为 /login?redirectPath= 或页面命中登录特征)。"""
    if "redirectPath=" in (final_url or ""):
        return True
    return any(re.search(p, html or "") for p in LOGIN_WALL_MARKERS)


def _open(url: str, ua: str, timeout: int):
    """打开 URL, 记录 302 链。返回 (final_url, http_status, body_text, redirects)。"""
    chain: List[Dict[str, Any]] = []

    class _Recorder(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D102
            chain.append({"status": code, "url": newurl})
            return super().redirect_request(req, fp, code, msg, headers, newurl)

    opener = urllib.request.build_opener(_Recorder())
    req = urllib.request.Request(url, headers={"User-Agent": ua, "Accept-Language": "zh-CN,zh;q=0.9"})
    with opener.open(req, timeout=timeout) as resp:  # noqa: S310
        body = resp.read().decode("utf-8", "replace")
        return resp.geturl(), resp.status, body, chain


def resolve_url(url: str, ua: str = UA_MOBILE, timeout: int = 20) -> Dict[str, Any]:
    """跟随重定向解析链接(xhslink 短链 -> 带 note_id / xsec_token 的详情页)。

    返回结构里保留 html 字段供上层继续解析; CLI 默认不打印它。
    """
    try:
        final_url, status, html, chain = _open(url, ua, timeout)
    except Exception as exc:  # noqa: BLE001
        return {"input": url, "ok": False, "error": "%s: %s" % (type(exc).__name__, exc)}
    note = classify_link(final_url)
    return {
        "input": url,
        "ok": True,
        "http_status": status,
        "redirects": chain,
        "final_url": final_url,
        "note_id": note["note_id"],
        "xsec_token": note["xsec_token"],
        "login_wall": is_login_wall(html, final_url),
        "bytes": len(html),
        "html": html,
        "warnings": [] if note["note_id"] else ["最终 URL 未识别出 note_id: 可能是登录墙或风控页"],
    }


def fetch_note(url: str, ua: str = UA_MOBILE, timeout: int = 20) -> Dict[str, Any]:
    """自建抓取器: 解析短链 -> 抓页面 -> 结构化解析(单次请求, 不做并发/轮换)。"""
    res = resolve_url(url, ua=ua, timeout=timeout)
    if not res.get("ok"):
        return {"status": "request_failed", "error": res.get("error"), "final_url": url}
    parsed = parse_note_html(res["html"], note_id_hint=res.get("note_id"), final_url=res["final_url"])
    parsed["final_url"] = res["final_url"]
    parsed["redirects"] = res["redirects"]
    parsed["server_side_login_wall"] = res["login_wall"]
    if res["login_wall"] and parsed["parse_depth"] != "full_state":
        parsed["warnings"].append(
            "服务端未登录抓取命中登录墙: 说明该内容的正文无法靠匿名 HTTP 请求获取, "
            "需登录态(浏览器桥)或官方/第三方接口"
        )
    return parsed


# --------------------------------------------------------------------------
# 4. 外部解析服务后端(可选, 需自备服务与 Key)
# --------------------------------------------------------------------------

def api_parse(text: str, endpoint: str, api_key: str = "", timeout: int = 20) -> Dict[str, Any]:
    """调用外部"链接解析"服务(第三方或自建), 返回其原始 JSON。

    这类服务的接口形态大同小异: POST {text|url}, 头里带 Key, 返回
    title / cover_url / video_url / image_list / author 等字段。
    """
    payload = json.dumps({"text": text, "url": text}, ensure_ascii=False).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["X-API-Key"] = api_key
    req = urllib.request.Request(endpoint, data=payload, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (用户显式指定端点)
        body = resp.read().decode("utf-8", "replace")
    try:
        return {"status": "ok", "data": json.loads(body)}
    except json.JSONDecodeError:
        return {"status": "ok", "data": {"raw": body}}


def doctor(timeout: int = 8) -> Dict[str, Any]:
    """环境自检: 当前进程能否直连小红书(判断是否需要浏览器桥 / 外部解析服务)。"""
    report: Dict[str, Any] = {"python": sys.version.split()[0], "probes": []}
    for url in ("https://www.xiaohongshu.com/explore", "https://xhslink.com"):
        entry = {"url": url}
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
                entry["ok"] = True
                entry["http_status"] = resp.status
                entry["final_url"] = resp.geturl()
                head = resp.read(4096).decode("utf-8", "replace")
                entry["login_wall"] = is_login_wall(head, resp.geturl())
        except Exception as exc:  # noqa: BLE001
            entry["ok"] = False
            entry["error"] = "%s: %s" % (type(exc).__name__, exc)
        report["probes"].append(entry)
    report["direct_network_ok"] = any(p.get("ok") for p in report["probes"])
    if not report["direct_network_ok"]:
        report["advice"] = "本进程无出网能力: 请改用浏览器桥(用户已登录的 Chrome)或第三方解析服务, 见 SKILL.md"
    elif all(p.get("login_wall") for p in report["probes"] if p.get("ok")):
        report["advice"] = "能出网但直连小红书命中登录墙: 需登录态(浏览器桥)或官方/第三方接口"
    return report


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------

def _read_file(path: str) -> str:
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        return fh.read()


def main(argv: Optional[List[str]] = None) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # Windows 控制台默认 cp936
    except Exception:  # noqa: BLE001
        pass

    ap = argparse.ArgumentParser(prog="xhs_kit", description="小红书分享链接解析工具箱(离线优先)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_share = sub.add_parser("share", help="解析分享文案 -> 链接 / note_id / xsec_token")
    p_share.add_argument("text", nargs="?", help="分享文案; 省略则从 stdin 读")
    p_share.add_argument("--json", action="store_true")

    p_html = sub.add_parser("html", help="解析已保存的笔记页 HTML -> 结构化字段")
    p_html.add_argument("path", nargs="?", help="HTML 文件路径; 省略则从 stdin 读")
    p_html.add_argument("--note-id", default="")
    p_html.add_argument("--md", action="store_true", help="输出 Markdown 而非 JSON")

    p_api = sub.add_parser("api", help="调用外部链接解析 API(需出网)")
    p_api.add_argument("text")
    p_api.add_argument("--endpoint", required=True)
    p_api.add_argument("--key", default="")

    p_res = sub.add_parser("resolve", help="跟随 302 解析短链, 输出最终 URL(需出网)")
    p_res.add_argument("url")
    p_res.add_argument("--ua", choices=("mobile", "desktop"), default="mobile")
    p_res.add_argument("--save", default="", help="把最终页面 HTML 存到该路径")

    p_fetch = sub.add_parser("fetch", help="抓取链接并解析为结构化笔记(需出网)")
    p_fetch.add_argument("url")
    p_fetch.add_argument("--ua", choices=("mobile", "desktop"), default="mobile")
    p_fetch.add_argument("--save", default="", help="同时保存原始 HTML")
    p_fetch.add_argument("--md", action="store_true")

    sub.add_parser("doctor", help="环境自检: 能否直连小红书")

    args = ap.parse_args(argv)

    if args.cmd == "share":
        text = args.text if args.text is not None else sys.stdin.read()
        out = parse_share_text(text)
    elif args.cmd == "html":
        html = _read_file(args.path) if args.path else sys.stdin.read()
        out = parse_note_html(html, note_id_hint=args.note_id or None)
        if args.md:
            print(to_markdown(out))
            return 0
    elif args.cmd == "api":
        out = api_parse(args.text, args.endpoint, args.key)
    elif args.cmd in ("resolve", "fetch"):
        ua = UA_MOBILE if args.ua == "mobile" else UA_DESKTOP
        raw = resolve_url(args.url, ua=ua) if args.cmd == "resolve" else None
        out = raw if raw is not None else fetch_note(args.url, ua=ua)
        html = out.pop("html", "")
        if args.save and getattr(args, "save", ""):
            parent = os.path.dirname(os.path.abspath(args.save))
            os.makedirs(parent, exist_ok=True)
            with open(args.save, "w", encoding="utf-8") as fh:
                fh.write(html)
            out["saved_to"] = args.save
        if args.cmd == "fetch" and getattr(args, "md", False):
            print(to_markdown(out))
            print(json.dumps({k: v for k, v in out.items() if k != "warnings"}, ensure_ascii=False, indent=2))
            return 0
    else:
        out = doctor()

    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
