#!/usr/bin/env python3
"""Refresh the public GA4 snapshot without putting credentials in the site."""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "data/analytics.json"
PROPERTY_ID = "339945718"
START_DATE = "2022-01-01"
METRICS = ("activeUsers", "screenPageViews")


def validate_snapshot(value: dict) -> None:
    if not isinstance(value, dict) or value.get("source") != "GA4" or value.get("propertyId") != PROPERTY_ID:
        raise ValueError("Public snapshot has the wrong source or property")
    if value.get("startDate") != START_DATE:
        raise ValueError("Public snapshot has the wrong start date")
    try:
        end_date = date.fromisoformat(value["endDate"])
    except (KeyError, TypeError, ValueError):
        raise ValueError("Public snapshot has an invalid end date") from None
    if end_date < date.fromisoformat(START_DATE):
        raise ValueError("Public snapshot ends before its start date")
    for field in ("activeUsers", "views"):
        if type(value.get(field)) is not int or value[field] < 0:
            raise ValueError(f"Public snapshot has an invalid {field} value")


def parse_report(report: dict) -> tuple[int, int]:
    headers = [item.get("name") for item in report.get("metricHeaders", [])]
    rows = report.get("rows", [])
    if headers != list(METRICS) or len(rows) != 1:
        raise ValueError("GA4 report has unexpected columns or row count")
    metadata = report.get("metadata", {})
    if metadata.get("subjectToThresholding") or report.get("samplingMetadatas"):
        raise ValueError("GA4 report is thresholded or sampled")
    values = [item.get("value") for item in rows[0].get("metricValues", [])]
    if len(values) != 2 or any(not isinstance(value, str) or not re.fullmatch(r"\d+", value) for value in values):
        raise ValueError("GA4 report has invalid metric values")
    return int(values[0]), int(values[1])


def request_report(credentials_json: str, end_date: str) -> dict:
    from google.auth.transport.requests import Request as AuthRequest
    from google.oauth2.service_account import Credentials

    credentials = Credentials.from_service_account_info(
        json.loads(credentials_json),
        scopes=["https://www.googleapis.com/auth/analytics.readonly"],
    )
    credentials.refresh(AuthRequest())
    payload = {
        "dateRanges": [{"startDate": START_DATE, "endDate": end_date}],
        "metrics": [{"name": name} for name in METRICS],
    }
    request = Request(
        f"https://analyticsdata.googleapis.com/v1beta/properties/{PROPERTY_ID}:runReport",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {credentials.token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as response:
            return json.load(response)
    except HTTPError as error:
        raise RuntimeError(f"GA4 Data API returned HTTP {error.code}") from None
    except URLError as error:
        raise RuntimeError("GA4 Data API is unreachable") from error


def main() -> int:
    current = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    validate_snapshot(current)
    end_date = (datetime.now(ZoneInfo("Asia/Shanghai")).date() - timedelta(days=1)).isoformat()
    if end_date <= current["endDate"]:
        print(f"GA4 snapshot already covers {current['endDate']}")
        return 0
    credentials_json = os.environ.get("GA4_SERVICE_ACCOUNT_JSON")
    if not credentials_json:
        raise RuntimeError("GA4_SERVICE_ACCOUNT_JSON is not configured")
    active_users, views = parse_report(request_report(credentials_json, end_date))
    if current["views"] and views < current["views"] * 0.9:
        raise ValueError("GA4 views fell sharply; review property and date range before publishing")
    updated = {
        "source": "GA4",
        "propertyId": PROPERTY_ID,
        "startDate": START_DATE,
        "endDate": end_date,
        "activeUsers": active_users,
        "views": views,
    }
    SNAPSHOT.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"GA4 snapshot updated through {end_date}: {active_users} active users, {views} views")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (KeyError, ValueError, RuntimeError) as error:
        print(f"GA4 refresh stopped: {error}", file=sys.stderr)
        sys.exit(1)
