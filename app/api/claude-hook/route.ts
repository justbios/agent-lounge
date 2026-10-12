import { normalizeHook } from "@/lib/live/normalize";
import { liveEnabled, nextSeq, publish } from "@/lib/live/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!liveEnabled()) return new Response(null, { status: 404 });
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!raw || typeof raw !== "object") return new Response(null, { status: 400 });
  const ev = normalizeHook(raw as Record<string, unknown>, nextSeq(), Date.now());
  if (ev) publish(ev);
  return new Response(null, { status: 204 });
}
