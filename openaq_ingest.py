#!/usr/bin/env python3
"""Ingest latest OpenAQ measurements for Indian locations into Postgres.

Requires:
  - Python 3.9+
  - psycopg (v3) or psycopg2

Environment variables:
  OPENAQ_API_KEY (required unless --api-key provided)
  DATABASE_URL   (required unless --db-url provided)
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
import uuid
from typing import Any, Dict, Iterable, List, Optional, Tuple

from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


API_BASE = "https://api.openaq.org"


def _load_db() -> Tuple[Any, Any]:
    """Return (module, JsonAdapter) for psycopg/psycopg2."""
    try:
        import psycopg  # type: ignore

        def _json(value: Any) -> Any:
            from psycopg.types.json import Json  # type: ignore

            return Json(value)

        return psycopg, _json
    except Exception:
        try:
            import psycopg2  # type: ignore
            from psycopg2.extras import Json  # type: ignore

            return psycopg2, Json
        except Exception as exc:
            raise RuntimeError("psycopg or psycopg2 is required") from exc


def _request_json(url: str, api_key: str, timeout: int) -> Dict[str, Any]:
    req = Request(url)
    req.add_header("Accept", "application/json")
    req.add_header("X-API-Key", api_key)
    with urlopen(req, timeout=timeout) as resp:
        payload = resp.read().decode("utf-8")
    return json.loads(payload)


def _request_with_retries(
    url: str,
    api_key: str,
    timeout: int,
    max_retries: int,
    base_backoff: float,
    max_backoff: float,
) -> Dict[str, Any]:
    attempt = 0
    while True:
        try:
            return _request_json(url, api_key, timeout)
        except HTTPError as err:
            status = getattr(err, "code", None)
            retryable = status in {429, 500, 502, 503, 504}
            if not retryable or attempt >= max_retries:
                raise
        except URLError:
            if attempt >= max_retries:
                raise
        # exponential backoff with jitter
        sleep_for = min(max_backoff, base_backoff * (2 ** attempt))
        sleep_for = sleep_for * (0.5 + random.random())
        time.sleep(sleep_for)
        attempt += 1


def _iter_india_locations(
    api_key: str,
    limit: int,
    max_pages: int,
    timeout: int,
    max_retries: int,
    base_backoff: float,
    max_backoff: float,
) -> Iterable[Dict[str, Any]]:
    page = 1
    while page <= max_pages:
        url = f"{API_BASE}/v3/locations?iso=IN&limit={limit}&page={page}"
        data = _request_with_retries(url, api_key, timeout, max_retries, base_backoff, max_backoff)
        results = data.get("results") or []
        if not results:
            break
        for loc in results:
            yield loc
        page += 1


def _fetch_latest_for_location(
    api_key: str,
    location_id: int,
    timeout: int,
    max_retries: int,
    base_backoff: float,
    max_backoff: float,
) -> Dict[str, Any]:
    url = f"{API_BASE}/v3/locations/{location_id}/latest"
    return _request_with_retries(url, api_key, timeout, max_retries, base_backoff, max_backoff)


def _get_or_create_data_source(
    conn: Any,
    name: str,
    source_type: str,
    base_url: str,
    notes: Optional[str],
) -> str:
    select_sql = (
        "SELECT id FROM data_sources "
        "WHERE LOWER(name) = LOWER(%s) AND LOWER(type) = LOWER(%s) "
        "LIMIT 1"
    )
    with conn.cursor() as cur:
        cur.execute(select_sql, (name, source_type))
        row = cur.fetchone()
        if row:
            if isinstance(row, dict):
                return row.get("id")
            return row[0]

    new_id = str(uuid.uuid4())
    insert_sql = (
        "INSERT INTO data_sources (id, name, type, base_url, notes) "
        "VALUES (%s, %s, %s, %s, %s)"
    )
    with conn.cursor() as cur:
        cur.execute(insert_sql, (new_id, name, source_type, base_url, notes))
    return new_id


def _insert_raw_ingest(
    conn: Any,
    json_adapter: Any,
    source_id: Optional[str],
    source_url: str,
    payload: Dict[str, Any],
    fmt: str,
) -> None:
    insert_sql = (
        "INSERT INTO raw_ingest (id, source_id, source_url, raw_payload, format, processed) "
        "VALUES (%s, %s, %s, %s, %s, FALSE)"
    )
    with conn.cursor() as cur:
        cur.execute(
            insert_sql,
            (
                str(uuid.uuid4()),
                source_id,
                source_url,
                json_adapter(payload),
                fmt,
            ),
        )


def run(
    api_key: str,
    db_url: str,
    source_id: Optional[str],
    limit: int,
    max_pages: int,
    timeout: int,
    max_retries: int,
    base_backoff: float,
    max_backoff: float,
    pause_between_calls: float,
) -> int:
    db_module, json_adapter = _load_db()
    conn = db_module.connect(db_url)
    ingested = 0
    try:
        if not source_id:
            source_id = _get_or_create_data_source(
                conn=conn,
                name="OpenAQ",
                source_type="api",
                base_url=API_BASE,
                notes="OpenAQ REST API",
            )
        for loc in _iter_india_locations(
            api_key,
            limit,
            max_pages,
            timeout,
            max_retries,
            base_backoff,
            max_backoff,
        ):
            loc_id = loc.get("id")
            if loc_id is None:
                continue
            latest_url = f"{API_BASE}/v3/locations/{loc_id}/latest"
            payload = _fetch_latest_for_location(
                api_key,
                int(loc_id),
                timeout,
                max_retries,
                base_backoff,
                max_backoff,
            )
            _insert_raw_ingest(conn, json_adapter, source_id, latest_url, payload, "json")
            ingested += 1
            if pause_between_calls > 0:
                time.sleep(pause_between_calls)
        conn.commit()
    finally:
        conn.close()
    return ingested


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Ingest OpenAQ latest measurements for Indian locations.")
    parser.add_argument("--api-key", default=os.getenv("OPENAQ_API_KEY"), help="OpenAQ API key (or env OPENAQ_API_KEY)")
    parser.add_argument("--db-url", default=os.getenv("DATABASE_URL"), help="Postgres DSN (or env DATABASE_URL)")
    parser.add_argument("--source-id", default=None, help="Optional data_sources.id to reference")
    parser.add_argument("--limit", type=int, default=100, help="Locations page size (default: 100)")
    parser.add_argument("--max-pages", type=int, default=2, help="Max location pages to scan (default: 2)")
    parser.add_argument("--timeout", type=int, default=30, help="HTTP timeout seconds (default: 30)")
    parser.add_argument("--max-retries", type=int, default=5, help="Max retries on failure (default: 5)")
    parser.add_argument("--base-backoff", type=float, default=1.0, help="Base backoff seconds (default: 1.0)")
    parser.add_argument("--max-backoff", type=float, default=30.0, help="Max backoff seconds (default: 30.0)")
    parser.add_argument("--pause", type=float, default=0.2, help="Pause between API calls seconds (default: 0.2)")

    args = parser.parse_args(argv)

    if not args.api_key:
        print("Missing API key. Provide --api-key or set OPENAQ_API_KEY.", file=sys.stderr)
        return 2
    if not args.db_url:
        print("Missing database URL. Provide --db-url or set DATABASE_URL.", file=sys.stderr)
        return 2

    ingested = run(
        api_key=args.api_key,
        db_url=args.db_url,
        source_id=args.source_id,
        limit=args.limit,
        max_pages=args.max_pages,
        timeout=args.timeout,
        max_retries=args.max_retries,
        base_backoff=args.base_backoff,
        max_backoff=args.max_backoff,
        pause_between_calls=args.pause,
    )
    print(f"Ingested {ingested} location payloads into raw_ingest")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
