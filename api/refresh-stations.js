import { buildServerStationSnapshot } from "./_shared/live-data.js";
import { seedStations } from "../src/data/cities.js";
import { generateForecastPayload } from "../src/lib/model-service.js";
import { stationToFeatureVector, LOOKBACK_STEPS } from "../src/lib/ml-sequence.js";
import { getAdminSupabaseClient, loadActiveModelArtifact } from "./_shared/model-registry.js";

const CRON_SECRET = process.env.CRON_SECRET || "";

function isAuthorized(request) {
  const header = request.headers.authorization || request.headers.Authorization || "";
  return CRON_SECRET && header === `Bearer ${CRON_SECRET}`;
}

function roundObservationTimestamp(date = new Date()) {
  const rounded = new Date(date);
  rounded.setUTCMinutes(0, 0, 0);
  return rounded.toISOString();
}

export default async function handler(request, response) {
  if (!["GET", "POST"].includes(request.method || "GET")) {
    response.setHeader("Allow", "GET, POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  if (!isAuthorized(request)) {
    return response.status(401).json({ error: "Unauthorized" });
  }

  const supabase = getAdminSupabaseClient();
  if (!supabase) {
    return response.status(500).json({
      error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    });
  }

  try {
    const activeArtifact = await loadActiveModelArtifact();
    const snapshots = await Promise.all(seedStations.map((station) => buildServerStationSnapshot(station)));
    console.log(
      JSON.stringify({
        event: "station_refresh_started",
        stationCount: snapshots.length,
        modelVersion: activeArtifact?.version || null,
      }),
    );

    const stationRows = snapshots.map((station, index) => ({
      slug: station.id,
      city: station.city,
      station_name: station.station,
      latitude: station.lat,
      longitude: station.lon,
      map_x: station.x,
      map_y: station.y,
      priority: index + 1,
      enabled: true,
      region: "India",
    }));

    const { error: stationsError } = await supabase.from("stations").upsert(stationRows, {
      onConflict: "slug",
    });

    if (stationsError) {
      throw stationsError;
    }

    const { data: stationIds, error: stationFetchError } = await supabase.from("stations").select("id, slug");
    if (stationFetchError) {
      throw stationFetchError;
    }

    const idBySlug = new Map(stationIds.map((row) => [row.slug, row.id]));
    const observedAt = roundObservationTimestamp();
    const observationRows = snapshots.map((station) => ({
      station_id: idBySlug.get(station.id),
      observed_at: observedAt,
      aqi: station.aqi,
      pollutants: station.pollutants,
      sources: station.sources,
      weather: station.weather,
      features: stationToFeatureVector(station),
      data_mode: station.dataMode === "waqi" ? "waqi" : "hybrid",
    }));

    const { error: observationsError } = await supabase.from("station_observations").upsert(observationRows, {
      onConflict: "station_id,observed_at",
    });

    if (observationsError) {
      throw observationsError;
    }

    const observationHistory = await Promise.all(
      snapshots.map(async (station) => {
        const stationId = idBySlug.get(station.id);
        const { data, error } = await supabase
          .from("station_observations")
          .select("observed_at, aqi, pollutants, sources, weather, features")
          .eq("station_id", stationId)
          .order("observed_at", { ascending: false })
          .limit(LOOKBACK_STEPS);

        if (error) {
          throw error;
        }

        return [station.id, (data || []).reverse()];
      }),
    );

    const historyBySlug = new Map(observationHistory);
    const snapshotRows = snapshots.map((station) => {
      const forecastPayload = generateForecastPayload(station, {
        historyRows: historyBySlug.get(station.id) || [],
        artifact: activeArtifact,
      });

      return {
        station_id: idBySlug.get(station.id),
        aqi: station.aqi,
        pollutants: station.pollutants,
        sources: station.sources,
        weather: station.weather,
        forecast: forecastPayload.forecast,
        shap: forecastPayload.shap,
        model_metadata: forecastPayload.model,
        data_mode: station.dataMode === "waqi" ? "waqi" : "hybrid",
        forecast_mode: station.forecastMode === "live" ? "live" : "synthetic",
      };
    });

    const { error: snapshotsError } = await supabase.from("station_snapshots").upsert(snapshotRows, {
      onConflict: "station_id",
    });

    if (snapshotsError) {
      throw snapshotsError;
    }

    return response.status(200).json({
      refreshed: snapshotRows.length,
      observedAt,
      generatedAt: new Date().toISOString(),
      modelVersion: activeArtifact?.version || null,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "station_refresh_failed",
        error: error instanceof Error ? error.message : "Refresh failed",
      }),
    );
    return response.status(500).json({
      error: error instanceof Error ? error.message : "Refresh failed",
    });
  }
}
