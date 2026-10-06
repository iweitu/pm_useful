# -*- coding: utf-8 -*-
"""xhs-kit 离线能力回归测试(不联网)。

运行:
    <bundled-python> -m unittest discover -s tests -v
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import xhs_kit as kit  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURES = os.path.join(HERE, "fixtures")

SHARE_PC = (
    "国庆去大理怎么玩？3天2晚路线直接抄 - 小红书 "
    "https://www.xiaohongshu.com/explore/68add7d50000000037037569"
    "?xsec_token=ABFezCZFDcUHv-abcdefghijklmnopqrstuvwxyz-1234567890=&xsec_source=pc_share "
    "复制本条信息，打开【小红书】App查看精彩内容！"
)
SHARE_APP = (
    "93 洱海环湖骑行攻略｜附租车价格 http://xhslink.com/a/AbCdEf12，"
    "复制本条信息，打开【小红书】App查看精彩内容！"
)
SHARE_OTHER = "先看这个吧 https://www.bilibili.com/video/BV1xx411c7mD 挺有用"


def read_fixture(name):
    with open(os.path.join(FIXTURES, name), "r", encoding="utf-8") as fh:
        return fh.read()


class TestLinks(unittest.TestCase):
    def test_extract_links_stops_at_chinese_punctuation(self):
        links = kit.extract_links(SHARE_APP)
        self.assertEqual(links, ["http://xhslink.com/a/AbCdEf12"])

    def test_classify_pc_note_link(self):
        c = kit.classify_link(
            "https://www.xiaohongshu.com/explore/68add7d50000000037037569?xsec_token=ABC%3D&xsec_source=pc_share"
        )
        self.assertEqual(c["kind"], "note_page")
        self.assertEqual(c["note_id"], "68add7d50000000037037569")
        self.assertEqual(c["xsec_token"], "ABC%3D")
        self.assertTrue(c["has_xsec_token"])

    def test_classify_short_link(self):
        c = kit.classify_link("http://xhslink.com/a/AbCdEf12")
        self.assertEqual(c["kind"], "short")
        self.assertIsNone(c["note_id"])

    def test_classify_foreign_link(self):
        self.assertEqual(kit.classify_link("https://www.bilibili.com/x")["kind"], "other")


class TestShareText(unittest.TestCase):
    def test_pc_share(self):
        r = kit.parse_share_text(SHARE_PC)
        self.assertEqual(r["status"], "ok")
        self.assertEqual(r["primary"]["note_id"], "68add7d50000000037037569")
        self.assertEqual(r["title_guess"], "国庆去大理怎么玩？3天2晚路线直接抄")

    def test_app_share_with_short_link(self):
        r = kit.parse_share_text(SHARE_APP)
        self.assertEqual(r["status"], "ok")
        self.assertEqual(r["primary"]["kind"], "short")
        self.assertEqual(r["title_guess"], "洱海环湖骑行攻略｜附租车价格")
        self.assertTrue(any("302" in w for w in r["warnings"]))

    def test_missing_xsec_token_warns(self):
        r = kit.parse_share_text("标题 https://www.xiaohongshu.com/explore/68add7d50000000037037569")
        self.assertTrue(any("xsec_token" in w for w in r["warnings"]))

    def test_no_xhs_link(self):
        r = kit.parse_share_text(SHARE_OTHER)
        self.assertEqual(r["status"], "no_xhs_link")

    def test_empty_text(self):
        r = kit.parse_share_text("")
        self.assertEqual(r["status"], "no_link")
        self.assertEqual(r["candidates"], [])


class TestHtmlSnapshot(unittest.TestCase):
    def test_full_state_page(self):
        r = kit.parse_note_html(read_fixture("pc_note.html"))
        self.assertEqual(r["status"], "ok")
        self.assertEqual(r["parse_depth"], "full_state")
        self.assertEqual(r["note_id"], "68add7d50000000037037569")
        self.assertEqual(r["title"], "国庆去大理怎么玩？3天2晚路线直接抄")
        self.assertIn("洱海环湖", r["desc"])
        self.assertEqual(r["tags"], ["大理", "云南旅行", "国庆去哪儿"])
        self.assertEqual(r["author"]["nickname"], "旅行小张")
        self.assertEqual(r["interact"]["liked"], "1.2万")
        self.assertEqual(len(r["images"]), 3)
        self.assertEqual(r["images"][2], "https://sns-img-qc.xhscdn.com/c.jpg")

    def test_undefined_in_state_does_not_break_parsing(self):
        # fixture 里故意放了 "legacyField":undefined, 解析器应容忍并转成 null
        state = kit.extract_initial_state(read_fixture("pc_note.html"))
        self.assertIsNotNone(state)
        self.assertIsNone(state["note"]["legacyField"])

    def test_og_only_page_is_shallow_parse(self):
        r = kit.parse_note_html(read_fixture("og_only.html"))
        self.assertEqual(r["parse_depth"], "metadata_only")
        self.assertEqual(r["title"], "周末上海Citywalk路线")
        self.assertTrue(any("浅解析" in w for w in r["warnings"]))

    def test_login_wall_detected(self):
        r = kit.parse_note_html(read_fixture("login_wall.html"))
        self.assertEqual(r["status"], "login_wall")
        self.assertTrue(any("登录墙" in w for w in r["warnings"]))

    def test_plain_html_without_meta(self):
        r = kit.parse_note_html("<html><body><div id=\"app\"></div></body></html>")
        self.assertIn(r["status"], ("empty_shell",))
        self.assertEqual(r["parse_depth"], "none")

    def test_markdown_render(self):
        md = kit.to_markdown(kit.parse_note_html(read_fixture("pc_note.html")))
        self.assertIn("## 小红书笔记", md)
        self.assertIn("### 图片 (3)", md)
        self.assertIn("旅行小张", md)

    def test_risk_control_page_not_mistaken_for_note(self):
        """404/风控页的 profile 节点有 desc/images 键, 不能被当成笔记(真实场景踩过的坑)。"""
        html = read_fixture("risk_control.html")
        r = kit.parse_note_html(html)
        self.assertNotEqual(r["status"], "ok")
        self.assertEqual(r["status"], "risk_control")
        self.assertTrue(any("风控" in w for w in r["warnings"]))

    def test_risk_control_detected_from_final_url(self):
        r = kit.parse_note_html(
            "<html><body><div id=\"app\"></div></body></html>",
            final_url="https://www.xiaohongshu.com/404/sec_abc?source=xhs_sec_server&originalUrl=x",
        )
        self.assertEqual(r["status"], "risk_control")

    def test_profile_only_state_is_shell_not_note(self):
        html = ('<html><body><div id="app"></div><script>'
                'window.__INITIAL_STATE__={"profile":{"desc":"","images":[],"id":"u1"}};'
                '</script></body></html>')
        self.assertNotEqual(kit.parse_note_html(html)["status"], "ok")


class TestLoginWallHeuristic(unittest.TestCase):
    def test_redirected_url_counts_as_wall(self):
        self.assertTrue(kit.is_login_wall("<html></html>",
                                          "https://www.xiaohongshu.com/login?redirectPath=x"))

    def test_marker_in_body_counts_as_wall(self):
        self.assertTrue(kit.is_login_wall(read_fixture("login_wall.html"),
                                          "https://www.xiaohongshu.com/explore/abc"))

    def test_normal_page_is_not_wall(self):
        self.assertFalse(kit.is_login_wall(read_fixture("pc_note.html"),
                                           "https://www.xiaohongshu.com/explore/68add7d5"))


class TestBalancedJson(unittest.TestCase):
    def test_braces_inside_strings_are_ignored(self):
        html = '<script>window.__INITIAL_STATE__={"a":"}{","b":{"c":1}};</script>'
        state = kit.extract_initial_state(html)
        self.assertEqual(state, {"a": "}{", "b": {"c": 1}})

    def test_escaped_quote_inside_string(self):
        html = '<script>window.__INITIAL_STATE__={"a":"x\\"}{y"}</script>'
        self.assertEqual(kit.extract_initial_state(html), {"a": 'x"}{y'})


if __name__ == "__main__":
    unittest.main(verbosity=2)
