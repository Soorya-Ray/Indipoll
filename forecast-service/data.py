"""Supabase data access layer for observations and model artifacts."""

import os
from datetime import datetime, timezone

import numpy as np
from supabase import create_client

from config import FEATURE_DEFAULTS, FEATURE_NAMES


def _get_client():
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    return create_client(url, key)


def _parse_number(value, fallback=0.0):
    if value is None:
        return fallback
    try:
        v = float(value)
        return v if np.isfinite(v) else fallback
    except (ValueError, TypeError):
        return fallback


def observation_to_features(row: dict) -> list[float]:
    """Convert a station_observations row into an 8-element feature vector.

    Mirrors observationToFeatureVector() in ml-sequence.js.
    """
    features = row.get("features") or {}
    pollutants = row.get("pollutants") or {}
    weather = row.get("weather") or {}
    sources = row.get("sources") or {}

    return [
        _parse_number(features.get("aqi", row.get("aqi")), FEATURE_DEFAULTS["aqi"]),
        _parse_number(features.get("pm25", pollutants.get("PM2_5")), FEATURE_DEFAULTS["pm25"]),
        _parse_number(features.get("pm10", pollutants.get("PM10")), FEATURE_DEFAULTS["pm10"]),
        _parse_number(features.get("no2", pollutants.get("NO2")), FEATURE_DEFAULTS["no2"]),
        _parse_number(features.get("o3", pollutants.get("O3")), FEATURE_DEFAULTS["o3"]),
        _parse_number(features.get("humidity", weather.get("Humidity")), FEATURE_DEFAULTS["humidity"]),
        _parse_number(features.get("wind", weather.get("Wind")), FEATURE_DEFAULTS["wind"]),
        _parse_number(features.get("vehicles", sources.get("Vehicles")), FEATURE_DEFAULTS["vehicles"]),
    ]


def station_payload_to_features(payload: dict) -> list[float]:
    """Convert a forecast request payload into an 8-element feature vector.

    Mirrors stationToFeatureVector() in ml-sequence.js.
    """
    pollutants = payload.get("pollutants") or {}
    weather = payload.get("weather") or {}
    sources = payload.get("sources") or {}

    return [
        _parse_number(payload.get("aqi"), FEATURE_DEFAULTS["aqi"]),
        _parse_number(pollutants.get("PM2_5"), FEATURE_DEFAULTS["pm25"]),
        _parse_number(pollutants.get("PM10"), FEATURE_DEFAULTS["pm10"]),
        _parse_number(pollutants.get("NO2"), FEATURE_DEFAULTS["no2"]),
        _parse_number(pollutants.get("O3"), FEATURE_DEFAULTS["o3"]),
        _parse_number(weather.get("Humidity"), FEATURE_DEFAULTS["humidity"]),
        _parse_number(weather.get("Wind"), FEATURE_DEFAULTS["wind"]),
        _parse_number(sources.get("Vehicles"), FEATURE_DEFAULTS["vehicles"]),
    ]


def fetch_all_observations() -> list[dict]:
    """Fetch all station_observations rows, paginated.

    Mirrors fetchHistoricalObservations() in train-lstm.mjs.
    """
    client = _get_client()
    page_size = 1000
    rows = []
    offset = 0

    while True:
        response = (
            client.table("station_observations")
            .select("station_id, observed_at, aqi, pollutants, sources, weather, features, station:stations!inner(slug, city)")
            .order("observed_at", desc=False)
            .range(offset, offset + page_size - 1)
            .execute()
        )

        batch = response.data or []
        for row in batch:
            station_info = row.get("station") or {}
            row["station_slug"] = station_info.get("slug")
            row["station_city"] = station_info.get("city")
        rows.extend(batch)

        if len(batch) < page_size:
            break
        offset += page_size

    return rows


def fetch_station_history(station_slug: str, limit: int = 24) -> list[dict]:
    """Fetch the most recent observations for a single station."""
    client = _get_client()

    # First get the station_id
    station_resp = (
        client.table("stations")
        .select("id")
        .eq("slug", station_slug)
        .maybe_single()
        .execute()
    )
    if not station_resp.data:
        return []

    station_id = station_resp.data["id"]

    response = (
        client.table("station_observations")
        .select("observed_at, aqi, pollutants, sources, weather, features")
        .eq("station_id", station_id)
        .order("observed_at", desc=True)
        .limit(limit)
        .execute()
    )

    rows = response.data or []
    rows.reverse()  # oldest first
    return rows


def save_model_artifact(artifact: dict, metadata: dict) -> None:
    """Save a trained model record to model_artifacts and model_evaluations.

    Mirrors saveModelRecord() in train-lstm.mjs.
    """
    client = _get_client()

    # Check current active model
    active_resp = (
        client.table("model_artifacts")
        .select("version, artifact, is_active")
        .eq("is_active", True)
        .order("trained_at", desc=True)
        .limit(1)
        .maybe_single()
        .execute()
    )
    active_row = active_resp.data

    should_promote = artifact["promotion"]["status"] == "active"

    row = {
        "version": artifact["version"],
        "trained_at": artifact["trainedAt"],
        "data_source": metadata["dataSource"],
        "sample_count": metadata["sampleCount"],
        "station_count": metadata["stationCount"],
        "lookback_steps": artifact["lookback"],
        "horizon_steps": artifact["horizon"],
        "metrics": metadata["metrics"],
        "evaluation_summary": artifact.get("evaluationSummary") or {},
        "training_window_start": artifact["trainingWindow"]["start"],
        "training_window_end": artifact["trainingWindow"]["end"],
        "predecessor_version": artifact["promotion"].get("predecessorVersion"),
        "promotion_status": artifact["promotion"]["status"],
        "promotion_reason": artifact["promotion"]["reason"],
        "artifact": artifact,
        "is_active": should_promote,
    }

    if should_promote:
        client.table("model_artifacts").update({"is_active": False}).eq("is_active", True).execute()

    client.table("model_artifacts").upsert(row, on_conflict="version").execute()

    # model_evaluations insert (non-fatal)
    try:
        eval_summary = artifact.get("evaluationSummary") or {}
        client.table("model_evaluations").insert({
            "model_version": artifact["version"],
            "summary": eval_summary,
            "by_horizon": eval_summary.get("horizon", []),
            "by_station": eval_summary.get("cities", []),
        }).execute()
    except Exception:
        pass


def load_active_model_version() -> str | None:
    """Return the version string of the currently active model, or None."""
    try:
        client = _get_client()
        resp = (
            client.table("model_artifacts")
            .select("version")
            .eq("is_active", True)
            .order("trained_at", desc=True)
            .limit(1)
            .maybe_single()
            .execute()
        )
        return resp.data["version"] if resp.data else None
    except Exception:
        return None


def get_observation_count() -> int:
    """Return the total number of observations in the database."""
    try:
        client = _get_client()
        resp = (
            client.table("station_observations")
            .select("station_id", count="exact")
            .limit(0)
            .execute()
        )
        return resp.count or 0
    except Exception:
        return 0
