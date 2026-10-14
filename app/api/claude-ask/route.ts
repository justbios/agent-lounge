import { after } from "next/server";
import { ASK_BODY_MAX, ASK_TOOLS, askBody, askDetail } from "@/lib/live/asks";
import { AskResult, cloudAsk, cloudAskResult, cloudEnabled, cloudIngest } from "@/lib/live/cloud";
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

/**
 * relay.sh on a PermissionRequest, or on the PreToolUse of a question or a plan: the ask's id while its owner is away,
 * so the café answers; 204 when they are at the computer, which the script believes for a minute.
 */
export async function POST(req: Request) {
  const params = new URL(req.url).searchParams;
  const key = params.get("k");
  if (!cloudEnabled() || !key || !ROOM_KEY.test(key)) return new Response(null, { status: 404 });
  const body = parseHookBody(await req.text().catch(() => ""));
  const raw = body?.raw;
  const session = str(raw?.session_id);
  const tool = str(raw?.tool_name);
  const asking = !!tool && ASK_TOOLS.has(tool);
  const event = asking ? "PreToolUse" : "PermissionRequest";
  if (!body || !raw || raw.hook_event_name !== event || !session || !tool) {
    return new Response(null, { status: 400 });
  }
  const cwd = str(raw.cwd);
  const input = (raw.tool_input && typeof raw.tool_input === "object" ? raw.tool_input : {}) as Record<string, unknown>;
  const whole = asking ? askBody(tool, input) : null;
  if (asking && (!whole || JSON.stringify(whole).length > ASK_BODY_MAX)) return new Response(null, { status: 422 });
  const label = body.title ?? sessionLabel(cwd);
  const id = await cloudAsk(key, { session, label, ...askDetail(tool, input, cwd), body: whole });
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

/**
 * What relay.sh prints for an answer: a permission's allow or deny as is; a question's answers or an approved plan as
 * Claude's own input to pass back, under `u`, which the script expects right after `a`; a rejected plan as deny.
 */
function verdict(r: AskResult): { a: string; u?: unknown } {
  if (r.state !== "allow" && r.state !== "deny") return { a: r.state };
  if (!r.body) return { a: r.state };
  if (r.body.tool === "ExitPlanMode") return r.state === "allow" ? { a: "allow", u: r.body.input } : { a: "deny" };
  if (r.state === "allow" && r.reply) return { a: "allow", u: { ...r.body.input, answers: r.reply } };
  return { a: "gone" };
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
    const r = await cloudAskResult(key, id);
    if (!r) return Response.json({ a: "fail" });
    if (r.state !== "open" || Date.now() + STEP_MS > end) return Response.json(verdict(r));
    await new Promise((r) => setTimeout(r, STEP_MS));
  }
}
