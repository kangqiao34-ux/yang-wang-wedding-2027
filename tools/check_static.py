#!/usr/bin/env python3
"""Check local references, calendar and share configuration; stdlib only."""
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit, unquote, parse_qs
import hashlib
import json
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
checks = []


def passed(label):
    checks.append(label)
    print("PASS " + label)


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.tags = []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))


def main():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    page = Page(html)
    ids = [a["id"] for _, a in page.tags if "id" in a]
    assert len(ids) == len(set(ids)), "Duplicate element IDs"
    refs = []
    external = []
    for tag, attrs in page.tags:
        for key in ("src", "href"):
            ref = attrs.get(key)
            if not ref:
                continue
            url = urlsplit(ref)
            if url.scheme:
                if tag == "a":
                    external.append(ref)
                else:
                    assert tag == "link" and attrs.get("rel") in ("canonical", "image_src"), ref
            elif ref.startswith("#"):
                assert unquote(ref[1:]) in ids, ref
            else:
                refs.append((ROOT, ref))
    for css in (ROOT / "css").glob("*.css"):
        for ref in re.findall(r"url\(\s*['\"]?([^)'\"\s]+)", css.read_text()):
            assert not urlsplit(ref).scheme, ref
            refs.append((css.parent, ref))
    for base, ref in refs:
        file = (base / unquote(urlsplit(ref).path)).resolve()
        assert file.is_relative_to(ROOT) and file.exists(), f"Missing resource: {ref}"
    assert len(external) == 1 and urlsplit(external[0]).hostname == "uri.amap.com"
    query = parse_qs(urlsplit(external[0]).query)
    assert query["keyword"] == ["南通绿洲国际假日酒店"]
    assert query["city"] == ["南通"] and query["callnative"] == ["1"]
    assert any(tag == "a" and attrs.get("id") == "calendarLink" and attrs["href"] == "./wedding.ics"
               for tag, attrs in page.tags)
    passed("Local image/audio/CSS/JS/calendar paths and map link")

    for file in [ROOT / "index.html", *ROOT.glob("css/*.css"), *ROOT.glob("js/*.js")]:
        source = file.read_text(encoding="utf-8")
        assert not re.search(r"chatgpt\.site|chatgpt\.com|openai\.com|oaiusercontent|oaistatic", source, re.I), file
    js = "\n".join(p.read_text() for p in ROOT.glob("js/*.js"))
    assert not re.search(r"\b(?:fetch|import|XMLHttpRequest|WebSocket)\s*\(", js)
    assert "hidden" in next(a for _, a in page.tags if a.get("id") == "gate")
    passed("No original hosting runtime dependencies; no-JS cover fallback")

    raw = (ROOT / "wedding.ics").read_bytes()
    assert raw.endswith(b"\r\n") and b"\n" not in raw.replace(b"\r\n", b"")
    assert all(len(line) <= 75 for line in raw.split(b"\r\n"))
    calendar = re.sub(r"\r\n[ \t]", "", raw.decode("utf-8"))
    assert calendar.startswith("BEGIN:VCALENDAR\r\n") and calendar.endswith("END:VCALENDAR\r\n")
    assert "DTSTART:20270109T090800Z" in calendar and "DTEND:20270109T130000Z" in calendar
    assert "SUMMARY:Yang & Wang 婚礼" in calendar
    config = (ROOT / "js/config.js").read_text()
    target = re.search(r'signInAt:\s*"([^"]+)"', config)[1]
    assert datetime.fromisoformat(target).astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ") == "20270109T090800Z"
    passed("Calendar format and countdown target both match China 2027-01-09 17:08")

    with TemporaryDirectory() as temporary:
        temp = Path(temporary)
        (temp / "tools").mkdir()
        shutil.copy2(ROOT / "tools/set_site_url.py", temp / "tools")
        shutil.copy2(ROOT / "index.html", temp)
        subprocess.run([sys.executable, str(temp / "tools/set_site_url.py"), "https://example.test/wedding/"],
                       check=True, capture_output=True, text=True)
        changed = (temp / "index.html").read_text()
        assert changed.count("https://example.test/wedding/assets/images/share-cover.jpg") == 3
        assert changed.count('"https://example.test/wedding/"') == 2
        before = (temp / "index.html").read_bytes()
        rejected = subprocess.run([sys.executable, str(temp / "tools/set_site_url.py"), "javascript:alert(1)"],
                                  capture_output=True)
        assert rejected.returncode != 0 and before == (temp / "index.html").read_bytes()
    passed("Static share URL setter supports subdirectories and rejects unsafe input")

    manifest = ROOT / "asset-manifest.json"
    if manifest.exists():
        for entry in json.loads(manifest.read_text())["files"]:
            assert hashlib.sha256((ROOT / entry["path"]).read_bytes()).hexdigest() == entry["sha256"], entry["path"]
        passed("Packaged file SHA-256 checksums")
    print(f"\n{len(checks)} static check groups passed.")


if __name__ == "__main__":
    main()
