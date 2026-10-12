import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client for server-side writes (API routes only — never imported
 * into client components). Returns null when env is not configured, so the app
 * still runs in demo mode.
 */
export function serverSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function ingestBaseUrl(): string {
  return process.env.RELAY_PUBLIC_URL ?? "https://your-relay.vercel.app";
}
