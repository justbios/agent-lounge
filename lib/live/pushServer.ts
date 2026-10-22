import webpush, { WebPushError } from "web-push";
import { stopText } from "./attention";
import { PushTarget, cloudPushGone, cloudPushTargets } from "./cloud";
import { sessionLabel } from "./label";
import { srcName } from "./source";
import { LiveEvent } from "./types";

const PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE = process.env.VAPID_PRIVATE_KEY;
/** Push services want a contact for the sender; set VAPID_SUBJECT to your own site or mailto: to override it. */
const FALLBACK_SUBJECT = "https://github.com/justbios/agent-lounge";

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
  /** the same alert for a phone whose browser reads English; the service worker picks one */
  en?: { title: string; label?: string; detail?: string };
}

/** Only the moments the user has to act on: a permission prompt, Claude idling for an answer, a finished turn. */
export function alertFor(e: LiveEvent): PushAlert | null {
  const chat = e.title ?? sessionLabel(e.cwd);
  const label = e.member ? `${e.member} · ${chat}` : chat;
  const member = e.member;
  const main = srcName(e.src);
  const who = e.agent ? (e.agentType ?? "агент") : main;
  const whoEn = e.agent ? (e.agentType ?? "an agent") : main;
  if (e.kind === "notify") {
    const permission = e.need !== "input";
    const tool = permission ? /: (.+)$/.exec(e.text ?? "")?.[1] : undefined;
    const asks = tool ? "просить дозвіл" : (e.text ?? "чекає на дозвіл");
    const asksEn = tool
      ? "asks for permission"
      : e.tool === "ask"
        ? "waits for your answer"
        : e.tool === "plan"
          ? "waits for you to approve the plan"
          : "waits for permission";
    return {
      kind: "ask",
      need: permission ? "permission" : "input",
      session: e.session,
      label,
      member,
      title: permission ? `${who} ${asks}` : `${who} чекає на тебе`,
      detail: tool,
      en: { title: permission ? `${whoEn} ${asksEn}` : `${whoEn} is waiting for you` },
    };
  }
  if (e.kind === "stop" && !e.agent) {
    const title = e.err ? `${main} ${stopText(e.err)}` : `${main} відповів`;
    const titleEn = e.err ? `${main} ${stopText(e.err, "en")}` : `${main} answered`;
    return { kind: "done", session: e.session, label, member, title, en: { title: titleEn } };
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
  const lines = (label: string, detail?: string) => [label, detail, a.kind !== "test" ? ask : null].filter(Boolean).join(" · ");
  const body = lines(a.label, a.detail);
  const en = a.en && { title: a.en.title, body: lines(a.en.label ?? a.label, a.en.detail ?? a.detail) };
  const payload = JSON.stringify({ title: a.title, body, en, tag: `relay-${a.session}`, session: a.session, url: "/" });
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
