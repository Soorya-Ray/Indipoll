import { buildForecastSeries, buildShapNarratives } from "./forecast";
import { fetchStationDashboard } from "./stations";

const FORECAST_API_URL = import.meta.env.VITE_FORECAST_API_URL || "/api/forecast";
const LIVE_BUNDLE_URL = import.meta.env.VITE_LIVE_BUNDLE_URL || "/api/live-bundle";

async function fetchForecast(station) {
  if (!FORECAST_API_URL) {
    return {
      forecast: buildForecastSeries(station.aqi, station.city),
      shap: buildShapNarratives(station),
      mode: "synthetic",
    };
  }

  const response = await fetch(FORECAST_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      city: station.city,
      lat: station.lat,
      lon: station.lon,
      aqi: station.aqi,
      pollutants: station.pollutants,
      weather: station.weather,
      sources: station.sources,
    }),
  });

  if (!response.ok) {
    throw new Error(`Forecast request failed for ${station.city}`);
  }

  const payload = await response.json();
  return {
    forecast: payload.forecast || buildForecastSeries(station.aqi, station.city),
    shap: payload.shap || buildShapNarratives(station),
    model: payload.model,
    mode: payload.mode || "live",
  };
}

async function buildSeedStationSnapshot(seedStation) {
  const station = { ...seedStation };
  const forecastPayload = await fetchForecast(station).catch(() => ({
    forecast: buildForecastSeries(station.aqi, station.city),
    shap: buildShapNarratives(station),
    model: null,
    mode: "synthetic",
  }));

  station.forecast = forecastPayload.forecast;
  station.shap = forecastPayload.shap;
  station.model = forecastPayload.model;
  station.dataMode = station.dataMode || "seed";
  station.forecastMode = forecastPayload.mode;

  return station;
}

export async function fetchStationsBundle(seedStations) {
  const dashboardRows = await fetchStationDashboard(seedStations);
  if (dashboardRows?.length) {
    console.info("[indipoll] Loaded stations from Supabase dashboard view");
    return { stations: dashboardRows, source: "supabase" };
  }

  try {
    const response = await fetch(LIVE_BUNDLE_URL, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Live bundle request failed with ${response.status}`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload.stations) || payload.stations.length === 0) {
      throw new Error("Live bundle did not return stations");
    }

    console.info("[indipoll] Loaded stations from live-bundle API");
    return {
      stations: payload.stations.map((station) => {
        const fallback = seedStations.find((item) => item.id === station.id || item.city === station.city);
        return {
          ...fallback,
          ...station,
          weather: station.weather || fallback?.weather,
          forecast: station.forecast || fallback?.forecast || buildForecastSeries(station.aqi || fallback?.aqi || 100, station.city),
          shap: station.shap || fallback?.shap || buildShapNarratives(station),
          model: station.model || fallback?.model,
          rawUpdatedAt: station.rawUpdatedAt || station.updated_at || fallback?.rawUpdatedAt || null,
        };
      }),
      source: "live-bundle",
    };
  } catch (err) {
    console.warn("[indipoll] Live sources unavailable, falling back to seed data:", err.message || err);
    const stations = await Promise.all(seedStations.map((station) => buildSeedStationSnapshot(station)));
    return { stations, source: "seed" };
  }
}
