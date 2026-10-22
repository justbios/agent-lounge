import { after } from "next/server";
import { ASK_BODY_MAX, ASK_DETAIL_MAX, ASK_TOOLS, askBody, askDetail } from "@/lib/live/asks";
import { AskResult, cloudAsk, cloudAskResult, cloudEnabled, cloudIngest, requestKey } from "@/lib/live/cloud";
import { sessionLabel } from "@/lib/live/label";
import { cleanMember } from "@/lib/live/member";
import { normalizeHook, parseHookBody, withExtras } from "@/lib/live/normalize";
import { alertFor, pushEnabled, sendPush } from "@/lib/live/pushServer";

export const dynamic = "force-dynamic";
export const preferredRegion = "fra1";
export const maxDuration = 30;

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SIG = /^[0-9a-f]{64}$/;
const HOLD_MS = 20_000;
const STEP_MS = 1_500;
/** The first script that checks the café's answers itself; an older one is never handed one. */
const SIGNED_FROM = 6;
/** The hook's whole JSON, kept so a paired phone shows and signs exactly it; relay_ask_open's limit. */
const ASK_RAW_MAX = 120_000;

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/**
 * relay.sh on a PermissionRequest, or on the PreToolUse of a question or a plan, while «я не за комп'ютером» is on
 * on that computer: the ask's id while the café also has its owner away, so a paired phone answers; 204 when the
 * café says they are back, which switches the computer's side off too. A script older than 6 can't check a
 * signature, so it always gets 204 and the terminal asks.
 */
export async function POST(req: Request) {
  const params = new URL(req.url).searchParams;
  const key = requestKey(req);
  if (!cloudEnabled() || !key) return new Response(null, { status: 404 });
  const body = parseHookBody(await req.text().catch(() => ""));
  if (body && (!body.kid || (body.version ?? 0) < SIGNED_FROM)) return new Response(null, { status: 204 });
  const raw = body?.raw;
  const session = str(raw?.session_id);
  const tool = str(raw?.tool_name);
  const asking = !!tool && ASK_TOOLS.has(tool);
  const event = asking ? "PreToolUse" : "PermissionRequest";
  if (!body?.kid || !raw || raw.hook_event_name !== event || !session || !tool) {
    return new Response(null, { status: 400 });
  }
  const cwd = str(raw.cwd);
  const input = (raw.tool_input && typeof raw.tool_input === "object" ? raw.tool_input : {}) as Record<string, unknown>;
  const whole = asking ? askBody(tool, input) : null;
  if (asking && (!whole || JSON.stringify(whole).length > ASK_BODY_MAX)) return new Response(null, { status: 422 });
  const what = askDetail(tool, input, cwd);
  if (what.detail.length > ASK_DETAIL_MAX || body.text.length > ASK_RAW_MAX) return new Response(null, { status: 422 });
  const label = body.title ?? sessionLabel(cwd);
  const id = await cloudAsk(key, { session, label, ...what, body: whole, kid: body.kid, raw: body.text });
  // 204 tells the script the café has its owner back, which switches the computer's side off; failures don't
  if (id === null) return new Response(null, { status: 204 });
  if (!id) return new Response(null, { status: 503 });

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
  // Codex says it waits from a hook of its own, which posts this too, whether or not you are away
  if (note && !body.src) {
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
 * What relay.sh reads for an answer: `{"a":…,"s":…,"u":…}` in that order, u (Claude's input to pass back) exactly as
 * the paired device wrote and signed it, so it is written out as text rather than re-encoded.
 */
function verdict(r: AskResult): string {
  if (r.state !== "allow" && r.state !== "deny") return JSON.stringify({ a: r.state });
  if (!r.sig || !SIG.test(r.sig)) return JSON.stringify({ a: "gone" });
  const head = `{"a":"${r.state}","s":"${r.sig}"`;
  if (r.u == null) return `${head}}`;
  if (/[\r\n]/.test(r.u)) return JSON.stringify({ a: "gone" });
  try {
    JSON.parse(r.u);
  } catch {
    return JSON.stringify({ a: "gone" });
  }
  return `${head},"u":${r.u}}`;
}

/** relay.sh waiting on its ask: holds up to 20 s for the café's answer, so the script calls rarely. */
export async function GET(req: Request) {
  const key = requestKey(req);
  const id = new URL(req.url).searchParams.get("id");
  if (!cloudEnabled() || !key || !id || !ID.test(id)) {
    return new Response(null, { status: 404 });
  }
  const end = Date.now() + HOLD_MS;
  const json = (text: string) => new Response(text, { headers: { "content-type": "application/json" } });
  for (;;) {
    const r = await cloudAskResult(key, id);
    if (!r) return json(JSON.stringify({ a: "fail" }));
    if (r.state !== "open" || Date.now() + STEP_MS > end) return json(verdict(r));
    await new Promise((r) => setTimeout(r, STEP_MS));
  }
}
