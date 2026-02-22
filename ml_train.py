#!/usr/bin/env python3
"""Train AQI prediction model and store SHAP explanations.

Requirements:
  - Python 3.9+
  - pandas, numpy, scikit-learn, shap, joblib
  - psycopg (v3) or psycopg2

Environment variables:
  DATABASE_URL (required unless --db-url provided)
"""

from __future__ import annotations

import argparse
import os
import sys
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.model_selection import train_test_split

import joblib
import shap


@dataclass
class TrainConfig:
    db_url: str
    model_path: str
    model_version: str
    test_size: float
    random_state: int
    max_rows: Optional[int]


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


def _ensure_explanations_table(conn: Any) -> None:
    sql = (
        "CREATE TABLE IF NOT EXISTS model_explanations ("
        "id UUID PRIMARY KEY DEFAULT gen_random_uuid(), "
        "prediction_id UUID REFERENCES predictions(id), "
        "feature_name TEXT, "
        "feature_value NUMERIC, "
        "contribution NUMERIC, "
        "created_at TIMESTAMP WITH TIME ZONE DEFAULT now()"
        ")"
    )
    with conn.cursor() as cur:
        cur.execute(sql)


def _load_data(conn: Any, max_rows: Optional[int]) -> pd.DataFrame:
    limit_clause = f"LIMIT {int(max_rows)}" if max_rows else ""
    sql = (
        "SELECT p.region_id, p.timestamp, p.pm25, p.pm10, p.no2, p.so2, p.co, p.o3, p.aqi, "
        "c.temperature, c.humidity, c.wind_speed, c.wind_direction, c.precipitation, c.pressure "
        "FROM pollution_metrics p "
        "JOIN climate_metrics c ON c.region_id = p.region_id AND c.timestamp = p.timestamp "
        "WHERE p.aqi IS NOT NULL "
        "ORDER BY p.region_id, p.timestamp "
        f"{limit_clause}"
    )
    with conn.cursor() as cur:
        cur.execute(sql)
        rows = cur.fetchall() or []
        columns = [
            "region_id",
            "timestamp",
            "pm25",
            "pm10",
            "no2",
            "so2",
            "co",
            "o3",
            "aqi",
            "temperature",
            "humidity",
            "wind_speed",
            "wind_direction",
            "precipitation",
            "pressure",
        ]
    df = pd.DataFrame(rows, columns=columns)
    if df.empty:
        return df
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")
    df = df.dropna(subset=["timestamp", "aqi"]).reset_index(drop=True)
    return df


def _add_temporal_features(df: pd.DataFrame) -> pd.DataFrame:
    df["hour"] = df["timestamp"].dt.hour
    df["day_of_week"] = df["timestamp"].dt.dayofweek
    df["month"] = df["timestamp"].dt.month
    return df


def _add_lag_features(df: pd.DataFrame, feature_cols: List[str], lags: List[int]) -> pd.DataFrame:
    df = df.sort_values(["region_id", "timestamp"]).copy()
    for lag in lags:
        for col in feature_cols:
            df[f"{col}_lag_{lag}"] = df.groupby("region_id")[col].shift(lag)
    return df


def _add_rolling_features(df: pd.DataFrame, feature_cols: List[str], windows: List[int]) -> pd.DataFrame:
    df = df.sort_values(["region_id", "timestamp"]).copy()
    for window in windows:
        for col in feature_cols:
            df[f"{col}_roll_{window}"] = (
                df.groupby("region_id")[col]
                .rolling(window=window, min_periods=1)
                .mean()
                .reset_index(level=0, drop=True)
            )
    return df


def _prepare_features(df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.Series]:
    base_features = [
        "pm25",
        "pm10",
        "no2",
        "so2",
        "co",
        "o3",
        "temperature",
        "humidity",
        "wind_speed",
        "wind_direction",
        "precipitation",
        "pressure",
    ]

    df = _add_temporal_features(df)
    df = _add_lag_features(df, base_features + ["aqi"], lags=[1, 3, 6])
    df = _add_rolling_features(df, base_features + ["aqi"], windows=[3, 6])

    feature_cols = [c for c in df.columns if c not in {"region_id", "timestamp", "aqi"}]
    df = df.dropna(subset=feature_cols + ["aqi"]).reset_index(drop=True)
    X = df[feature_cols]
    y = df["aqi"]
    return X, y


def _train_model(X: pd.DataFrame, y: pd.Series, cfg: TrainConfig) -> Tuple[Any, Dict[str, float], pd.DataFrame, pd.Series]:
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=cfg.test_size, random_state=cfg.random_state
    )
    model = RandomForestRegressor(n_estimators=200, random_state=cfg.random_state, n_jobs=-1)
    model.fit(X_train, y_train)

    preds = model.predict(X_test)
    rmse = float(np.sqrt(mean_squared_error(y_test, preds)))
    mae = float(mean_absolute_error(y_test, preds))
    metrics = {"rmse": rmse, "mae": mae}

    return model, metrics, X_test, y_test


