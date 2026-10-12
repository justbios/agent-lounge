import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client for reading events + subscribing to realtime.
 * Returns null until the two public env vars are set, so the app still runs
 * in pure replay-demo mode with no backend.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null = url && anon ? createClient(url, anon) : null;
