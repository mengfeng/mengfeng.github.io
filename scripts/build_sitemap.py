#!/usr/bin/env python3
"""Build a sitemap for the committed static GitHub Pages site.

The checkout uses sparse paths, so Git's index is part of the page inventory.
New, not-yet-staged pages on disk are included as well.
"""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path
from urllib.parse import quote
from xml.etree import ElementTree as ET


SITE_URL = "https://mengfeng.github.io"
ROOT = Path(__file__).resolve().parents[1]
SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"


def published_pages(root: Path) -> list[str]:
    result = subprocess.run(
        ["git", "ls-files", "-z", "--", "*.html"],
        cwd=root,
        check=True,
        capture_output=True,
    )
    tracked = {
        path.decode("utf-8")
        for path in result.stdout.split(b"\0")
        if path
    }
    on_disk = {path.relative_to(root).as_posix() for path in root.rglob("index.html")}
    paths = tracked | on_disk
    return sorted(
        path
        for path in paths
        if (path == "index.html" or path.endswith("/index.html"))
        and not path.startswith("examples/")
        and not path.startswith(".git/")
    )


def page_url(path: str) -> str:
    route = "/" if path == "index.html" else "/" + path[: -len("index.html")]
    return SITE_URL + quote(route, safe="/-._~")


def build(root: Path, extra_pages: tuple[str, ...] = ()) -> bytes:
    ET.register_namespace("", SITEMAP_NS)
    urlset = ET.Element(f"{{{SITEMAP_NS}}}urlset")
    for path in sorted(set(published_pages(root)) | set(extra_pages)):
        url = ET.SubElement(urlset, f"{{{SITEMAP_NS}}}url")
        ET.SubElement(url, f"{{{SITEMAP_NS}}}loc").text = page_url(path)
    ET.indent(urlset, space="  ")
    return ET.tostring(urlset, encoding="utf-8", xml_declaration=True) + b"\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="check the committed sitemap without writing")
    args = parser.parse_args()
    output = ROOT / "sitemap.xml"
    expected = build(ROOT)
    if args.check:
        if not output.exists() or output.read_bytes() != expected:
            print("sitemap.xml is stale; run python3 scripts/build_sitemap.py")
            return 1
        print(f"sitemap.xml is current ({len(published_pages(ROOT))} URLs)")
        return 0
    output.write_bytes(expected)
    print(f"Wrote {output} ({len(published_pages(ROOT))} URLs)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
