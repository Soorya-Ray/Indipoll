# Indipoll

Indipoll is a national air quality intelligence platform for India. It combines live AQI feeds, weather context, pollutant and source attribution, community reporting, health guidance, and a 72-hour LSTM forecast lab with SHAP-based explainability.

Production: [https://indipoll.vercel.app](https://indipoll.vercel.app)

## What the app does

- Maps 10 major Indian cities with live or fallback AQI snapshots.
- Shows pollutant mix, source attribution, current weather, and station detail panels.
- Generates a 72-hour AQI outlook with confidence bands.
- Explains forecast movement with SHAP narratives and a visual SHAP summary chart.
- Supports light and dark mode with persistent theme preference.
- Collects community pollution reports in Supabase.

## Stack

- Frontend: React 19, Vite, React Router, Leaflet, React Leaflet
- Backend: Vercel Functions
- Data: Supabase Postgres
- ML: TensorFlow.js LSTM training and serialized artifact inference
- External data: WAQI and Open-Meteo

## Project structure

- [`src`](./src): app pages, components, hooks, client libraries, generated artifact
- [`api`](./api): Vercel Functions for health, live bundle, refresh, forecast, retraining
- [`scripts`](./scripts): local training and refresh workflows
- [`supabase/migrations`](./supabase/migrations): schema and migration history

## Core flows

### Live ingestion

- [`api/refresh-stations.js`](./api/refresh-stations.js) fetches AQI and weather for tracked cities.
- The refresh route upserts canonical station rows, appends hourly observations, and refreshes `station_snapshots`.
- Each snapshot stores forecast output, SHAP output, and model metadata for dashboard reads.

### Dashboard reads

- The frontend prefers `station_dashboard` through [`src/lib/stations.js`](./src/lib/stations.js).
- If Supabase is unavailable, it falls back to [`api/live-bundle.js`](./api/live-bundle.js).
- If live APIs fail completely, the UI falls back to seed/demo data and shows a warning banner.

### Forecast inference

- [`api/forecast.js`](./api/forecast.js) resolves the station, history context, and model artifact.
- [`src/lib/model-service.js`](./src/lib/model-service.js) generates the 72-hour forecast and SHAP attributions.
- The forecast UI in [`src/pages/ForecastPage.jsx`](./src/pages/ForecastPage.jsx) renders both the forecast line chart and the SHAP bar summary.

## Model pipeline

### Model versioning

- New locally trained artifacts are named `indipoll-lstm-v3.0-YYYY-MM-DD`.
- The checked-in fallback artifact lives in [`src/data/ml-model-artifact.generated.js`](./src/data/ml-model-artifact.generated.js).

### Training and promotion

- Run training with `npm run train:model`.
- Run a manual refresh with `npm run refresh:stations`.
- The trainer prefers real `station_observations`, then uses seeded augmentation only when history is still sparse.
- Promotion remains conservative: `MIN_REAL_EVALUATION_WINDOWS` stays at 8 in [`src/lib/model-evaluation.js`](./src/lib/model-evaluation.js).
- Early models can remain in `shadow` until enough contiguous real hourly observations accumulate.

## Recent robustness improvements

- Model artifact loading now degrades safely when Supabase registry reads fail.
- Station refresh logging now records data mode counts and active model version.
- Observation inserts ignore duplicates for the same station and hour.
- Model registry writes use safer rollback behavior during promotion.
- The UI now exposes offline or seed-data fallback state more clearly.
- Forecast payloads now expose `contextSource` so seed-context versus real-history behavior is visible.

## Light and dark mode

- Theme preference is stored in `localStorage` under `indipoll-theme`.
- The navbar includes a toggle that switches the entire app and charts between dark and light themes.
- The preference persists across reloads.

## SHAP visualization

- Forecast Lab shows a horizontal SHAP summary chart above the existing text explanations.
- Green bars indicate features pulling AQI down.
- Amber and red bars indicate features pushing AQI up.
- Seed fallback data also includes magnitude values so the chart still renders when live SHAP values are unavailable.

## Health endpoint

`GET /api/health`

Returns a public JSON health payload with:

- `status`
- `checkedAt`
- `lastSnapshotAt`
- `snapshotAgeMinutes`
- `observationCount`
- `stationCount`
- `activeModel`

The endpoint uses Supabase when configured and reports degraded status if the admin connection is unavailable.

## Environment variables

Required for production-quality live data:

```bash
WAQI_TOKEN=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
CRON_SECRET=
```

Optional:

```bash
FORECAST_API_URL=
VITE_FORECAST_API_URL=
VITE_LIVE_BUNDLE_URL=
```

## Local development

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm run dev
```

Run tests:

```bash
npm test
```

Build for production:

```bash
npm run build
```

## Deployment

- The project is configured for Vercel in [`vercel.json`](./vercel.json).
- Hourly refresh cron hits `/api/refresh-stations`.
- Six-hour retraining cron hits `/api/retrain-model`.
- Both protected endpoints expect the shared bearer secret from `CRON_SECRET`.

## Troubleshooting

- `CRON_SECRET` is empty or missing:
  Cron-triggered refresh and retrain calls will fail authorization even if the schedules exist.
- Supabase env vars are missing:
  The app will fall back to seed data, `/api/health` will report degraded status, and model registry access will be unavailable.
- The UI shows the seed-data warning banner:
  Live bundle loading, Supabase dashboard reads, or upstream APIs likely failed; inspect server logs first.
- Models remain in `shadow`:
  This is expected until enough real hourly observations accumulate for at least 8 evaluation windows.
- Observation history is sparse:
  Check Vercel cron and function logs for `/api/refresh-stations`; the code assumes hourly refresh, so missing rows usually means cron execution or auth failure rather than ML logic.
