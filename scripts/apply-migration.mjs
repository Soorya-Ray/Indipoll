/**
 * Applies pending SQL migrations to the Supabase database.
 * Usage: node scripts/apply-migration.mjs [migration-file]
 *
 * If no migration file is specified, applies:
 *   supabase/migrations/20260330_indipoll_model_registry_upgrade.sql
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

async function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  let text = "";
  try {
    text = await fs.readFile(envPath, "utf8");
  } catch {
    return;
  }
  text.split(/\r?\n/).forEach((line) => {
    if (!line || line.trim().startsWith("#")) return;
    const sep = line.indexOf("=");
    if (sep === -1) return;
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) process.env[key] = value;
  });
}

async function main() {
  await loadLocalEnv();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
    process.exitCode = 1;
    return;
  }

  const migrationFile = process.argv[2] || "supabase/migrations/20260330_indipoll_model_registry_upgrade.sql";
  const migrationPath = path.resolve(process.cwd(), migrationFile);

  let sql;
  try {
    sql = await fs.readFile(migrationPath, "utf8");
  } catch (err) {
    console.error(`Could not read migration file: ${migrationPath}`);
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  console.log(`Applying migration: ${migrationFile}`);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "public" },
  });

  // Split on semicolons to execute each statement individually
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    console.log(`  Running: ${statement.slice(0, 80)}...`);
    const { error } = await supabase.rpc("exec_sql", { sql: statement + ";" }).catch(() => ({ error: { message: "RPC not available" } }));

    if (error) {
      // If exec_sql RPC isn't available, we can't apply via REST API
      console.error("\nCannot apply migration via Supabase REST API.");
      console.error("Please run the following SQL in your Supabase Dashboard → SQL Editor:\n");
      console.log(sql);
      console.error("\nDashboard URL: https://supabase.com/dashboard/project/hgnahazdcptjgdjicffb/sql/new");
      process.exitCode = 1;
      return;
    }
  }

  console.log("Migration applied successfully!");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
