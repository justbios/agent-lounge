import { AskBody } from "./asks";
import { LiveEvent } from "./types";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function cloudEnabled(): boolean {
  return Boolean(URL_ && KEY);
}

async function rpc(name: string, args: Record<string, unknown>): Promise<Response | null> {
  return fetch(`${URL_}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: KEY!, "content-type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(4000),
  }).catch(() => null);
}

/**
 * Writes through the relay_ingest RPC, which files the events under sha256(key) and broadcasts them to that room.
 * gone: the key was retired with the shared key or revoked by the café owner, so retrying will not help.
 */
export async function cloudIngest(roomKey: string, events: LiveEvent[]): Promise<"ok" | "gone" | "fail"> {
  const p_events = events.map((e) => ({ ...e, seq: undefined }));
  const r = await rpc("relay_ingest", { p_key: roomKey, p_events });
  if (r?.ok) return "ok";
  const err = (await r?.json().catch(() => null)) as { message?: string } | null;
  return err?.message === "key retired" || err?.message === "key revoked" ? "gone" : "fail";
}

export interface PushTarget {
  sub: { endpoint: string; keys: { p256dh: string; auth: string } };
  done: boolean;
  /** the teammate this device belongs to; null rings for everyone's Claude */
  member?: string | null;
}

/** The room's live push subscriptions, plus the last question asked in this chat to put in the notification. */
export async function cloudPushTargets(roomKey: string, session: string): Promise<{ targets: PushTarget[]; ask: string | null }> {
  const r = await rpc("relay_push_targets", { p_key: roomKey, p_session: session });
  if (!r?.ok) return { targets: [], ask: null };
  const d = (await r.json().catch(() => null)) as { targets?: PushTarget[]; ask?: string | null } | null;
  return { targets: d?.targets ?? [], ask: d?.ask ?? null };
}

export async function cloudPushGone(roomKey: string, endpoint: string): Promise<void> {
  await rpc("relay_push_unsubscribe", { p_key: roomKey, p_endpoint: endpoint });
}

/** Files a permission prompt in the café while the key's owner is away; null when they are not, or on any failure. */
export async function cloudAsk(
  roomKey: string,
  a: { session: string; label: string; tool: string; detail: string; body: AskBody | null },
): Promise<string | null> {
  const r = await rpc("relay_ask_open", {
    p_key: roomKey,
    p_session: a.session,
    p_label: a.label,
    p_tool: a.tool,
    p_detail: a.detail,
    p_body: a.body,
  });
  if (!r?.ok) return null;
  const id = await r.json().catch(() => null);
  return typeof id === "string" ? id : null;
}

/** gone: the ask expired or its owner came back, so the terminal asks as usual. */
export type AskState = "allow" | "deny" | "open" | "gone";

export interface AskResult {
  state: AskState;
  body: AskBody | null;
  /** an answered question: each question's text to the labels picked, joined the way Claude Code reads them */
  reply: Record<string, string> | null;
}

export async function cloudAskResult(roomKey: string, id: string): Promise<AskResult | null> {
  const r = await rpc("relay_ask_result", { p_key: roomKey, p_id: id });
  if (!r?.ok) return null;
  const x = (await r.json().catch(() => null)) as AskResult | null;
  const s = x?.state;
  if (s !== "allow" && s !== "deny" && s !== "open" && s !== "gone") return null;
  return { state: s, body: x?.body ?? null, reply: x?.reply ?? null };
}
