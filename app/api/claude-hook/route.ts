import { after } from "next/server";
import { KEY_HEADER } from "@/lib/live/hookConfig.mjs";
import { cloudEnabled, cloudIngest, requestKey } from "@/lib/live/cloud";
import { cleanMember } from "@/lib/live/member";
import { normalizeHook, parseHookBody, rosterEvent, withExtras } from "@/lib/live/normalize";
import { alertFor, pushEnabled, sendPush } from "@/lib/live/pushServer";
import { localRequest, nextSeq, publish } from "@/lib/live/store";
import { LiveEvent } from "@/lib/live/types";

export const dynamic = "force-dynamic";
export const preferredRegion = "fra1";

export async function POST(req: Request) {
  const params = new URL(req.url).searchParams;
  const keyed = req.headers.has(KEY_HEADER) || params.has("k");
  const roomKey = requestKey(req);
  const member = cleanMember(params.get("m"));
  const http = params.get("via") === "http";
  const body = parseHookBody(await req.text().catch(() => ""));
  if (!body) return new Response(null, { status: 400 });
  const at = Date.now();

  if (keyed) {
    if (!cloudEnabled() || !roomKey) return new Response(null, { status: 404 });
    const events = [
      body.agents ? rosterEvent(body.raw, body.agents, 0, at) : null,
      normalizeHook(body.raw, 0, at),
    ]
      .filter((e): e is LiveEvent => e != null)
      .map((e) => withExtras(e, body, member))
      .map((e) => (http ? { ...e, via: "http" as const } : e));
    const alert = pushEnabled() ? events.map(alertFor).find((a) => a != null) : null;
    const origin = new URL(req.url).origin;
    const push = () => (alert ? sendPush(roomKey, alert, origin).catch(() => 0) : 0);
    const ingest = () => (events.length ? cloudIngest(roomKey, events) : Promise.resolve("ok" as const));
    // an HTTP hook holds Claude until it is answered, so it is answered at once and the café catches up after
    if (http) {
      after(async () => {
        if ((await ingest()) === "ok") await push();
      });
      return new Response(null, { status: 204 });
    }
    const sent = await ingest();
    if (sent !== "ok") return new Response(null, { status: sent === "gone" ? 410 : 502 });
    if (alert) after(push);
    return new Response(null, { status: 204 });
  }

  if (!localRequest(req)) return new Response(null, { status: 404 });
  const ev = normalizeHook(body.raw, nextSeq(), at);
  if (ev) publish(withExtras(ev, body, null));
  return new Response(null, { status: 204 });
}
