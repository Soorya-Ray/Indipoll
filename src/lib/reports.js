import { getSupabaseClient } from "./supabase";
import { loadReports, saveReports } from "./storage";

const COMMUNITY_REPORTS_TABLE = "community_reports";

function mapDatabaseReport(row) {
  return {
    id: row.id,
    name: row.reporter_name,
    city: row.city,
    category: row.category,
    severity: row.severity,
    description: row.description,
    latitude: row.latitude,
    longitude: row.longitude,
    nearestStationSlug: row.nearest_station_slug,
    source: row.source || "citizen",
    status: row.status || "submitted",
    createdAt: new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    }).format(new Date(row.created_at)),
  };
}

export async function fetchCommunityReports(seedReports) {
  const supabase = await getSupabaseClient();
  if (!supabase) {
    return loadReports(seedReports);
  }

  const { data, error } = await supabase
    .from(COMMUNITY_REPORTS_TABLE)
    .select("id, reporter_name, city, category, severity, description, created_at, latitude, longitude, nearest_station_slug, source, status")
    .order("created_at", { ascending: true });

  if (error) {
    return loadReports(seedReports);
  }

  const reports = data.length ? data.map(mapDatabaseReport) : [...seedReports];
  saveReports(reports);
  return reports;
}

export async function createCommunityReport(report) {
  const supabase = await getSupabaseClient();
  if (!supabase) {
    return report;
  }

  const { data, error } = await supabase
    .from(COMMUNITY_REPORTS_TABLE)
    .insert({
      reporter_name: report.name,
      city: report.city,
      category: report.category,
      severity: report.severity,
      description: report.description,
      latitude: report.latitude ?? null,
      longitude: report.longitude ?? null,
      nearest_station_slug: report.nearestStationSlug ?? null,
      source: report.source ?? "citizen",
      status: report.status ?? "submitted",
    })
    .select("id, reporter_name, city, category, severity, description, created_at, latitude, longitude, nearest_station_slug, source, status")
    .single();

  if (error) {
    throw error;
  }

  return mapDatabaseReport(data);
}

export async function subscribeToCommunityReports(onInsert) {
  const supabase = await getSupabaseClient();
  if (!supabase) {
    return () => {};
  }

  const channel = supabase
    .channel("community-reports-feed")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: COMMUNITY_REPORTS_TABLE },
      (payload) => {
        if (payload.new) {
          onInsert(mapDatabaseReport(payload.new));
        }
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
