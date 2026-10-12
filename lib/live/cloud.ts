import { LiveEvent } from "./types";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function cloudEnabled(): boolean {
  return Boolean(URL_ && KEY);
}

/** Writes through the relay_ingest RPC, which files the events under sha256(key) and broadcasts them to that room. */
export async function cloudIngest(roomKey: string, events: LiveEvent[]): Promise<boolean> {
  const p_events = events.map((e) => ({ ...e, seq: undefined }));
  const r = await fetch(`${URL_}/rest/v1/rpc/relay_ingest`, {
    method: "POST",
    headers: { apikey: KEY!, "content-type": "application/json" },
    body: JSON.stringify({ p_key: roomKey, p_events }),
    signal: AbortSignal.timeout(4000),
  }).catch(() => null);
  return Boolean(r?.ok);
}
