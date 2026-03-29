# Indipoll

Indipoll is a national air quality intelligence platform for India. It combines live AQI feeds, weather context, pollutant/source attribution, personalized health advisories, citizen pollution reports, and an LSTM-based AQI forecasting pipeline with exact Shapley attribution over the latest feature context.

Production: [https://indipoll.vercel.app](https://indipoll.vercel.app)

## What the app does

- Shows 10 major Indian cities on an interactive Leaflet map with severity-colored station markers.
- Displays live AQI, pollutant mix, source attribution, and current weather for each tracked city.
- Generates a 72-hour AQI forecast with confidence bands.
- Explains forecast movement using exact Shapley attribution over the model's live feature context.
- Adapts advisories by health profile: asthmatic, elderly, child, outdoor worker, healthy adult.
- Lets citizens submit community pollution reports that are persisted in Supabase and reflected in the UI.

## Stack

- Frontend: React 19, Vite, React Router, Leaflet, React Leaflet
- Backend: Vercel serverless functions
- Data: Supabase Postgres + Realtime
- ML: TensorFlow.js LSTM training pipeline with serialized artifact inference
- External data: WAQI for AQI, Open-Meteo for weather

## Project structure

- [`/Users/drspray/Desktop/indipoll/src`](./src): React app pages, components, styling, client libraries
- [`/Users/drspray/Desktop/indipoll/api`](./api): Vercel serverless endpoints for live bundle, forecasting, and refresh
- [`/Users/drspray/Desktop/indipoll/scripts`](./scripts): model training workflow
- [`/Users/drspray/Desktop/indipoll/supabase/migrations`](./supabase/migrations): database schema and seed migrations

## Data flow

### 1. Live ingestion

- [`/Users/drspray/Desktop/indipoll/api/refresh-stations.js`](./api/refresh-stations.js) fetches live AQI and weather for the tracked cities.
- The route upserts canonical station rows into `public.stations`.
- The same refresh writes an append-only hourly observation into `public.station_observations`.
- After observation writes, the route rebuilds `public.station_snapshots` with fresh forecast and SHAP outputs.
- Upstream AQI and weather fetching stays server-side only.

### 2. Dashboard reads

- The frontend first reads `public.station_dashboard` through Supabase using [`/Users/drspray/Desktop/indipoll/src/lib/stations.js`](./src/lib/stations.js).
- If Supabase is unavailable, it falls back to [`/Users/drspray/Desktop/indipoll/api/live-bundle.js`](./api/live-bundle.js).

### 3. Forecast inference

- [`/Users/drspray/Desktop/indipoll/api/forecast.js`](./api/forecast.js) resolves the requested station from Supabase when possible.
- It loads the latest observation history for that station and passes it into [`/Users/drspray/Desktop/indipoll/src/lib/model-service.js`](./src/lib/model-service.js).
- The forecast API prefers the active promoted model artifact from Supabase.
- The model service falls back to the local serialized artifact in [`/Users/drspray/Desktop/indipoll/src/data/ml-model-artifact.generated.js`](./src/data/ml-model-artifact.generated.js) if no active model is available.

## ML pipeline

### Training source

The trainer now prefers real historical observations from `public.station_observations`.

- If enough real history exists, training uses Supabase history only.
- If the history window is still too small, training uses a hybrid dataset:
  real observations + seeded synthetic augmentation.

This makes the project usable immediately while naturally improving as the cron job accumulates more hourly observations.

### Promotion and backtesting

- Retraining is batch-only and never runs continuously inside the serving process.
- Each candidate model is backtested against:
  - persistence baseline
  - rolling-mean baseline
- Promotion is conservative:
  - a candidate must have enough real evaluation windows
  - a candidate must beat persistence on RMSE
  - otherwise the current active artifact remains active
- Evaluation outputs are stored in `public.model_artifacts` and `public.model_evaluations`.

### Training script

Run:

```bash
npm run train:model
```

Manual refresh:

```bash
npm run refresh:stations
```

The script:

- loads Supabase history from `station_observations`
- builds multivariate sequences with a 24-step lookback and 12-step horizon
- fits an LSTM using TensorFlow.js
- backtests the candidate on real observation windows when enough history exists
- writes the local inference artifact to [`/Users/drspray/Desktop/indipoll/src/data/ml-model-artifact.generated.js`](./src/data/ml-model-artifact.generated.js)
- stores model lineage in `public.model_artifacts`
- promotes the candidate only if it beats the persistence baseline with enough real windows

Key files:

- [`/Users/drspray/Desktop/indipoll/scripts/train-lstm.mjs`](./scripts/train-lstm.mjs)
- [`/Users/drspray/Desktop/indipoll/src/lib/ml-sequence.js`](./src/lib/ml-sequence.js)
- [`/Users/drspray/Desktop/indipoll/src/lib/model-service.js`](./src/lib/model-service.js)

## Database schema

Core tables:

- `public.stations`: canonical station metadata
- `public.station_snapshots`: latest station state, forecast, SHAP output, model metadata
- `public.station_observations`: append-only hourly historical feature rows used for training and context
- `public.model_artifacts`: trained model registry and lineage metadata
- `public.model_evaluations`: stored horizon-level and station-level backtest outputs
- `public.community_reports`: citizen-submitted pollution events

Important view:

- `public.station_dashboard`: read-friendly dashboard view consumed by the frontend

Relevant migrations:

- [`/Users/drspray/Desktop/indipoll/supabase/migrations/20260327_indipoll_backend_upgrade.sql`](./supabase/migrations/20260327_indipoll_backend_upgrade.sql)
- [`/Users/drspray/Desktop/indipoll/supabase/migrations/20260327_indipoll_historical_training.sql`](./supabase/migrations/20260327_indipoll_historical_training.sql)
- [`/Users/drspray/Desktop/indipoll/supabase/migrations/20260330_indipoll_model_registry_upgrade.sql`](./supabase/migrations/20260330_indipoll_model_registry_upgrade.sql)

## Environment variables

Required for production-quality data:

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

Build for production:

```bash
npm run build
```

## Deployment

The app is configured for Vercel.

- Frontend and serverless routes deploy together.
- A protected refresh route is used by cron to persist fresh station observations every hour.
- A protected retrain route is used by cron to evaluate and potentially promote a new model every 6 hours.
- Vercel cron calls both `/api/refresh-stations` and `/api/retrain-model` using the shared bearer secret.

Deploy manually:

```bash
npx vercel deploy --prod --yes
```

## Operational notes

- Ingestion cadence is hourly.
- Inference refreshes whenever new observation context is written or a forecast request is made.
- Retraining cadence is scheduled and batch-based; model weights do not update continuously while the backend runs.
- Forecast quality improves over time as `station_observations` grows.
- Early in the history collection lifecycle, the trainer uses hybrid augmentation intentionally.
- The frontend map is real geographic plotting, not a schematic SVG.
- Explainability is presented as plain-language narratives derived from exact Shapley attribution over the latest feature context used for inference.
