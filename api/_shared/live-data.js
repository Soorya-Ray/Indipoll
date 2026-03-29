import { seedStations } from "../../src/data/cities.js";
import { generateForecastPayload } from "../../src/lib/model-service.js";
import { enrichStationFromUpstream } from "./upstream-stations.js";

const FORECAST_API_URL = process.env.FORECAST_API_URL || process.env.VITE_FORECAST_API_URL || "";

async function fetchForecast(station) {
  if (!FORECAST_API_URL) {
    return generateForecastPayload(station);
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

  return response.json();
}

export async function buildServerStationSnapshot(seedStation) {
  const station = await enrichStationFromUpstream(seedStation);
  const forecastPayload = await fetchForecast(station).catch(() => generateForecastPayload(station));

  station.forecast = forecastPayload.forecast;
  station.shap = forecastPayload.shap;
  station.model = forecastPayload.model;
  station.forecastMode = forecastPayload.mode || "live";

  return station;
}

export async function buildStationBundle() {
  return Promise.all(seedStations.map((station) => buildServerStationSnapshot(station)));
}
