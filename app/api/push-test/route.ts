import { cloudEnabled } from "@/lib/live/cloud";
import { ROOM_KEY } from "@/lib/live/hookConfig.mjs";
import { pushEnabled, sendPush } from "@/lib/live/pushServer";

export const dynamic = "force-dynamic";
export const preferredRegion = "fra1";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const body = (await req.json().catch(() => null)) as { k?: unknown } | null;
  const roomKey = typeof body?.k === "string" ? body.k : null;
  if (!cloudEnabled() || !pushEnabled() || !roomKey || !ROOM_KEY.test(roomKey)) return Response.json({ sent: 0 }, { status: 404 });
  const sent = await sendPush(
    roomKey,
    { kind: "test", session: "relay-test", label: "перевірка", title: "Agent Lounge на зв'язку", detail: "так виглядатиме сповіщення" },
    url.origin,
  );
  return Response.json({ sent });
}
