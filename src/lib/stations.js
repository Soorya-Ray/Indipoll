import { getSupabaseClient } from "./supabase";

function normalizeStationRow(row, fallback) {
  return {
    ...fallback,
    id: row.slug || fallback?.id,
    city: row.city,
    station: row.station_name,
    lat: row.latitude,
    lon: row.longitude,
    x: Number(row.map_x),
    y: Number(row.map_y),
    aqi: row.aqi ?? fallback?.aqi ?? 0,
    pollutants: row.pollutants || fallback?.pollutants || {},
    sources: row.sources || fallback?.sources || {},
    weather: row.weather || fallback?.weather || {},
    forecast: row.forecast || fallback?.forecast,
    shap: row.shap || fallback?.shap,
    model: row.model_metadata || fallback?.model,
    updatedAt: row.updated_at
      ? new Intl.DateTimeFormat("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Asia/Kolkata",
        }).format(new Date(row.updated_at))
      : fallback?.updatedAt,
    dataMode: row.data_mode || fallback?.dataMode || "demo",
    forecastMode: row.forecast_mode || fallback?.forecastMode || "synthetic",
  };
}

export async function fetchStationDashboard(seedStations) {
  const supabase = await getSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("station_dashboard")
    .select(
      "slug, city, station_name, latitude, longitude, map_x, map_y, priority, aqi, pollutants, sources, weather, forecast, shap, model_metadata, data_mode, forecast_mode, updated_at",
    )
    .order("priority", { ascending: true });

  if (error || !data?.length) {
    return null;
  }

  return data.map((row) => {
    const fallback = seedStations.find((station) => station.id === row.slug || station.city === row.city);
    return normalizeStationRow(row, fallback);
  });
}
