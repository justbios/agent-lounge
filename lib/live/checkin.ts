import type { Checkin } from "./types";

/*
 * Claude's own word on how long its whole job still takes. Every so often, while it runs subagents, the hooks ask it
 * (relay.sh checkin) to end a reply with a line like `⏱ 95m · 6/10 · QA on iOS`; the hooks pick the line out of the
 * chat's transcript and send only it, with the time Claude wrote it. The café counts down from there.
 */

/** A line saying the job takes longer than this is a typo, not a plan. */
const MAX_MIN = 3 * 24 * 60;
const MAX_NOW = 48;
const MIN = 60_000;
const EPOCH_MS_MIN = 1.6e12;
const EPOCH_MS_MAX = 4.2e12;

const HOURS = /^(\d{1,3}(?:[.,]\d+)?)\s*(?:h|hrs?|hours?|год\S*|ч\S*)(?![a-z])\s*(?:(\d{1,2})\s*(?:m|min|хв|м)?)?/iu;
const MINUTES = /^(\d{1,4})\s*(?:m|min|mins|minutes?|хв\S*|мин\S*|м)?(?![a-z])/iu;
const COUNT = /(\d{1,4})\s*\/\s*(\d{1,4})/;

/** The minutes a check-in starts with, "95m", "1h 35m", "1.5h", "~40 хв"; null when it doesn't start with a time. */
function minutesOf(s: string): { min: number; rest: string } | null {
  const t = s.replace(/^[\s~≈]+/, "");
  const h = HOURS.exec(t);
  if (h) {
    const min = parseFloat(h[1].replace(",", ".")) * 60 + (h[2] ? Number(h[2]) : 0);
    return { min, rest: t.slice(h[0].length) };
  }
  const m = MINUTES.exec(t);
  return m ? { min: Number(m[1]), rest: t.slice(m[0].length) } : null;
}

/** Reads what follows ⏱ in a check-in line; null when it is not one. */
export function parseCheckin(line: string): Omit<Checkin, "at"> | null {
  const i = line.lastIndexOf("⏱");
  if (i < 0) return null;
  const time = minutesOf(line.slice(i + 1).replace(/^️/, ""));
  if (!time || !Number.isFinite(time.min) || time.min < 0 || time.min > MAX_MIN) return null;
  const out: Omit<Checkin, "at"> = { left: Math.round(time.min * MIN) };
  const parts = time.rest
    .split(/\s*[·|•]\s*/)
    .map((p) => p.replace(/[`*_]/g, "").trim())
    .filter(Boolean);
  const count = parts.map((p) => COUNT.exec(p)).find((m) => m != null);
  if (count) {
    const done = Number(count[1]);
    const total = Number(count[2]);
    if (total > 0 && done <= total) Object.assign(out, { done, total });
  }
  const now = parts.filter((p) => !/^\d{1,4}\s*\/\s*\d{1,4}(?!\S)/.test(p)).at(-1);
  if (now) out.now = now.length > MAX_NOW ? `${now.slice(0, MAX_NOW - 1)}…` : now;
  return out;
}

/** The hook's section: the time Claude wrote the line (ISO), a tab or space, then the line. */
export function readCheckinSection(sec: string | null): Checkin | undefined {
  const first = sec?.split("\n").find((l) => l.trim())?.trim();
  if (!first || first.length > 400) return undefined;
  const cut = first.search(/\s/);
  if (cut < 0) return undefined;
  const at = Date.parse(first.slice(0, cut));
  if (!Number.isFinite(at) || at < EPOCH_MS_MIN || at > EPOCH_MS_MAX) return undefined;
  const c = parseCheckin(first.slice(cut + 1).replace(/\\(["\\/])/g, "$1"));
  return c ? { at, ...c } : undefined;
}
