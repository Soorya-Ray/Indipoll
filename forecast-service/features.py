"""Feature engineering: transform lookback sequences into flat feature vectors for LightGBM."""

import math

import numpy as np

from config import FEATURE_NAMES, HORIZON_STEPS, LOOKBACK_STEPS


def _rolling_stats(values: np.ndarray) -> dict:
    """Compute rolling statistics over a 1-D array."""
    return {
        "mean": float(np.mean(values)),
        "std": float(np.std(values)) if len(values) > 1 else 0.0,
        "min": float(np.min(values)),
        "max": float(np.max(values)),
        "last": float(values[-1]),
        "trend": float(np.polyfit(np.arange(len(values)), values, 1)[0]) if len(values) >= 2 else 0.0,
    }


def _lag_features(values: np.ndarray) -> dict:
    """Extract lag values at specific offsets from the end."""
    n = len(values)
    return {
        "lag_1": float(values[-1]) if n >= 1 else 0.0,
        "lag_6": float(values[-6]) if n >= 6 else float(values[0]),
        "lag_12": float(values[-12]) if n >= 12 else float(values[0]),
        "lag_24": float(values[-24]) if n >= 24 else float(values[0]),
    }


def sequence_to_features(
    sequence: list[list[float]],
    station_id: str | None = None,
    hour_of_day: int | None = None,
) -> dict:
    """Convert a lookback sequence (24 x 8) into a flat feature dict for LightGBM.

    Returns ~96 features:
    - 8 features x 6 rolling stats = 48
    - 8 features x 4 lag values = 32
    - 6 time features (hour sin/cos, dow sin/cos, month sin/cos)
    - station_id label encoded (if provided)
    """
    arr = np.array(sequence, dtype=np.float64)
    features = {}

    # Rolling statistics and lag features for each of the 8 input features
    for i, name in enumerate(FEATURE_NAMES):
        col = arr[:, i]
        stats = _rolling_stats(col)
        for stat_name, stat_val in stats.items():
            features[f"{name}_{stat_name}"] = stat_val

        lags = _lag_features(col)
        for lag_name, lag_val in lags.items():
            features[f"{name}_{lag_name}"] = lag_val

    # Time features (cyclical encoding)
    hour = hour_of_day if hour_of_day is not None else 12
    features["hour_sin"] = math.sin(2 * math.pi * hour / 24)
    features["hour_cos"] = math.cos(2 * math.pi * hour / 24)

    # Day of week and month are approximated from sequence length if not available
    # In practice these come from the observation timestamp
    features["dow_sin"] = 0.0
    features["dow_cos"] = 1.0
    features["month_sin"] = 0.0
    features["month_cos"] = 1.0

    return features


def sequence_to_features_with_time(
    sequence: list[list[float]],
    station_id: str | None = None,
    observed_at: str | None = None,
) -> dict:
    """Like sequence_to_features but extracts time info from an ISO timestamp."""
    from datetime import datetime

    hour = 12
    dow = 0
    month = 1
    if observed_at:
        try:
            dt = datetime.fromisoformat(observed_at.replace("Z", "+00:00"))
            hour = dt.hour
            dow = dt.weekday()
            month = dt.month
        except (ValueError, TypeError):
            pass

    features = sequence_to_features(sequence, station_id=station_id, hour_of_day=hour)
    features["dow_sin"] = math.sin(2 * math.pi * dow / 7)
    features["dow_cos"] = math.cos(2 * math.pi * dow / 7)
    features["month_sin"] = math.sin(2 * math.pi * month / 12)
    features["month_cos"] = math.cos(2 * math.pi * month / 12)

    return features


def _pad_sequence(sequence: list[list[float]], target_len: int) -> list[list[float]]:
    """Pad a short sequence to target_len by repeating the earliest step."""
    if len(sequence) >= target_len:
        return sequence[-target_len:]
    pad_count = target_len - len(sequence)
    return [sequence[0]] * pad_count + sequence


def build_training_features(rows_by_station: dict[str, list]) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """Build flat feature matrices from grouped observation rows.

    Uses a single-model approach: each (context, horizon_step) pair becomes one
    training row with `horizon_step` as a feature. This means a single LightGBM
    model handles all horizons, and we can train even with very sparse data.

    Short contexts are padded to LOOKBACK_STEPS for consistent feature dimensions.
    Minimum requirement: 2 observations per station (1 context + 1 target step).

    Args:
        rows_by_station: {station_slug: [rows sorted by observed_at ascending]}

    Returns:
        X: (n_samples, n_features) feature matrix
        y: (n_samples,) target vector (AQI at each horizon step)
        feature_names: list of feature column names
    """
    MIN_CONTEXT = 2  # minimum observations for context before a target step

    all_features = []
    all_targets = []
    feature_names_out = None

    for station_slug, rows in rows_by_station.items():
        from data import observation_to_features
        series = [observation_to_features(row) for row in rows]

        if len(series) < MIN_CONTEXT + 1:
            continue

        # For each possible context position, create samples for each available horizon step
        for i in range(MIN_CONTEXT, len(series)):
            context_start = max(0, i - LOOKBACK_STEPS)
            context = series[context_start: i]
            context = _pad_sequence(context, LOOKBACK_STEPS)

            observed_at = rows[min(i - 1, len(rows) - 1)].get("observed_at")
            base_feat = sequence_to_features_with_time(
                context,
                station_id=station_slug,
                observed_at=observed_at,
            )

            # Create one sample per available future step
            max_horizon = min(len(series) - i, HORIZON_STEPS)
            for h in range(max_horizon):
                feat_dict = {**base_feat, "horizon_step": h}
                target_aqi = series[i + h][0]  # index 0 = aqi

                if feature_names_out is None:
                    feature_names_out = sorted(feat_dict.keys())

                all_features.append([feat_dict[k] for k in feature_names_out])
                all_targets.append(target_aqi)

    if not all_features:
        return np.array([]), np.array([]), []

    return np.array(all_features), np.array(all_targets, dtype=np.float64), feature_names_out
