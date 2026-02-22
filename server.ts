import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

/** SQLite database — auto-created on first run in the project root. */
const db = new Database("indipoll.db");

// ---------------------------------------------------------------------------
// 1. DATABASE SCHEMA — Create all tables if they don't already exist.
//    Uses SQLite-compatible types (TEXT, REAL, INTEGER, DATETIME).
// ---------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS regions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    country TEXT NOT NULL,
    timezone TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pollution_metrics (
    id TEXT PRIMARY KEY,
    region_id TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    pm25 REAL,
    pm10 REAL,
    no2 REAL,
    so2 REAL,
    co REAL,
    o3 REAL,
    aqi INTEGER,
    FOREIGN KEY (region_id) REFERENCES regions(id)
  );

  CREATE TABLE IF NOT EXISTS climate_metrics (
    id TEXT PRIMARY KEY,
    region_id TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    temperature REAL,
    humidity REAL,
    wind_speed REAL,
    wind_direction REAL,
    precipitation REAL,
    pressure REAL,
    FOREIGN KEY (region_id) REFERENCES regions(id)
  );

  CREATE TABLE IF NOT EXISTS pollution_sources (
    id TEXT PRIMARY KEY,
    region_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT CHECK(type IN ('Industrial', 'Traffic', 'Agricultural', 'Natural')),
    emission_rate REAL,
    status TEXT CHECK(status IN ('Active', 'Inactive')),
    FOREIGN KEY (region_id) REFERENCES regions(id)
  );

  CREATE TABLE IF NOT EXISTS predictions (
    id TEXT PRIMARY KEY,
    region_id TEXT NOT NULL,
    prediction_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    target_timestamp DATETIME NOT NULL,
    predicted_aqi INTEGER,
    confidence_score REAL,
    model_version TEXT,
    FOREIGN KEY (region_id) REFERENCES regions(id)
  );

  CREATE TABLE IF NOT EXISTS data_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    base_url TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS raw_ingest (
    id TEXT PRIMARY KEY,
    source_id TEXT,
    source_url TEXT NOT NULL,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    raw_payload TEXT NOT NULL,
    format TEXT NOT NULL,
    processed INTEGER DEFAULT 0,
    FOREIGN KEY (source_id) REFERENCES data_sources(id)
  );

  CREATE TABLE IF NOT EXISTS model_explanations (
    id TEXT PRIMARY KEY,
    prediction_id TEXT REFERENCES predictions(id),
    feature_name TEXT,
    feature_value REAL,
    contribution REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ---------------------------------------------------------------------------
// 2. SEED DATA — Ensure every region has pollution, climate, and prediction rows.
//    Data is only inserted when a region has no existing rows for a metric type.
// ---------------------------------------------------------------------------

const seedRegions = [
  { id: "reg-001", name: "New Delhi", latitude: 28.6139, longitude: 77.2090, country: "India", timezone: "IST" },
  { id: "reg-002", name: "Mumbai", latitude: 19.0760, longitude: 72.8777, country: "India", timezone: "IST" },
  { id: "reg-003", name: "Bangalore", latitude: 12.9716, longitude: 77.5946, country: "India", timezone: "IST" },
] as const;

// Typical baseline values per region — used to generate 10 hourly data-points each.
const pollutionBaselinesByRegion: Record<string, { pm25: number; pm10: number; no2: number; so2: number; co: number; o3: number; aqi: number }> = {
  "reg-001": { pm25: 168, pm10: 286, no2: 42, so2: 15, co: 1.2, o3: 57, aqi: 332 },
  "reg-002": { pm25: 62, pm10: 105, no2: 31, so2: 9, co: 0.8, o3: 42, aqi: 121 },
  "reg-003": { pm25: 38, pm10: 72, no2: 25, so2: 6, co: 0.6, o3: 36, aqi: 79 },
};

const climateBaselinesByRegion: Record<string, { temperature: number; humidity: number; wind_speed: number; wind_direction: number; precipitation: number; pressure: number }> = {
  "reg-001": { temperature: 31.8, humidity: 40, wind_speed: 8.4, wind_direction: 285, precipitation: 0.0, pressure: 1002.4 },
  "reg-002": { temperature: 29.2, humidity: 71, wind_speed: 13.1, wind_direction: 246, precipitation: 0.4, pressure: 1008.1 },
  "reg-003": { temperature: 24.6, humidity: 63, wind_speed: 10.2, wind_direction: 218, precipitation: 1.2, pressure: 1010.3 },
};

const predictionBaselinesByRegion: Record<string, { aqi: number; confidence: number }> = {
  "reg-001": { aqi: 318, confidence: 0.87 },
  "reg-002": { aqi: 128, confidence: 0.84 },
  "reg-003": { aqi: 82, confidence: 0.86 },
};

/**
 * Apply deterministic sinusoidal variation around a baseline value.
 * Produces realistic-looking time-series data without randomness.
 *
 * @param base      Centre value to oscillate around
 * @param stepIndex Current time-step index (0 … N)
 * @param amplitude Maximum deviation from the base
 */
const applyVariation = (base: number, stepIndex: number, amplitude: number) =>
  Math.round((base + Math.sin(stepIndex * 0.9) * amplitude + Math.cos(stepIndex * 0.5) * amplitude * 0.4) * 100) / 100;

// Prepared statements for idempotent seed inserts (INSERT OR IGNORE).
const insertRegionStmt = db.prepare("INSERT OR IGNORE INTO regions (id, name, latitude, longitude, country, timezone) VALUES (?, ?, ?, ?, ?, ?)");
const hasPollutionForRegion = db.prepare("SELECT 1 FROM pollution_metrics WHERE region_id = ? LIMIT 1");
const hasClimateForRegion = db.prepare("SELECT 1 FROM climate_metrics WHERE region_id = ? LIMIT 1");
const hasPredictionForRegion = db.prepare("SELECT 1 FROM predictions WHERE region_id = ? LIMIT 1");
const insertPollutionStmt = db.prepare(
  "INSERT OR IGNORE INTO pollution_metrics (id, region_id, timestamp, pm25, pm10, no2, so2, co, o3, aqi) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
);
const insertClimateStmt = db.prepare(
  "INSERT OR IGNORE INTO climate_metrics (id, region_id, timestamp, temperature, humidity, wind_speed, wind_direction, precipitation, pressure) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
);
const insertPredictionStmt = db.prepare(
  "INSERT OR IGNORE INTO predictions (id, region_id, target_timestamp, predicted_aqi, confidence_score, model_version) VALUES (?, ?, ?, ?, ?, ?)"
);

const ONE_HOUR_MS = 60 * 60 * 1000;
const seedTimestamp = Date.now();

for (const region of seedRegions) {
  insertRegionStmt.run(region.id, region.name, region.latitude, region.longitude, region.country, region.timezone);

  // Seed 10 hourly pollution snapshots (most-recent-first when queried).
  if (!hasPollutionForRegion.get(region.id)) {
    const pollBase = pollutionBaselinesByRegion[region.id];
    for (let hour = 0; hour < 10; hour++) {
      const timestamp = new Date(seedTimestamp - (9 - hour) * ONE_HOUR_MS).toISOString();
      insertPollutionStmt.run(
        `pol-${region.id}-${hour}`, region.id, timestamp,
        applyVariation(pollBase.pm25, hour, 12), applyVariation(pollBase.pm10, hour, 18),
        applyVariation(pollBase.no2, hour, 5), applyVariation(pollBase.so2, hour, 2),
        applyVariation(pollBase.co, hour, 0.15), applyVariation(pollBase.o3, hour, 6),
        Math.round(applyVariation(pollBase.aqi, hour, 20))
      );
    }
  }

  // Seed 10 hourly climate snapshots (same timestamps as pollution).
  if (!hasClimateForRegion.get(region.id)) {
    const climBase = climateBaselinesByRegion[region.id];
    for (let hour = 0; hour < 10; hour++) {
      const timestamp = new Date(seedTimestamp - (9 - hour) * ONE_HOUR_MS).toISOString();
      insertClimateStmt.run(
        `cli-${region.id}-${hour}`, region.id, timestamp,
        applyVariation(climBase.temperature, hour, 1.5), applyVariation(climBase.humidity, hour, 4),
        applyVariation(climBase.wind_speed, hour, 2), Math.round(applyVariation(climBase.wind_direction, hour, 15)),
        Math.max(0, applyVariation(climBase.precipitation, hour, 0.3)), applyVariation(climBase.pressure, hour, 1.5)
      );
    }
  }

  // Seed 3 forward-looking AQI predictions (+24 h, +48 h, +72 h).
  if (!hasPredictionForRegion.get(region.id)) {
    const predBase = predictionBaselinesByRegion[region.id];
    for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
      const targetTimestamp = new Date(seedTimestamp + (dayOffset + 1) * 24 * ONE_HOUR_MS).toISOString();
      insertPredictionStmt.run(
        `pre-${region.id}-${dayOffset}`, region.id, targetTimestamp,
        Math.round(applyVariation(predBase.aqi, dayOffset, 15)),
        Math.round(applyVariation(predBase.confidence, dayOffset, 0.03) * 100) / 100,
        "rf-v1.0"
      );
    }
  }
}

