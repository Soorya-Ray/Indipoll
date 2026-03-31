import { getAdminSupabaseClient } from "./_shared/model-registry.js";

export default async function handler(_request, response) {
  const supabase = getAdminSupabaseClient();
  if (!supabase) {
    return response.status(200).json({
      status: "degraded",
      reason: "No Supabase connection",
      checkedAt: new Date().toISOString(),
    });
  }

  try {
    const [snapshots, observations, stations, model] = await Promise.all([
      supabase
        .from("station_snapshots")
        .select("updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("station_observations")
        .select("observed_at", { count: "exact", head: true }),
      supabase
        .from("stations")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("model_artifacts")
        .select("version, trained_at, is_active")
        .eq("is_active", true)
        .order("trained_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const queryError =
      snapshots.error || observations.error || stations.error || model.error;

    if (queryError) {
      throw queryError;
    }

    const lastSnapshotAt = snapshots.data?.updated_at || null;
    const observationCount = observations.count ?? 0;
    const stationCount = stations.count ?? 0;
    const activeModel = model.data
      ? { version: model.data.version, trainedAt: model.data.trained_at }
      : null;

    const ageMs = lastSnapshotAt ? Date.now() - new Date(lastSnapshotAt).getTime() : null;
    const stale = ageMs !== null && ageMs > 2 * 60 * 60 * 1000;

    response.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    return response.status(200).json({
      status: stale ? "stale" : "healthy",
      checkedAt: new Date().toISOString(),
      lastSnapshotAt,
      snapshotAgeMinutes: ageMs !== null ? Math.round(ageMs / 60000) : null,
      observationCount,
      stationCount,
      activeModel,
    });
  } catch (error) {
    return response.status(200).json({
      status: "error",
      checkedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Health check failed",
    });
  }
}
