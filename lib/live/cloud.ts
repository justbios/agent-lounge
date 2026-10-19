import { AskBody } from "./asks";
import { KEY_HEADER, ROOM_KEY } from "./hookConfig.mjs";
import { LiveEvent } from "./types";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function cloudEnabled(): boolean {
  return Boolean(URL_ && KEY);
}

/** A hook's room key: from its header (relay.sh 6, HTTP hooks), or from the address an older script still uses. */
export function requestKey(req: Request): string | null {
  const k = req.headers.get(KEY_HEADER) ?? new URL(req.url).searchParams.get("k");
  return k && ROOM_KEY.test(k) ? k : null;
}

const GONE = new Set(["key retired", "key revoked", "cafe closed"]);

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
 * gone: the key was retired with the shared key or revoked by the café owner, or it would open a new café on a site
 * closed to them (0022), so retrying will not help.
 */
export async function cloudIngest(roomKey: string, events: LiveEvent[]): Promise<"ok" | "gone" | "fail"> {
  const p_events = events.map((e) => ({ ...e, seq: undefined }));
  const r = await rpc("relay_ingest", { p_key: roomKey, p_events });
  if (r?.ok) return "ok";
  const err = (await r?.json().catch(() => null)) as { message?: string } | null;
  return err?.message && GONE.has(err.message) ? "gone" : "fail";
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

/**
 * Files a permission prompt in the café while the key's owner is away: its id; null when they are not; undefined on
 * any failure, which leaves the computer's «я не за комп'ютером» as it is. raw is the hook's JSON exactly as the
 * computer sent it and kid the key it checks answers with.
 */
export async function cloudAsk(
  roomKey: string,
  a: { session: string; label: string; tool: string; detail: string; body: AskBody | null; kid: string; raw: string },
): Promise<string | null | undefined> {
  const r = await rpc("relay_ask_open", {
    p_key: roomKey,
    p_session: a.session,
    p_label: a.label,
    p_tool: a.tool,
    p_detail: a.detail,
    p_body: a.body,
    p_kid: a.kid,
    p_raw: a.raw,
  });
  if (!r?.ok) return undefined;
  const id = await r.json().catch(() => undefined);
  return typeof id === "string" ? id : id === null ? null : undefined;
}

/** gone: the ask expired or its owner came back, so the terminal asks as usual. */
export type AskState = "allow" | "deny" | "open" | "gone";

export interface AskResult {
  state: AskState;
  /** Claude's input to pass back, as the paired device wrote it: JSON text, kept byte for byte for the signature */
  u: string | null;
  /** the device's HMAC over the answer, which relay.sh checks; the server cannot make one */
  sig: string | null;
}

export async function cloudAskResult(roomKey: string, id: string): Promise<AskResult | null> {
  const r = await rpc("relay_ask_result", { p_key: roomKey, p_id: id });
  if (!r?.ok) return null;
  const x = (await r.json().catch(() => null)) as { state?: unknown; u?: unknown; sig?: unknown } | null;
  const s = x?.state;
  if (s !== "allow" && s !== "deny" && s !== "open" && s !== "gone") return null;
  return { state: s, u: typeof x?.u === "string" ? x.u : null, sig: typeof x?.sig === "string" ? x.sig : null };
}

/** «Я не за комп'ютером» on (until when) or off, as relay.sh away asks; null for a shared key or on failure. */
export async function cloudAway(roomKey: string, on: boolean): Promise<{ until: string | null } | null> {
  const r = await rpc("relay_away_set", { p_key: roomKey, p_on: on });
  if (!r?.ok) return null;
  const until = await r.json().catch(() => undefined);
  return until === undefined ? null : { until: typeof until === "string" ? until : null };
}
