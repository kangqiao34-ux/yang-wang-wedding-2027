#!/usr/bin/env python3
"""Set static sharing metadata to a new deployment URL; no dependencies."""
from html import escape
from pathlib import Path
from urllib.parse import urljoin, urlsplit
import re
import sys


def configure(site_url: str) -> None:
    parsed = urlsplit(site_url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise SystemExit("请输入完整的网址，例如：https://your-domain.cn/")
    if parsed.query or parsed.fragment or parsed.username or parsed.password:
        raise SystemExit("网址不能包含查询参数、#片段或登录信息。")
    if parsed.path.endswith((".html", ".htm")):
        raise SystemExit("请输入网站文件夹的网址，不要附加 index.html。")
    site_url = site_url.rstrip("/") + "/"
    index = Path(__file__).resolve().parents[1] / "index.html"
    html = index.read_text(encoding="utf-8")
    image_url = urljoin(site_url, "assets/images/share-cover.jpg")
    replacements = [
        (r'(<meta property="og:url" content=")[^"]*(")', site_url),
        (r'(<meta property="og:image" content=")[^"]*(")', image_url),
        (r'(<meta name="twitter:image" content=")[^"]*(")', image_url),
        (r'(<link rel="image_src" href=")[^"]*(")', image_url),
        (r'(<link rel="canonical" href=")[^"]*(")', site_url),
    ]
    for pattern, value in replacements:
        html, count = re.subn(pattern, lambda m: m[1] + escape(value, quote=True) + m[2], html)
        if count != 1:
            raise SystemExit("配置失败：分享标签不完整，原文件未修改。")
    index.write_text(html, encoding="utf-8")
    print("分享网址与封面已更新：", site_url)
    print("图片、音乐、中文文案与页面布局保持不变。")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("用法：python3 tools/set_site_url.py https://your-domain.cn/")
    configure(sys.argv[1])