def _compute_shap(model: Any, X: pd.DataFrame) -> Tuple[np.ndarray, float]:
    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(X)
    base_value = explainer.expected_value
    if isinstance(base_value, np.ndarray):
        base_value = float(np.array(base_value).mean())
    return np.asarray(shap_values), float(base_value)


def _insert_predictions(
    conn: Any,
    df_meta: pd.DataFrame,
    preds: np.ndarray,
    model_version: str,
) -> List[str]:
    insert_sql = (
        "INSERT INTO predictions ("
        "id, region_id, prediction_timestamp, target_timestamp, predicted_aqi, confidence_score, model_version"
        ") VALUES (%s, %s, %s, %s, %s, %s, %s)"
    )
    prediction_ids: List[str] = []
    now_ts = datetime.now(timezone.utc)
    with conn.cursor() as cur:
        for i in range(len(df_meta)):
            pred_id = str(uuid.uuid4())
            prediction_ids.append(pred_id)
            cur.execute(
                insert_sql,
                (
                    pred_id,
                    df_meta.iloc[i]["region_id"],
                    now_ts,
                    df_meta.iloc[i]["timestamp"],
                    float(preds[i]),
                    None,
                    model_version,
                ),
            )
    return prediction_ids


def _insert_explanations(
    conn: Any,
    prediction_ids: List[str],
    X: pd.DataFrame,
    shap_values: np.ndarray,
) -> None:
    insert_sql = (
        "INSERT INTO model_explanations ("
        "id, prediction_id, feature_name, feature_value, contribution"
        ") VALUES (%s, %s, %s, %s, %s)"
    )
    feature_names = list(X.columns)
    with conn.cursor() as cur:
        for row_idx in range(len(X)):
            pred_id = prediction_ids[row_idx]
            for feat_idx, feat_name in enumerate(feature_names):
                cur.execute(
                    insert_sql,
                    (
                        str(uuid.uuid4()),
                        pred_id,
                        feat_name,
                        float(X.iloc[row_idx, feat_idx]),
                        float(shap_values[row_idx, feat_idx]),
                    ),
                )


def run(cfg: TrainConfig) -> int:
    db_module = _load_db()
    conn = db_module.connect(cfg.db_url)
    try:
        _ensure_explanations_table(conn)

        df = _load_data(conn, cfg.max_rows)
        if df.empty:
            print("No training data found.", file=sys.stderr)
            return 1

        X, y = _prepare_features(df)
        if X.empty:
            print("Not enough data after feature engineering.", file=sys.stderr)
            return 1

        model, metrics, X_test, y_test = _train_model(X, y, cfg)
        joblib.dump(model, cfg.model_path)

        shap_values, _base_value = _compute_shap(model, X_test)
        preds = model.predict(X_test)

        # Align metadata for the test rows
        df_meta = df.loc[X_test.index, ["region_id", "timestamp"]].reset_index(drop=True)
        X_test_reset = X_test.reset_index(drop=True)

        prediction_ids = _insert_predictions(conn, df_meta, preds, cfg.model_version)
        _insert_explanations(conn, prediction_ids, X_test_reset, shap_values)

        conn.commit()
        print(f"Saved model to {cfg.model_path}")
        print(f"Metrics: RMSE={metrics['rmse']:.3f}, MAE={metrics['mae']:.3f}")
        return 0
    finally:
        conn.close()


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Train AQI model and store SHAP explanations.")
    parser.add_argument("--db-url", default=os.getenv("DATABASE_URL"), help="Postgres DSN (or env DATABASE_URL)")
    parser.add_argument("--model-path", default="model.pkl", help="Output path for model (default: model.pkl)")
    parser.add_argument("--model-version", default="rf-v1.0", help="Model version label")
    parser.add_argument("--test-size", type=float, default=0.2, help="Test split fraction (default: 0.2)")
    parser.add_argument("--random-state", type=int, default=42, help="Random seed (default: 42)")
    parser.add_argument("--max-rows", type=int, default=None, help="Limit rows for training")

    args = parser.parse_args(argv)

    if not args.db_url:
        print("Missing database URL. Provide --db-url or set DATABASE_URL.", file=sys.stderr)
        return 2

    cfg = TrainConfig(
        db_url=args.db_url,
        model_path=args.model_path,
        model_version=args.model_version,
        test_size=args.test_size,
        random_state=args.random_state,
        max_rows=args.max_rows,
    )

    return run(cfg)


if __name__ == "__main__":
    raise SystemExit(main())
