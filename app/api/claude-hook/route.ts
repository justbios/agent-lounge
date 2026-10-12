import { cloudEnabled, cloudIngest } from "@/lib/live/cloud";
import { ROOM_KEY } from "@/lib/live/hookConfig.mjs";
import { normalizeHook, parseHookBody, rosterEvent } from "@/lib/live/normalize";
import { liveEnabled, nextSeq, publish } from "@/lib/live/store";
import { LiveEvent } from "@/lib/live/types";

export const dynamic = "force-dynamic";
export const preferredRegion = "fra1";

export async function POST(req: Request) {
  const roomKey = new URL(req.url).searchParams.get("k");
  const body = parseHookBody(await req.text().catch(() => ""));
  if (!body) return new Response(null, { status: 400 });
  const at = Date.now();

  if (roomKey) {
    if (!cloudEnabled() || !ROOM_KEY.test(roomKey)) return new Response(null, { status: 404 });
    const events = [
      body.agents ? rosterEvent(body.raw, body.agents, 0, at) : null,
      normalizeHook(body.raw, 0, at),
    ].filter((e): e is LiveEvent => e != null);
    if (events.length && !(await cloudIngest(roomKey, events))) return new Response(null, { status: 502 });
    return new Response(null, { status: 204 });
  }

  if (!liveEnabled()) return new Response(null, { status: 404 });
  const ev = normalizeHook(body.raw, nextSeq(), at);
  if (ev) publish(ev);
  return new Response(null, { status: 204 });
}
