"""LightGBM training and inference for AQI forecasting.

Uses a single-model approach: one LightGBM model handles all horizon steps,
with `horizon_step` as an input feature. This allows training even with very
sparse data (minimum 3 observations per station).
"""

import logging
import os
from datetime import datetime, timezone
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np

from config import (
    AQI_MAX,
    AQI_MIN,
    FEATURE_NAMES,
    HORIZON_STEPS,
    LOOKBACK_STEPS,
    MIN_REAL_EVALUATION_WINDOWS,
)
from data import (
    fetch_all_observations,
    observation_to_features,
    save_model_artifact,
    station_payload_to_features,
)
from features import _pad_sequence, build_training_features, sequence_to_features_with_time

logger = logging.getLogger(__name__)

MODEL_DIR = Path(os.environ.get("MODEL_DIR", "/tmp/models"))

# In-memory model cache — single model + quantile pair
_model: lgb.Booster | None = None
_model_lo: lgb.Booster | None = None
_model_hi: lgb.Booster | None = None
_feature_names: list[str] = []
_model_version: str | None = None
_trained_at: str | None = None
_metrics: dict = {}
_evaluation_summary: dict | None = None
_training_window: dict = {"start": None, "end": None}
_data_source: str = "unknown"
_sample_count: int = 0
_station_count: int = 0


def get_model_info() -> dict:
    return {
        "version": _model_version,
        "trainedAt": _trained_at,
        "dataSource": _data_source,
        "sampleCount": _sample_count,
        "stationCount": _station_count,
        "metrics": _metrics,
        "trainingWindow": _training_window,
        "evaluationSummary": _evaluation_summary,
    }


def is_model_loaded() -> bool:
    return _model is not None


def _group_rows_by_station(rows: list[dict]) -> dict[str, list]:
    grouped: dict[str, list] = {}
    for row in rows:
        slug = row.get("station_slug") or row.get("station_id") or ""
        if not slug:
            continue
        grouped.setdefault(slug, []).append(row)

    for slug in grouped:
        grouped[slug].sort(key=lambda r: r.get("observed_at", ""))

    return grouped


def _predict_horizon(base_features: dict, feature_names: list[str]) -> tuple[list[float], list[float], list[float]]:
    """Predict all horizon steps using the single model with horizon_step feature."""
    values, lower, upper = [], [], []
    for h in range(HORIZON_STEPS):
        feat = {**base_features, "horizon_step": h}
        x = np.array([[feat[k] for k in feature_names]])
        val = float(np.clip(_model.predict(x)[0], AQI_MIN, AQI_MAX))
        lo = float(np.clip(_model_lo.predict(x)[0], AQI_MIN, AQI_MAX))
        hi = float(np.clip(_model_hi.predict(x)[0], AQI_MIN, AQI_MAX))
        values.append(round(val))
        lower.append(round(min(lo, val)))
        upper.append(round(max(hi, val)))
    return values, lower, upper


def _build_evaluation_windows(grouped: dict[str, list]) -> list[dict]:
    """Build evaluation windows from grouped rows."""
    MIN_CONTEXT = 2
    windows = []
    for slug, rows in grouped.items():
        series = [observation_to_features(r) for r in rows]
        if len(series) < MIN_CONTEXT + 1:
            continue

        for i in range(MIN_CONTEXT, len(series)):
            # Need at least 1 future step for a target
            available_horizon = min(len(series) - i, HORIZON_STEPS)
            if available_horizon < 1:
                continue

            context_start = max(0, i - LOOKBACK_STEPS)
            context = _pad_sequence(series[context_start: i], LOOKBACK_STEPS)
            target = [series[i + h][0] for h in range(available_horizon)]
            # Pad target to HORIZON_STEPS with last available value for consistent evaluation
            while len(target) < HORIZON_STEPS:
                target.append(target[-1])

            windows.append({
                "stationId": slug,
                "stationCity": rows[min(i - 1, len(rows) - 1)].get("station_city", slug),
                "sequence": context,
                "target": target,
                "observed_at": rows[min(i - 1, len(rows) - 1)].get("observed_at"),
                "available_horizon": available_horizon,
            })
    return windows


