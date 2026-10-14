import { after } from "next/server";
import { cloudEnabled, cloudIngest } from "@/lib/live/cloud";
import { ROOM_KEY } from "@/lib/live/hookConfig.mjs";
import { cleanMember } from "@/lib/live/member";
import { normalizeHook, parseHookBody, rosterEvent, withExtras } from "@/lib/live/normalize";
import { alertFor, pushEnabled, sendPush } from "@/lib/live/pushServer";
import { liveEnabled, nextSeq, publish } from "@/lib/live/store";
import { LiveEvent } from "@/lib/live/types";

export const dynamic = "force-dynamic";
export const preferredRegion = "fra1";

export async function POST(req: Request) {
  const params = new URL(req.url).searchParams;
  const roomKey = params.get("k");
  const member = cleanMember(params.get("m"));
  const body = parseHookBody(await req.text().catch(() => ""));
  if (!body) return new Response(null, { status: 400 });
  const at = Date.now();

  if (roomKey) {
    if (!cloudEnabled() || !ROOM_KEY.test(roomKey)) return new Response(null, { status: 404 });
    const events = [
      body.agents ? rosterEvent(body.raw, body.agents, 0, at) : null,
      normalizeHook(body.raw, 0, at),
    ]
      .filter((e): e is LiveEvent => e != null)
      .map((e) => withExtras(e, body, member));
    const sent = events.length ? await cloudIngest(roomKey, events) : "ok";
    if (sent !== "ok") return new Response(null, { status: sent === "gone" ? 410 : 502 });
    const alert = pushEnabled() ? events.map(alertFor).find((a) => a != null) : null;
    if (alert) {
      const origin = new URL(req.url).origin;
      after(() => sendPush(roomKey, alert, origin).catch(() => 0));
    }
    return new Response(null, { status: 204 });
  }

  if (!liveEnabled()) return new Response(null, { status: 404 });
  const ev = normalizeHook(body.raw, nextSeq(), at);
  if (ev) publish(withExtras(ev, body, null));
  return new Response(null, { status: 204 });
}
