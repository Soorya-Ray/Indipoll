import { generateForecastPayload } from "../src/lib/model-service.js";
import { seedStations } from "../src/data/cities.js";
import { LOOKBACK_STEPS } from "../src/lib/ml-sequence.js";
import { getAdminSupabaseClient, loadActiveModelArtifact } from "./_shared/model-registry.js";

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
    });

    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });

    request.on("error", reject);
  });
}

function normalizeDashboardRow(row, fallback) {
  return {
    ...fallback,
    id: row.slug || fallback?.id,
    city: row.city || fallback?.city,
    station: row.station_name || fallback?.station,
    lat: row.latitude ?? fallback?.lat,
    lon: row.longitude ?? fallback?.lon,
    x: row.map_x ?? fallback?.x,
    y: row.map_y ?? fallback?.y,
    aqi: row.aqi ?? fallback?.aqi,
    pollutants: row.pollutants || fallback?.pollutants || {},
    sources: row.sources || fallback?.sources || {},
    weather: row.weather || fallback?.weather || {},
  };
}

async function hydrateStation(requestBody) {
  const stationSlug = requestBody.stationSlug || requestBody.id;
  const fallback = seedStations.find((candidate) => candidate.id === stationSlug) || requestBody;
  const supabase = getAdminSupabaseClient();

  if (!supabase || !stationSlug) {
    return { station: { ...fallback, ...requestBody }, historyRows: [], artifact: null };
  }

  const { data: dashboardRow, error: dashboardError } = await supabase
    .from("station_dashboard")
    .select("slug, city, station_name, latitude, longitude, map_x, map_y, aqi, pollutants, sources, weather")
    .eq("slug", stationSlug)
    .maybeSingle();

  if (dashboardError) {
    throw dashboardError;
  }

  const station = dashboardRow ? normalizeDashboardRow(dashboardRow, fallback) : { ...fallback, ...requestBody };

  const { data: stationRow, error: stationError } = await supabase.from("stations").select("id").eq("slug", stationSlug).maybeSingle();
  if (stationError) {
    throw stationError;
  }

  if (!stationRow?.id) {
    return { station, historyRows: [], artifact: await loadActiveModelArtifact() };
  }

  const { data: historyRows, error: historyError } = await supabase
    .from("station_observations")
    .select("observed_at, aqi, pollutants, sources, weather, features")
    .eq("station_id", stationRow.id)
    .order("observed_at", { ascending: false })
    .limit(LOOKBACK_STEPS);

  if (historyError) {
    throw historyError;
  }

  const artifact = await loadActiveModelArtifact();

  return {
    station,
    historyRows: (historyRows || []).reverse(),
    artifact,
  };
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    const requestBody = await readBody(request);
    const { station, historyRows, artifact } = await hydrateStation(requestBody);
    const payload = generateForecastPayload(station, { historyRows, artifact });
    console.log(
      JSON.stringify({
        event: "forecast_generated",
        station: station.id || station.city,
        modelVersion: payload.model.version,
        historySamples: payload.model.historySamples,
        qualityState: payload.model.evaluation?.station ? "station-backed" : payload.model.evaluation ? "global-backed" : "limited-evidence",
      }),
    );
    return response.status(200).json(payload);
  } catch (error) {
    return response.status(400).json({
      error: error instanceof Error ? error.message : "Invalid forecast request",
    });
  }
}