app.use(express.json());

// ---------------------------------------------------------------------------
// 3. API ROUTES — JSON endpoints consumed by the React frontend.
// ---------------------------------------------------------------------------
/** GET /api/regions — List all monitored regions. */
app.get("/api/regions", (_req, res) => {
  try {
    const allRegions = db.prepare("SELECT * FROM regions").all();
    res.json(allRegions);
  } catch (err) {
    console.error("GET /api/regions error:", err);
    res.status(500).json({ error: "Failed to load regions" });
  }
});

/** GET /api/metrics/:regionId — Fetch the 10 most recent pollution/climate rows and up to 5 predictions. */
app.get("/api/metrics/:regionId", (req, res) => {
  try {
    const { regionId } = req.params;
    const pollution = db.prepare("SELECT * FROM pollution_metrics WHERE region_id = ? ORDER BY timestamp DESC LIMIT 10").all(regionId);
    const climate = db.prepare("SELECT * FROM climate_metrics WHERE region_id = ? ORDER BY timestamp DESC LIMIT 10").all(regionId);
    const predictions = db.prepare("SELECT * FROM predictions WHERE region_id = ? ORDER BY target_timestamp ASC LIMIT 5").all(regionId);
    res.json({ pollution, climate, predictions });
  } catch (err) {
    console.error(`GET /api/metrics/${req.params.regionId} error:`, err);
    res.status(500).json({ error: "Failed to load metrics" });
  }
});

