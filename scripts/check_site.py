#!/usr/bin/env python3
"""Check the key pages and generated files before publishing the static site."""

from __future__ import annotations

import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit
from xml.etree import ElementTree as ET

from build_sitemap import ROOT, SITE_URL, build, page_url


SEARCH_SIZE_WARN_BYTES = 1_000_000


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.lang = ""
        self.title = ""
        self._in_title = False
        self._in_head = False
        self.description = ""
        self.canonical = ""
        self.viewport = ""
        self.references: list[tuple[str, str]] = []
        self.images_without_alt = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "html":
            self.lang = values.get("lang") or ""
        elif tag == "head":
            self._in_head = True
        elif tag == "title":
            self._in_title = True
        elif tag == "meta" and self._in_head:
            if values.get("name") == "description":
                self.description = values.get("content") or ""
            elif values.get("name") == "viewport":
                self.viewport = values.get("content") or ""
        elif tag == "link" and self._in_head:
            if values.get("rel") == "canonical":
                self.canonical = values.get("href") or ""
            elif values.get("href") and values.get("rel") in {"stylesheet", "shortcut icon"}:
                self.references.append(("asset", values["href"] or ""))
        elif tag == "script" and values.get("src"):
            self.references.append(("asset", values["src"] or ""))
        elif tag == "img":
            if not values.get("alt"):
                self.images_without_alt += 1
            if values.get("src"):
                self.references.append(("image", values["src"] or ""))
        elif tag == "a" and values.get("href"):
            self.references.append(("link", values["href"] or ""))

    def handle_endtag(self, tag: str) -> None:
        if tag == "head":
            self._in_head = False
        elif tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data


def site_files(root: Path) -> set[str]:
    result = subprocess.run(
        ["git", "ls-files", "-z"], cwd=root, check=True, capture_output=True
    )
    tracked = {
        path.decode("utf-8")
        for path in result.stdout.split(b"\0")
        if path
    }
    on_disk = {
        path.relative_to(root).as_posix()
        for path in root.rglob("*")
        if path.is_file() and ".git" not in path.relative_to(root).parts
    }
    return tracked | on_disk


def local_target(raw: str, page: str) -> str:
    if not raw or raw.startswith(("#", "javascript:", "mailto:", "tel:", "data:")):
        return ""
    absolute = urljoin(page_url(page), raw)
    parsed = urlsplit(absolute)
    if parsed.netloc != urlsplit(SITE_URL).netloc:
        return ""
    path = unquote(parsed.path).lstrip("/")
    if not path or parsed.path.endswith("/"):
        path += "index.html"
    return path


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []
    files = site_files(ROOT)
    pages = ["index.html"] + sorted(
        path for path in files if path.startswith("2026/") and path.endswith("/index.html")
    )

    for page in pages:
        source = ROOT / page
        if not source.exists():
            errors.append(f"{page}: key page missing from checkout")
            continue
        parser = PageParser()
        parser.feed(source.read_text(encoding="utf-8"))
        if not parser.title.strip():
            errors.append(f"{page}: missing title")
        if parser.lang != "zh-CN":
            errors.append(f"{page}: html lang should be zh-CN (found {parser.lang!r})")
        if not parser.description.strip():
            errors.append(f"{page}: missing meta description")
        if parser.canonical != page_url(page):
            errors.append(f"{page}: canonical should be {page_url(page)}")
        if "maximum-scale" in parser.viewport or "user-scalable=no" in parser.viewport:
            errors.append(f"{page}: viewport prevents reader zoom")
        if parser.images_without_alt:
            warnings.append(f"{page}: {parser.images_without_alt} images without alt text")

        missing = sorted({
            (kind, target)
            for kind, raw in parser.references
            if (target := local_target(raw, page))
            and target not in files
            and f"{target}/index.html" not in files
        })
        for kind, target in missing[:20]:
            errors.append(f"{page}: missing local {kind} /{target}")
        if len(missing) > 20:
            errors.append(f"{page}: {len(missing) - 20} more missing local references")

    sitemap = ROOT / "sitemap.xml"
    if not sitemap.exists() or sitemap.read_bytes() != build(ROOT):
        errors.append("sitemap.xml missing or stale; run python3 scripts/build_sitemap.py")
    else:
        try:
            ET.parse(sitemap)
        except ET.ParseError as exc:
            errors.append(f"sitemap.xml is invalid XML: {exc}")
    robots = ROOT / "robots.txt"
    if not robots.exists() or f"Sitemap: {SITE_URL}/sitemap.xml" not in robots.read_text():
        errors.append("robots.txt does not point to sitemap.xml")

    search = ROOT / "search.xml"
    if not search.exists():
        errors.append("search.xml is missing")
    else:
        size = search.stat().st_size
        try:
            entries = len(ET.parse(search).getroot().findall("entry"))
        except ET.ParseError as exc:
            errors.append(f"search.xml is invalid XML: {exc}")
            entries = 0
        print(f"Search index: {size:,} bytes, {entries} entries")
        if size > SEARCH_SIZE_WARN_BYTES:
            warnings.append(f"search.xml is over {SEARCH_SIZE_WARN_BYTES:,} bytes; keep loading it on demand")

    print(f"Checked {len(pages)} key pages and their local references")
    for warning in warnings:
        print(f"WARN: {warning}")
    for error in errors:
        print(f"ERROR: {error}")
    print(f"Result: {len(errors)} errors, {len(warnings)} warnings")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
