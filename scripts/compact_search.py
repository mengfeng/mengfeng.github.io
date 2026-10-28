#!/usr/bin/env python3
"""Keep local search useful without shipping whole article HTML to every search."""

from __future__ import annotations

import sys
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
SEARCH = ROOT / "search.xml"
MAX_CONTENT_CHARS = 1000


class SearchText(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "pre"}:
            self.skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "pre"} and self.skip_depth:
            self.skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self.skip_depth:
            self.parts.append(data)


def plain_text(markup: str) -> str:
    parser = SearchText()
    parser.feed(markup)
    return " ".join(" ".join(parser.parts).split())[:MAX_CONTENT_CHARS]


def compact(xml_text: str) -> str:
    root = ET.fromstring(xml_text)
    if root.tag != "search":
        raise ValueError("Expected a search XML document")
    for entry in root.findall("entry"):
        content = entry.find("content")
        if content is None:
            raise ValueError("Search entry lacks content")
        if content.get("format") != "plain":
            content.text = plain_text(content.text or "")
            content.set("format", "plain")
    return ET.tostring(root, encoding="unicode", xml_declaration=True) + "\n"


def main() -> int:
    original = SEARCH.read_text(encoding="utf-8")
    reduced = compact(original)
    if original != reduced:
        SEARCH.write_text(reduced, encoding="utf-8")
    print(f"Search index: {len(original.encode('utf-8')):,} -> {len(reduced.encode('utf-8')):,} bytes")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, ET.ParseError) as error:
        print(f"Search index compacting stopped: {error}", file=sys.stderr)
        sys.exit(1)
