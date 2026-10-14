import webpush, { WebPushError } from "web-push";
import { stopText } from "./attention";
import { PushTarget, cloudPushGone, cloudPushTargets } from "./cloud";
import { sessionLabel } from "./label";
import { LiveEvent } from "./types";

const PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE = process.env.VAPID_PRIVATE_KEY;
const FALLBACK_SUBJECT = "https://agent-pipeline-viz-one.vercel.app";

export function pushEnabled(): boolean {
  return Boolean(PUBLIC && PRIVATE);
}

export interface PushAlert {
  kind: "ask" | "done" | "test";
  need?: "permission" | "input";
  session: string;
  title: string;
  detail?: string;
  label: string;
  member?: string;
}

/** Only the moments the user has to act on: a permission prompt, Claude idling for an answer, a finished turn. */
export function alertFor(e: LiveEvent): PushAlert | null {
  const chat = e.title ?? sessionLabel(e.cwd);
  const label = e.member ? `${e.member} · ${chat}` : chat;
  const member = e.member;
  const who = e.agent ? (e.agentType ?? "агент") : "Claude";
  if (e.kind === "notify") {
    const permission = e.need !== "input";
    const tool = permission ? /: (.+)$/.exec(e.text ?? "")?.[1] : undefined;
    const asks = tool ? "просить дозвіл" : (e.text ?? "чекає на дозвіл");
    return {
      kind: "ask",
      need: permission ? "permission" : "input",
      session: e.session,
      label,
      member,
      title: permission ? `${who} ${asks}` : `${who} чекає на тебе`,
      detail: tool,
    };
  }
  if (e.kind === "stop" && !e.agent) {
    const title = e.err ? `Claude ${stopText(e.err)}` : "Claude відповів";
    return { kind: "done", session: e.session, label, member, title };
  }
  return null;
}

/** A subscriber who wants finished turns gets them right away, so Claude Code's idle reminder a minute later would repeat it. */
function wants(t: PushTarget, a: PushAlert): boolean {
  if (t.member && a.member && t.member !== a.member) return false;
  if (a.kind === "done") return t.done;
  if (a.kind === "ask" && a.need === "input") return !t.done;
  return true;
}

function subject(origin: string): string {
  return process.env.VAPID_SUBJECT || (origin.startsWith("https://") ? origin : FALLBACK_SUBJECT);
}

export async function sendPush(roomKey: string, a: PushAlert, origin: string): Promise<number> {
  if (!pushEnabled()) return 0;
  const { targets, ask } = await cloudPushTargets(roomKey, a.session);
  const chosen = targets.filter((t) => wants(t, a));
  if (!chosen.length) return 0;
  const body = [a.label, a.detail, a.kind !== "test" ? ask : null].filter(Boolean).join(" · ");
  const payload = JSON.stringify({ title: a.title, body, tag: `relay-${a.session}`, session: a.session, url: "/" });
  const topic = a.session.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || "relay";
  const vapidDetails = { subject: subject(origin), publicKey: PUBLIC!, privateKey: PRIVATE! };
  let sent = 0;
  await Promise.all(
    chosen.map(async (t) => {
      try {
        await webpush.sendNotification(t.sub, payload, { TTL: 600, urgency: "high", topic, vapidDetails, timeout: 5000 });
        sent += 1;
      } catch (err) {
        if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) {
          await cloudPushGone(roomKey, t.sub.endpoint);
        }
      }
    }),
  );
  return sent;
}
