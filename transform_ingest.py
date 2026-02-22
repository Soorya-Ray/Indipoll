#!/usr/bin/env python3
"""Transform raw_ingest OpenAQ payloads into normalized metrics tables.

Requires:
  - Python 3.9+
  - psycopg (v3) or psycopg2

Environment variables:
  DATABASE_URL (required unless --db-url provided)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple


POLLUTANT_PARAMS = {
    "pm25": "pm25",
    "pm10": "pm10",
    "no2": "no2",
    "so2": "so2",
    "co": "co",
    "o3": "o3",
}

CLIMATE_PARAMS = {
    "temperature": "temperature",
    "temp": "temperature",
    "rh": "humidity",
    "humidity": "humidity",
    "ws": "wind_speed",
    "wind_speed": "wind_speed",
    "wd": "wind_direction",
    "wind_direction": "wind_direction",
    "precip": "precipitation",
    "precipitation": "precipitation",
    "pressure": "pressure",
    "press": "pressure",
}


def _load_db() -> Any:
    try:
        import psycopg  # type: ignore

        return psycopg
    except Exception:
        try:
            import psycopg2  # type: ignore

            return psycopg2
        except Exception as exc:
            raise RuntimeError("psycopg or psycopg2 is required") from exc


def _parse_timestamp(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        # OpenAQ timestamps are ISO-8601
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


def _extract_measurements(payload: Dict[str, Any]) -> Tuple[Dict[str, float], Dict[str, float], Optional[datetime]]:
    """Return (pollution_values, climate_values, ts)."""
    results = payload.get("results")
    if isinstance(results, list) and results:
        entry = results[0]
    elif isinstance(payload, dict):
        entry = payload
    else:
        return {}, {}, None

    measurements = entry.get("measurements") or entry.get("results") or []
    if not isinstance(measurements, list):
        return {}, {}, None

    pollution: Dict[str, float] = {}
    climate: Dict[str, float] = {}
    ts: Optional[datetime] = None

    for m in measurements:
        if not isinstance(m, dict):
            continue
        param = m.get("parameter") or m.get("parameterId") or m.get("name")
        if not param:
            continue
        param_key = str(param).lower()
        value = m.get("value")
        if value is None:
            continue
        try:
            value_f = float(value)
        except Exception:
            continue

        ts_candidate = _parse_timestamp(m.get("lastUpdated") or m.get("last_updated") or m.get("date"))
        if ts_candidate and (ts is None or ts_candidate > ts):
            ts = ts_candidate

        if param_key in POLLUTANT_PARAMS:
            pollution[POLLUTANT_PARAMS[param_key]] = value_f
        elif param_key in CLIMATE_PARAMS:
            climate[CLIMATE_PARAMS[param_key]] = value_f

    return pollution, climate, ts


def _extract_location_name(payload: Dict[str, Any]) -> Optional[str]:
    results = payload.get("results")
    entry = None
    if isinstance(results, list) and results:
        entry = results[0]
    elif isinstance(payload, dict):
        entry = payload
    if not isinstance(entry, dict):
        return None

    for key in ("city", "location", "name"):
        value = entry.get(key)
        if value:
            return str(value)
    return None


def _normalize_key(s: str) -> str:
    return " ".join(s.strip().lower().split())


def _resolve_region_id(
    conn: Any,
    db_module: Any,
    location_name: Optional[str],
    region_map: Dict[str, str],
) -> Optional[str]:
    if not location_name:
        return None
    norm = _normalize_key(location_name)
    if norm in region_map:
        return region_map[norm]

    query = "SELECT id FROM regions WHERE LOWER(name) = LOWER(%s) LIMIT 1"
    with conn.cursor() as cur:
        cur.execute(query, (location_name,))
        row = cur.fetchone()
        if row:
            if isinstance(row, dict):
                return row.get("id")
            return row[0]
    return None


def _iter_unprocessed(conn: Any, batch_size: int) -> Iterable[Tuple[str, Dict[str, Any], str]]:
    query = (
        "SELECT id, raw_payload, source_url "
        "FROM raw_ingest "
        "WHERE processed = FALSE "
        "ORDER BY fetched_at ASC "
        "LIMIT %s "
        "FOR UPDATE SKIP LOCKED"
    )
    with conn.cursor() as cur:
        cur.execute(query, (batch_size,))
        rows = cur.fetchall() or []
    for row in rows:
        if isinstance(row, dict):
            yield row["id"], row["raw_payload"], row.get("source_url") or ""
        else:
            yield row[0], row[1], row[2]


def _insert_pollution(conn: Any, region_id: str, ts: datetime, values: Dict[str, float]) -> None:
    cols = ["id", "region_id", "timestamp", "pm25", "pm10", "no2", "so2", "co", "o3", "aqi"]
    data = {
        "id": str(uuid.uuid4()),
        "region_id": region_id,
        "timestamp": ts,
        "pm25": values.get("pm25"),
        "pm10": values.get("pm10"),
        "no2": values.get("no2"),
        "so2": values.get("so2"),
        "co": values.get("co"),
        "o3": values.get("o3"),
        "aqi": None,
    }
    placeholders = ", ".join(["%s"] * len(cols))
    insert_sql = f"INSERT INTO pollution_metrics ({', '.join(cols)}) VALUES ({placeholders})"
    with conn.cursor() as cur:
        cur.execute(insert_sql, [data[c] for c in cols])


def _insert_climate(conn: Any, region_id: str, ts: datetime, values: Dict[str, float]) -> None:
    cols = [
        "id",
        "region_id",
        "timestamp",
        "temperature",
        "humidity",
        "wind_speed",
        "wind_direction",
        "precipitation",
        "pressure",
    ]
    data = {
        "id": str(uuid.uuid4()),
        "region_id": region_id,
        "timestamp": ts,
        "temperature": values.get("temperature"),
        "humidity": values.get("humidity"),
        "wind_speed": values.get("wind_speed"),
        "wind_direction": values.get("wind_direction"),
        "precipitation": values.get("precipitation"),
        "pressure": values.get("pressure"),
    }
    placeholders = ", ".join(["%s"] * len(cols))
    insert_sql = f"INSERT INTO climate_metrics ({', '.join(cols)}) VALUES ({placeholders})"
    with conn.cursor() as cur:
        cur.execute(insert_sql, [data[c] for c in cols])


def _mark_processed(conn: Any, raw_id: str) -> None:
    with conn.cursor() as cur:
        cur.execute("UPDATE raw_ingest SET processed = TRUE WHERE id = %s", (raw_id,))


def run(
    db_url: str,
    batch_size: int,
    region_map: Dict[str, str],
    keep_unmapped: bool,
) -> int:
    db_module = _load_db()
    if db_module.__name__ == "psycopg":
        from psycopg.rows import dict_row  # type: ignore

        conn = db_module.connect(db_url, row_factory=dict_row)
    else:
        conn = db_module.connect(db_url)
    processed = 0
    try:
        for raw_id, payload, _source_url in _iter_unprocessed(conn, batch_size):
            if not isinstance(payload, dict):
                try:
                    payload = json.loads(payload)
                except Exception:
                    payload = {}

            location_name = _extract_location_name(payload)
            region_id = _resolve_region_id(conn, db_module, location_name, region_map)
            if not region_id:
                if keep_unmapped:
                    continue
                _mark_processed(conn, raw_id)
                processed += 1
                continue

            pollution_vals, climate_vals, ts = _extract_measurements(payload)
            if ts is None:
                ts = datetime.now(timezone.utc)

            if pollution_vals:
                _insert_pollution(conn, region_id, ts, pollution_vals)
            if climate_vals:
                _insert_climate(conn, region_id, ts, climate_vals)

            _mark_processed(conn, raw_id)
            processed += 1
        conn.commit()
    finally:
        conn.close()
    return processed


def _parse_region_map(value: Optional[str]) -> Dict[str, str]:
    if not value:
        return {}
    try:
        raw = json.loads(value)
    except Exception:
        return {}
    if not isinstance(raw, dict):
        return {}
    return { _normalize_key(str(k)): str(v) for k, v in raw.items() }


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Transform raw_ingest payloads into normalized metrics tables.")
    parser.add_argument("--db-url", default=os.getenv("DATABASE_URL"), help="Postgres DSN (or env DATABASE_URL)")
    parser.add_argument("--batch-size", type=int, default=50, help="Rows per batch (default: 50)")
    parser.add_argument(
        "--region-map",
        default=os.getenv("REGION_MAP"),
        help="JSON mapping of location name -> region_id (or env REGION_MAP)",
    )
    parser.add_argument(
        "--keep-unmapped",
        action="store_true",
        help="Leave raw_ingest rows unprocessed when region is unmapped",
    )

    args = parser.parse_args(argv)

    if not args.db_url:
        print("Missing database URL. Provide --db-url or set DATABASE_URL.", file=sys.stderr)
        return 2

    region_map = _parse_region_map(args.region_map)

    processed = run(
        db_url=args.db_url,
        batch_size=args.batch_size,
        region_map=region_map,
        keep_unmapped=args.keep_unmapped,
    )
    print(f"Processed {processed} raw_ingest rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
