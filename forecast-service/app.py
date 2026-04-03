"""FastAPI application for the Indipoll forecast service."""

import logging
import os
import traceback
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from model import get_model_info, is_model_loaded, load_models_from_disk, predict_station, train

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)

CRON_SECRET = os.environ.get("CRON_SECRET", "")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """On startup, try to load a previously trained model or train a new one."""
    logger.info("Starting up forecast service...")

    if not load_models_from_disk():
        logger.info("No saved models found, attempting initial training...")
        try:
            train()
            logger.info("Initial training complete.")
        except Exception as e:
            logger.warning("Initial training failed (will retry on /retrain): %s", e)

    yield
    logger.info("Shutting down forecast service.")


app = FastAPI(
    title="Indipoll Forecast Service",
    description="LightGBM-based AQI forecasting with TreeSHAP explanations",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _check_auth(request: Request) -> bool:
    if not CRON_SECRET:
        return True
    auth = request.headers.get("authorization", "")
    return auth == f"Bearer {CRON_SECRET}"


@app.get("/health")
async def health():
    info = get_model_info()
    loaded = is_model_loaded()

    return {
        "status": "healthy" if loaded else "no-model",
        "model_version": info["version"],
        "last_trained": info["trainedAt"],
        "data_source": info["dataSource"],
        "sample_count": info["sampleCount"],
        "station_count": info["stationCount"],
        "metrics": info["metrics"],
    }


@app.post("/forecast")
async def forecast(request: Request):
    """Generate a 72-hour AQI forecast for a station.

    Expects the same body that api/_shared/live-data.js sends:
    { city, lat, lon, aqi, pollutants, weather, sources }
    """
    if not is_model_loaded():
        raise HTTPException(status_code=503, detail="Model not loaded yet. Call /retrain first.")

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    station_slug = (body.get("stationSlug") or body.get("id") or body.get("city", "")).lower().replace(" ", "")

    # Optionally fetch history from Supabase for better context
    history_rows = []
    if station_slug:
        try:
            from data import fetch_station_history
            history_rows = fetch_station_history(station_slug)
        except Exception as e:
            logger.warning("Failed to fetch station history for %s: %s", station_slug, e)

    try:
        result = predict_station(body, history_rows=history_rows or None)
        return JSONResponse(content=result)
    except Exception as e:
        logger.error("Forecast error: %s\n%s", e, traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/retrain")
async def retrain(request: Request):
    """Trigger model retraining. Protected by CRON_SECRET."""
    if not _check_auth(request):
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        artifact = train()
        return JSONResponse(content={
            "retrained": True,
            "version": artifact["version"],
            "promotion": artifact.get("promotion"),
            "evaluation": artifact.get("evaluationSummary"),
            "trainedAt": artifact["trainedAt"],
        })
    except Exception as e:
        logger.error("Retrain error: %s\n%s", e, traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
