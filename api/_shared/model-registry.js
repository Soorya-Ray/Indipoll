import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export function getAdminSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function loadActiveModelArtifact() {
  const supabase = getAdminSupabaseClient();
  if (!supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("model_artifacts")
      .select("artifact")
      .eq("is_active", true)
      .order("trained_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(JSON.stringify({ event: "model_artifact_load_failed", error: error.message }));
      return null;
    }

    return data?.artifact || null;
  } catch (err) {
    console.error(JSON.stringify({ event: "model_artifact_load_failed", error: String(err) }));
    return null;
  }
}