/** GET /api/explain/:predictionId — Return SHAP-based feature contributions for a prediction. */
app.get("/api/explain/:predictionId", (req, res) => {
  try {
    const { predictionId } = req.params;

    // Fetch feature contributions ordered by absolute impact.
    const contributions = db
      .prepare(
        "SELECT feature_name, feature_value, contribution FROM model_explanations WHERE prediction_id = ? ORDER BY ABS(contribution) DESC"
      )
      .all(predictionId);

    if (!contributions.length) {
      return res.status(404).json({ error: "No explanations found for prediction_id" });
    }

    // Build a short human-readable summary of the most influential features.
    const topPositiveContributor = contributions.find((r: any) => r.contribution > 0);
    const topNegativeContributor = contributions.find((r: any) => r.contribution < 0);
    const topDriverLabels = contributions.slice(0, 5).map(
      (r: any) => `${r.feature_name} (${r.contribution >= 0 ? "+" : ""}${r.contribution.toFixed(3)})`
    );

    const summaryParts = [
      topDriverLabels.length ? `Top drivers: ${topDriverLabels.join(", ")}.` : null,
      topPositiveContributor ? `Largest positive: ${topPositiveContributor.feature_name}.` : null,
      topNegativeContributor ? `Largest negative: ${topNegativeContributor.feature_name}.` : null,
    ].filter(Boolean);

    res.json({
      prediction_id: predictionId,
      contributions,
      summary: summaryParts.join(" "),
    });
  } catch (err) {
    console.error(`GET /api/explain/${req.params.predictionId} error:`, err);
    res.status(500).json({ error: "Failed to load explanations" });
  }
});

// ---------------------------------------------------------------------------
// 4. SERVER STARTUP — Dev mode embeds Vite as middleware; production serves
//    the pre-built dist/ folder and falls back to index.html for SPA routing.
// ---------------------------------------------------------------------------

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Development: Vite handles HMR and module transforms via middleware.
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production: serve the static Vite build output.
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const distPath = path.join(__dirname, "dist");

    app.use(express.static(distPath));

    // SPA catch-all — return index.html for all non-API GET requests.
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api/")) {
        return res.status(404).json({ error: "Not found" });
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
