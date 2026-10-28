"""Check public-number validation and search-index preservation."""

from __future__ import annotations

import sys
import unittest
from html import escape
from pathlib import Path
from xml.etree import ElementTree as ET


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from compact_search import MAX_CONTENT_CHARS, compact  # noqa: E402
from update_ga4_stats import parse_report, validate_snapshot  # noqa: E402


def report(active_users: str = "2248", views: str = "3866") -> dict:
    return {
        "metricHeaders": [{"name": "activeUsers"}, {"name": "screenPageViews"}],
        "rows": [{"metricValues": [{"value": active_users}, {"value": views}]}],
    }


class AnalyticsReportTests(unittest.TestCase):
    def test_public_snapshot_rejects_wrong_property(self) -> None:
        snapshot = {
            "source": "GA4", "propertyId": "wrong", "startDate": "2022-01-01",
            "endDate": "2026-10-28", "activeUsers": 2248, "views": 3866,
        }
        with self.assertRaises(ValueError):
            validate_snapshot(snapshot)

    def test_expected_metrics_are_read_in_order(self) -> None:
        self.assertEqual(parse_report(report()), (2248, 3866))

    def test_wrong_metric_order_or_invalid_values_stop_publication(self) -> None:
        swapped = report()
        swapped["metricHeaders"].reverse()
        with self.assertRaises(ValueError):
            parse_report(swapped)
        with self.assertRaises(ValueError):
            parse_report(report("not-a-number"))

    def test_thresholded_report_stops_publication(self) -> None:
        thresholded = report()
        thresholded["metadata"] = {"subjectToThresholding": True}
        with self.assertRaises(ValueError):
            parse_report(thresholded)


class SearchIndexTests(unittest.TestCase):
    def test_compaction_is_idempotent_and_keeps_literal_code_text(self) -> None:
        markup = "<p>Start</p><p>&lt;script lang=\"ts\"&gt; is an example</p>" + "x" * 2000
        source = (
            "<search><entry><title>Example</title><url>/example/</url>"
            f"<content>{escape(markup)}</content></entry></search>"
        )
        first = compact(source)
        self.assertEqual(compact(first), first)
        entry = ET.fromstring(first).find("entry")
        assert entry is not None
        content = entry.find("content")
        assert content is not None
        self.assertEqual(content.get("format"), "plain")
        self.assertIn('<script lang="ts"> is an example', content.text or "")
        self.assertLessEqual(len(content.text or ""), MAX_CONTENT_CHARS)


if __name__ == "__main__":
    unittest.main()
