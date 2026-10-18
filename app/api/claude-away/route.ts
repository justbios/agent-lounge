import { cloudAway, cloudEnabled, requestKey } from "@/lib/live/cloud";

export const dynamic = "force-dynamic";
export const preferredRegion = "fra1";

/**
 * `relay.sh away on|off` from the computer itself: «я не за комп'ютером» for this personal key, so the café shows
 * Claude's asks. Turning it on is only ever done from here; the café's own page can only turn it off.
 */
export async function POST(req: Request) {
  const key = requestKey(req);
  if (!cloudEnabled() || !key) return new Response(null, { status: 404 });
  const what = (await req.text().catch(() => "")).trim();
  if (what !== "on" && what !== "off") return new Response(null, { status: 400 });
  const r = await cloudAway(key, what === "on");
  if (!r) return new Response(null, { status: 403 });
  return Response.json(r);
}
