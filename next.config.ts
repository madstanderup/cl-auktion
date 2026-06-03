import type { NextConfig } from "next";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

/**
 * Læser én nøgle fra .env.local uden at påvirke andre loaders.
 * Bruges fordi Next (og Turbopack) ikke overskriver env-vars, der allerede
 * ligger i process.env — fx fra Windows-brugervariabler med
 * NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
 */
function getEnvLocalValue(key: string): string | undefined {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return undefined;

  let raw = readFileSync(envPath, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    if (k !== key) continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    return val;
  }

  return undefined;
}

const supabaseUrl =
  getEnvLocalValue("NEXT_PUBLIC_SUPABASE_URL") ??
  process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  getEnvLocalValue("NEXT_PUBLIC_SUPABASE_ANON_KEY") ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const nextConfig: NextConfig = {
  env: {
    ...(supabaseUrl && { NEXT_PUBLIC_SUPABASE_URL: supabaseUrl }),
    ...(supabaseAnonKey && { NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey }),
  },
};

export default nextConfig;