def _evaluate_on_windows(windows: list[dict]) -> dict | None:
    """Evaluate the current model on evaluation windows."""
    if not windows or not _model:
        return None

    overall_residuals = []
    persistence_residuals = []
    rolling_residuals = []
    horizon_buckets = [[] for _ in range(HORIZON_STEPS)]
    persistence_horizon = [[] for _ in range(HORIZON_STEPS)]
    rolling_horizon = [[] for _ in range(HORIZON_STEPS)]
    city_buckets: dict[str, dict] = {}

    for w in windows:
        feat = sequence_to_features_with_time(w["sequence"], observed_at=w.get("observed_at"))
        prediction, _, _ = _predict_horizon(feat, _feature_names)

        persistence = [w["sequence"][-1][0]] * HORIZON_STEPS
        rolling_mean_val = float(np.mean([step[0] for step in w["sequence"]]))
        rolling_mean = [rolling_mean_val] * HORIZON_STEPS
        available = w.get("available_horizon", HORIZON_STEPS)

        sid = w["stationId"]
        if sid not in city_buckets:
            city_buckets[sid] = {
                "city": w["stationCity"],
                "residuals": [], "persistence_residuals": [], "rolling_residuals": [],
                "samples": 0,
            }
        city_buckets[sid]["samples"] += 1

        for h in range(min(available, HORIZON_STEPS)):
            actual = w["target"][h]
            r = prediction[h] - actual
            pr = persistence[h] - actual
            rr = rolling_mean[h] - actual

            overall_residuals.append(r)
            persistence_residuals.append(pr)
            rolling_residuals.append(rr)
            horizon_buckets[h].append(r)
            persistence_horizon[h].append(pr)
            rolling_horizon[h].append(rr)
            city_buckets[sid]["residuals"].append(r)
            city_buckets[sid]["persistence_residuals"].append(pr)
            city_buckets[sid]["rolling_residuals"].append(rr)

    def summarize(residuals):
        if not residuals:
            return {"rmse": 0, "mae": 0}
        arr = np.array(residuals)
        return {
            "rmse": round(float(np.sqrt(np.mean(arr**2))), 3),
            "mae": round(float(np.mean(np.abs(arr))), 3),
        }

    overall = summarize(overall_residuals)
    pers = summarize(persistence_residuals)
    roll = summarize(rolling_residuals)
    pers_delta = round((pers["rmse"] - overall["rmse"]) / pers["rmse"] * 100, 1) if pers["rmse"] > 0 else 0
    roll_delta = round((roll["rmse"] - overall["rmse"]) / roll["rmse"] * 100, 1) if roll["rmse"] > 0 else 0

    horizon_detail = []
    for h in range(HORIZON_STEPS):
        hs = summarize(horizon_buckets[h])
        ps = summarize(persistence_horizon[h])
        rs = summarize(rolling_horizon[h])
        horizon_detail.append({
            "step": h + 1, "label": f"{(h + 1) * 6}h",
            "rmse": hs["rmse"], "mae": hs["mae"],
            "persistenceRmse": ps["rmse"], "persistenceMae": ps["mae"],
            "rollingMeanRmse": rs["rmse"], "rollingMeanMae": rs["mae"],
        })

    cities_detail = []
    for sid, bucket in sorted(city_buckets.items(), key=lambda x: x[1]["city"]):
        cs = summarize(bucket["residuals"])
        cps = summarize(bucket["persistence_residuals"])
        crs = summarize(bucket["rolling_residuals"])
        cities_detail.append({
            "stationId": sid, "city": bucket["city"], "samples": bucket["samples"],
            "rmse": cs["rmse"], "mae": cs["mae"],
            "persistenceRmse": cps["rmse"], "persistenceMae": cps["mae"],
            "persistenceDelta": round((cps["rmse"] - cs["rmse"]) / cps["rmse"] * 100, 1) if cps["rmse"] > 0 else 0,
            "rollingMeanRmse": crs["rmse"], "rollingMeanMae": crs["mae"],
            "rollingMeanDelta": round((crs["rmse"] - cs["rmse"]) / crs["rmse"] * 100, 1) if crs["rmse"] > 0 else 0,
        })

    return {
        "samples": len(windows),
        "rmse": overall["rmse"], "mae": overall["mae"],
        "persistenceRmse": pers["rmse"], "persistenceMae": pers["mae"],
        "persistenceDelta": pers_delta,
        "rollingMeanRmse": roll["rmse"], "rollingMeanMae": roll["mae"],
        "rollingMeanDelta": roll_delta,
        "horizon": horizon_detail,
        "cities": cities_detail,
    }


