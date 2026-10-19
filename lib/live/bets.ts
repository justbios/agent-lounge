import { LiveEvent } from "./types";

/** Bets close a minute and a half after a subagent starts. */
export const BET_WINDOW_MS = 90_000;
/** A finished round stays up this long with its result. */
export const BET_SHOW_MS = 20_000;
const STALE_MS = 60 * 60_000;

export const CHOICES = [
  { id: "fast", label: { uk: "до 2 хв", en: "under 2 min" }, max: 2 * 60_000 },
  { id: "mid", label: { uk: "2–8 хв", en: "2–8 min" }, max: 8 * 60_000 },
  { id: "slow", label: { uk: "8+ хв", en: "8+ min" }, max: Infinity },
] as const;

/** The type a round gets when the hook did not name the subagent's; BetStrip shows it in the viewer's language. */
export const NO_TYPE = "агент";
export type ChoiceId = (typeof CHOICES)[number]["id"];

/** One subagent run, from its start to its stop: the thing everyone bets on. */
export interface Round {
  id: string;
  session: string;
  agent: string;
  type: string;
  task: string | null;
  start: number;
  end: number | null;
}

export interface Pick {
  choice: ChoiceId;
  name: string;
}

export const choiceOf = (ms: number): ChoiceId => CHOICES.find((c) => ms < c.max)!.id;

export function roundsOf(events: LiveEvent[]): Round[] {
  const rounds = new Map<string, Round>();
  const task = new Map<string, string>();
  for (const e of events) {
    if (e.kind === "dispatch" && e.target) task.set(`${e.session}|${e.target}`, e.text ?? "");
    else if (e.kind === "sub_start" && e.agent) {
      const type = e.agentType ?? NO_TYPE;
      rounds.set(e.agent, {
        id: `${e.session}:${e.agent}`,
        session: e.session,
        agent: e.agent,
        type,
        task: task.get(`${e.session}|${type}`) || null,
        start: e.at,
        end: null,
      });
    } else if (e.kind === "sub_stop" && e.agent) {
      const r = rounds.get(e.agent);
      if (r && r.end == null) r.end = e.at;
    }
  }
  return [...rounds.values()];
}

/** Rounds worth a row at `now`: open for bets, running with bets in, or just finished with bets to settle. */
export function visibleRounds(rounds: Round[], now: number, hasPicks: (id: string) => boolean): Round[] {
  return rounds.filter((r) => {
    if (r.end != null) return now - r.end < BET_SHOW_MS && hasPicks(r.id);
    if (now - r.start > STALE_MS) return false;
    return now - r.start < BET_WINDOW_MS || hasPicks(r.id);
  });
}

export function cleanPick(p: unknown): { round: string; by: string; pick: Pick } | null {
  if (!p || typeof p !== "object") return null;
  const r = p as Record<string, unknown>;
  const choice = CHOICES.find((c) => c.id === r.choice)?.id;
  const ok = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max;
  if (!choice || !ok(r.round, 200) || !ok(r.by, 64) || !ok(r.name, 24)) return null;
  return { round: r.round as string, by: r.by as string, pick: { choice, name: r.name as string } };
}
