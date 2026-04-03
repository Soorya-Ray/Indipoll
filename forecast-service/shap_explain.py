"""TreeSHAP wrapper that produces the same output format as model-service.js explainForecast()."""

import logging

import numpy as np
import shap

from config import DISPLAY_NAMES, FEATURE_NAMES, HORIZON_STEPS

logger = logging.getLogger(__name__)


def explain_features(x: np.ndarray, station_label: str = "this station") -> list[dict]:
    """Compute SHAP explanations for a forecast.

    Uses TreeSHAP on the first horizon model (h0) as a representative.
    Returns the top 4 features by magnitude, matching the format from
    model-service.js lines 129-141.

    Args:
        x: (1, n_features) feature array
        station_label: city name for text descriptions

    Returns:
        List of up to 4 SHAP explanation dicts.
    """
    from model import _model, _feature_names

    if not _model:
        return []

    model = _model

    try:
        explainer = shap.TreeExplainer(model)
        shap_values = explainer.shap_values(x)  # shape: (1, n_features)
    except Exception as e:
        logger.warning("SHAP computation failed: %s", e)
        return []

    if shap_values.ndim == 1:
        sv = shap_values
    else:
        sv = shap_values[0]

    # Aggregate SHAP values by original feature name.
    # Our engineered features are named like "aqi_mean", "aqi_std", etc.
    # We sum absolute contributions back to the 8 original features.
    feature_shap: dict[str, float] = {name: 0.0 for name in FEATURE_NAMES}

    for i, feat_name in enumerate(_feature_names):
        # feat_name is like "aqi_mean", "pm25_lag_1", "hour_sin", etc.
        matched = False
        for orig_name in FEATURE_NAMES:
            if feat_name.startswith(orig_name + "_"):
                # Use signed sum to capture direction
                feature_shap[orig_name] += sv[i]
                matched = True
                break
        # Time features (hour_sin, etc.) don't map to original features — skip them

    # Build output matching model-service.js format
    explanations = []
    for name in FEATURE_NAMES:
        value = feature_shap[name]
        display = DISPLAY_NAMES.get(name, name)
        mag = abs(value)

        if value >= 0:
            text = f"{display} is pushing the 72-hour mean forecast up by about {mag:.1f} AQI points in {station_label}."
        else:
            text = f"{display} is helping pull the 72-hour mean forecast down by about {mag:.1f} AQI points in {station_label}."

        explanations.append({
            "feature": display,
            "rawFeature": name,
            "impact": "up" if value >= 0 else "down",
            "magnitude": round(mag, 2),
            "text": text,
        })

    # Sort by magnitude descending, return top 4
    explanations.sort(key=lambda e: e["magnitude"], reverse=True)
    return explanations[:4]