def _decide_promotion(eval_summary: dict | None, predecessor_version: str | None) -> dict:
    """Mirrors decidePromotion() in model-evaluation.js."""
    if not eval_summary or eval_summary.get("samples", 0) < MIN_REAL_EVALUATION_WINDOWS:
        return {
            "shouldPromote": False,
            "status": "shadow",
            "reason": "insufficient-real-evaluation-windows",
            "predecessorVersion": predecessor_version,
        }
    if eval_summary["rmse"] >= eval_summary["persistenceRmse"]:
        return {
            "shouldPromote": False,
            "status": "shadow",
            "reason": "worse-than-persistence-baseline",
            "predecessorVersion": predecessor_version,
        }
    reason = "beats-baseline-and-replaces-active-model" if predecessor_version else "beats-baseline-and-becomes-first-active-model"
    return {
        "shouldPromote": True,
        "status": "active",
        "reason": reason,
        "predecessorVersion": predecessor_version,
    }


def train() -> dict:
    """Run the full training pipeline. Returns the artifact summary."""
    global _model, _model_lo, _model_hi, _feature_names
    global _model_version, _trained_at, _metrics, _evaluation_summary
    global _training_window, _data_source, _sample_count, _station_count

    logger.info("Fetching historical observations...")
    rows = fetch_all_observations()
    grouped = _group_rows_by_station(rows)

    logger.info("Building training features from %d observations across %d stations...", len(rows), len(grouped))
    X, y, feat_names = build_training_features(grouped)

    if X.size == 0:
        raise RuntimeError("No training samples could be generated from available data")

    # Time-based split: last 20% for validation
    n = len(X)
    split_idx = max(1, int(n * 0.8))
    X_train, X_val = X[:split_idx], X[split_idx:]
    y_train, y_val = y[:split_idx], y[split_idx:]

    logger.info("Training single model on %d samples, validating on %d samples...", len(X_train), len(X_val))

    # Main regression model
    dtrain = lgb.Dataset(X_train, label=y_train, feature_name=feat_names)
    dval = lgb.Dataset(X_val, label=y_val, feature_name=feat_names, reference=dtrain)

    params = {
        "objective": "regression",
        "metric": "rmse",
        "num_leaves": 31,
        "learning_rate": 0.05,
        "reg_alpha": 0.1,
        "reg_lambda": 0.1,
        "verbose": -1,
        "seed": 42,
    }

    new_model = lgb.train(
        params, dtrain,
        num_boost_round=1000,
        valid_sets=[dval],
        callbacks=[lgb.early_stopping(50, verbose=False)],
    )

    # Lower quantile (10th percentile)
    params_lo = {**params, "objective": "quantile", "alpha": 0.1, "metric": "quantile"}
    new_model_lo = lgb.train(
        params_lo, dtrain,
        num_boost_round=new_model.best_iteration or 100,
        valid_sets=[dval],
        callbacks=[lgb.log_evaluation(period=0)],
    )

    # Upper quantile (90th percentile)
    params_hi = {**params, "objective": "quantile", "alpha": 0.9, "metric": "quantile"}
    new_model_hi = lgb.train(
        params_hi, dtrain,
        num_boost_round=new_model.best_iteration or 100,
        valid_sets=[dval],
        callbacks=[lgb.log_evaluation(period=0)],
    )

    # Update global state
    _model = new_model
    _model_lo = new_model_lo
    _model_hi = new_model_hi
    _feature_names = feat_names

    # Compute validation metrics
    val_preds = _model.predict(X_val)
    residuals = val_preds - y_val
    val_rmse = float(np.sqrt(np.mean(residuals**2)))
    val_mae = float(np.mean(np.abs(residuals)))

    # Evaluate on real windows
    eval_windows = _build_evaluation_windows(grouped)
    eval_summary = _evaluate_on_windows(eval_windows)

    # Training window
    all_dates = [r.get("observed_at") for r in rows if r.get("observed_at")]
    all_dates.sort()
    tw = {"start": all_dates[0] if all_dates else None, "end": all_dates[-1] if all_dates else None}

    trained_at = datetime.now(timezone.utc).isoformat()
    version = f"indipoll-lgbm-v1.0-{trained_at[:10]}"

    from data import load_active_model_version
    predecessor = load_active_model_version()
    promotion = _decide_promotion(eval_summary, predecessor)

    _model_version = version
    _trained_at = trained_at
    _training_window = tw
    _data_source = "supabase-history"
    _sample_count = n
    _station_count = len(grouped)
    _evaluation_summary = eval_summary
    _metrics = {
        "validation_rmse": round(val_rmse, 3),
        "validation_mae": round(val_mae, 3),
        "historical_observation_count": len(rows),
        "training_sample_count": n,
        "evaluation_window_count": len(eval_windows),
        "evaluation_rmse": eval_summary["rmse"] if eval_summary else None,
        "persistence_rmse": eval_summary["persistenceRmse"] if eval_summary else None,
        "rolling_mean_rmse": eval_summary["rollingMeanRmse"] if eval_summary else None,
    }

    # Save models to disk
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    _model.save_model(str(MODEL_DIR / "model.txt"))
    _model_lo.save_model(str(MODEL_DIR / "model_lo.txt"))
    _model_hi.save_model(str(MODEL_DIR / "model_hi.txt"))
    joblib.dump(_feature_names, MODEL_DIR / "feature_names.pkl")

    artifact = {
        "version": version,
        "trainedAt": trained_at,
        "lookback": LOOKBACK_STEPS,
        "horizon": HORIZON_STEPS,
        "featureNames": FEATURE_NAMES,
        "dataSource": _data_source,
        "sampleCount": n,
        "stationCount": len(grouped),
        "metrics": _metrics,
        "evaluationSummary": eval_summary,
        "trainingWindow": tw,
        "promotion": {
            "status": promotion["status"],
            "reason": promotion["reason"],
            "predecessorVersion": promotion.get("predecessorVersion"),
        },
        "modelType": "lightgbm",
    }

    try:
        save_model_artifact(artifact, {
            "dataSource": _data_source,
            "sampleCount": n,
            "stationCount": len(grouped),
            "metrics": _metrics,
        })
    except Exception as e:
        logger.warning("Failed to save model artifact to Supabase: %s", e)

    logger.info("Training complete: %s (promotion: %s)", version, promotion["status"])
    return artifact


