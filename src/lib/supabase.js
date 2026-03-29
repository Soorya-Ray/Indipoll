const defaultSupabaseUrl = "https://hgnahazdcptjgdjicffb.supabase.co";
const defaultSupabasePublishableKey = "sb_publishable_sl1uvEbOAV5Eb8453O6PJw_oiNoC_t7";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || defaultSupabaseUrl;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || defaultSupabasePublishableKey;

let clientPromise;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabasePublishableKey);

export async function getSupabaseClient() {
  if (!hasSupabaseConfig) {
    return null;
  }

  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(supabaseUrl, supabasePublishableKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }),
    );
  }

  return clientPromise;
}
