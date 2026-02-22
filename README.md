# IndiPoll

Real-time pollution monitoring and AI-driven AQI forecasting platform for Indian regions. Combines environmental sensor data, climate metrics, and a Random Forest prediction engine into a single interactive dashboard.

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript, Tailwind CSS 4, Recharts, Motion |
| **Backend** | Express, better-sqlite3 |
| **ML Pipeline** | scikit-learn, SHAP, pandas (Python) |
| **Data Ingestion** | OpenAQ REST API (Python) |
| **Build Tooling** | Vite 6, tsx |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  React SPA (App.tsx)                                │
│  Dashboard · Schema · Ingestion · Prediction · API  │
└──────────────────────┬──────────────────────────────┘
                       │ fetch /api/*
┌──────────────────────▼──────────────────────────────┐
│  Express Server (server.ts)                         │
│  GET /api/regions · GET /api/metrics/:id             │
│  GET /api/explain/:id                               │
└──────────────────────┬──────────────────────────────┘
                       │ better-sqlite3
┌──────────────────────▼──────────────────────────────┐
│  SQLite (indipoll.db)                               │
│  regions · pollution_metrics · climate_metrics       │
│  predictions · model_explanations · data_sources     │
│  raw_ingest · pollution_sources                      │
└─────────────────────────────────────────────────────┘

Python scripts (offline):
  openaq_ingest.py   → raw_ingest
  transform_ingest.py → pollution_metrics / climate_metrics
  ml_train.py        → predictions / model_explanations
```

## Run Locally

**Prerequisites:** Node.js ≥ 18, npm

```bash
# Install dependencies
npm install

# Start dev server (Express + Vite HMR on port 3000)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Other Scripts

| Command | Description |
|---|---|
| `npm run build` | Production Vite build → `dist/` |
| `npm start` | Serve production build |
| `npm run lint` | Type-check with `tsc --noEmit` |
| `npm run clean` | Remove `dist/` |

## Deployment

1. Build the frontend:
   ```bash
   npm run build
   ```
2. Start in production mode:
   ```bash
   npm start
   ```
   This runs `NODE_ENV=production tsx server.ts`, which serves the static `dist/` build and exposes the API on port 3000.

3. The SQLite database (`indipoll.db`) is auto-created and seeded on first startup — no external database setup required.

> **Note:** For production ML workflows, the Python scripts (`ml_train.py`, `openaq_ingest.py`, `transform_ingest.py`) require a PostgreSQL database configured via the `DATABASE_URL` environment variable.