def predict_station(
    station_payload: dict,
    history_rows: list[dict] | None = None,
) -> dict:
    """Generate a forecast for a single station."""
    from shap_explain import explain_features

    if not _model:
        raise RuntimeError("No model loaded. Call train() first.")

    # Build the lookback sequence
    if history_rows and len(history_rows) >= 2:
        sequence = [observation_to_features(r) for r in history_rows]
        sequence = _pad_sequence(sequence, LOOKBACK_STEPS)
    else:
        current = station_payload_to_features(station_payload)
        sequence = [current] * LOOKBACK_STEPS

    # Replace last step with current live data
    live_features = station_payload_to_features(station_payload)
    sequence[-1] = live_features

    # Build base feature dict (without horizon_step)
    base_feat = sequence_to_features_with_time(sequence, station_id=station_payload.get("city"))

    # Predict all horizons
    values, lower, upper = _predict_horizon(base_feat, _feature_names)

    # SHAP explanations (use horizon_step=0 representative)
    shap_feat = {**base_feat, "horizon_step": 0}
    x_shap = np.array([[shap_feat[k] for k in _feature_names]])
    shap_explanations = explain_features(x_shap, station_payload.get("city", "this station"))

    history_samples = len(history_rows) if history_rows else 0

    return {
        "forecast": {
            "values": values,
            "upper": upper,
            "lower": lower,
        },
        "shap": shap_explanations,
        "model": {
            "version": _model_version,
            "trainedAt": _trained_at,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "confidence": "treeshap-quantile-regression",
            "dataSource": _data_source,
            "sampleCount": _sample_count,
            "stationCount": _station_count,
            "promotion": _evaluation_summary.get("promotion") if _evaluation_summary else None,
            "trainingWindow": _training_window,
            "metrics": _metrics,
            "evaluation": _evaluation_summary,
            "historySamples": history_samples,
            "contextSource": "observation-history" if history_samples >= 2 else "synthetic-fallback",
        },
        "mode": "live",
    }


def load_models_from_disk() -> bool:
    """Try to load previously saved models from MODEL_DIR."""
    global _model, _model_lo, _model_hi, _feature_names, _model_version, _trained_at

    feat_path = MODEL_DIR / "feature_names.pkl"
    if not feat_path.exists():
        return False

    try:
        _feature_names = joblib.load(feat_path)
        _model = lgb.Booster(model_file=str(MODEL_DIR / "model.txt"))
        _model_lo = lgb.Booster(model_file=str(MODEL_DIR / "model_lo.txt"))
        _model_hi = lgb.Booster(model_file=str(MODEL_DIR / "model_hi.txt"))
        _model_version = "indipoll-lgbm-loaded-from-disk"
        _trained_at = datetime.now(timezone.utc).isoformat()
        logger.info("Loaded models from disk: %s", MODEL_DIR)
        return True
    except Exception as e:
        logger.warning("Failed to load models from disk: %s", e)
        _model = None
        _model_lo = None
        _model_hi = None
        return False
