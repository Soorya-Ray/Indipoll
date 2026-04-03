"""Constants mirrored from src/lib/ml-sequence.js."""

LOOKBACK_STEPS = 24
HORIZON_STEPS = 12  # each step = 6 hours, so 72-hour forecast

FEATURE_NAMES = ["aqi", "pm25", "pm10", "no2", "o3", "humidity", "wind", "vehicles"]

# Fallback values when a feature is missing (mirrors parseNumber defaults in ml-sequence.js)
FEATURE_DEFAULTS = {
    "aqi": 120,
    "pm25": 40,
    "pm10": 30,
    "no2": 15,
    "o3": 12,
    "humidity": 50,
    "wind": 8,
    "vehicles": 25,
}

# Display names for SHAP explanations (mirrors model-service.js:117-126)
DISPLAY_NAMES = {
    "aqi": "Recent AQI memory",
    "pm25": "PM2.5 load",
    "pm10": "PM10 load",
    "no2": "NO2 traffic burden",
    "o3": "Ozone chemistry",
    "humidity": "Humidity regime",
    "wind": "Wind dispersion",
    "vehicles": "Vehicle emissions share",
}

# AQI clamp range
AQI_MIN = 20
AQI_MAX = 520

# Minimum evaluation windows for promotion (mirrors model-evaluation.js:3)
MIN_REAL_EVALUATION_WINDOWS = 8
