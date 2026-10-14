import { after } from "next/server";
import { askDetail } from "@/lib/live/asks";
import { cloudAsk, cloudAskWait, cloudEnabled, cloudIngest } from "@/lib/live/cloud";
import { ROOM_KEY } from "@/lib/live/hookConfig.mjs";
import { sessionLabel } from "@/lib/live/label";
import { cleanMember } from "@/lib/live/member";
import { normalizeHook, parseHookBody, withExtras } from "@/lib/live/normalize";
import { alertFor, pushEnabled, sendPush } from "@/lib/live/pushServer";

export const dynamic = "force-dynamic";
export const preferredRegion = "fra1";
export const maxDuration = 30;

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HOLD_MS = 20_000;
const STEP_MS = 1_500;

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** relay.sh on a PermissionRequest: the ask's id while its owner is away, so the café answers; 204 otherwise. */
export async function POST(req: Request) {
  const params = new URL(req.url).searchParams;
  const key = params.get("k");
  if (!cloudEnabled() || !key || !ROOM_KEY.test(key)) return new Response(null, { status: 404 });
  const body = parseHookBody(await req.text().catch(() => ""));
  const raw = body?.raw;
  const session = str(raw?.session_id);
  const tool = str(raw?.tool_name);
  if (!body || !raw || raw.hook_event_name !== "PermissionRequest" || !session || !tool) {
    return new Response(null, { status: 400 });
  }
  const cwd = str(raw.cwd);
  const input = (raw.tool_input && typeof raw.tool_input === "object" ? raw.tool_input : {}) as Record<string, unknown>;
  const id = await cloudAsk(key, { session, label: body.title ?? sessionLabel(cwd), ...askDetail(tool, input, cwd) });
  if (!id) return new Response(null, { status: 204 });

  const note = normalizeHook(
    {
      session_id: session,
      cwd,
      agent_id: raw.agent_id,
      agent_type: raw.agent_type,
      hook_event_name: "Notification",
      notification_type: "permission_prompt",
      message: `Claude needs your permission to use ${tool}`,
    },
    0,
    Date.now(),
  );
  if (note) {
    const ev = withExtras(note, body, cleanMember(params.get("m")));
    const origin = new URL(req.url).origin;
    after(async () => {
      if ((await cloudIngest(key, [ev])) !== "ok") return;
      const alert = pushEnabled() ? alertFor(ev) : null;
      if (alert) await sendPush(key, alert, origin).catch(() => 0);
    });
  }
  return Response.json({ id });
}

/** relay.sh waiting on its ask: holds up to 20 s for the café's answer, so the script calls rarely. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const key = params.get("k");
  const id = params.get("id");
  if (!cloudEnabled() || !key || !ROOM_KEY.test(key) || !id || !ID.test(id)) {
    return new Response(null, { status: 404 });
  }
  const end = Date.now() + HOLD_MS;
  for (;;) {
    const a = await cloudAskWait(key, id);
    if (a !== "open" || Date.now() + STEP_MS > end) return Response.json({ a: a ?? "fail" });
    await new Promise((r) => setTimeout(r, STEP_MS));
  }
}
