import type { Two } from "@/lib/i18n";
import { readSrc } from "@/lib/live/source";
import type { HourRow } from "@/lib/live/recap";
import type { AgentDef } from "@/lib/types";
import { AGENT_KINDS, MAX_LEVEL, SQUAD_MAX, kindOf } from "./content";
import { seedOf } from "./rng";
import type { Fighter } from "./types";

/**
 * The café's agents as fighters. A chat's main agent leads, and which agent it is decides the ultimate. Every other
 * agent type fights as the class its name says it is (a reviewer as a reviewer, Explore as a scout), and grows with
 * the work it did in the last week: each level wants about twice the tasks of the one before.
 */

export interface Recruit extends Fighter {
  /** the agent type it stands for, or "main" for the leader */
  key: string;
  /** tasks handed to it in the last week, which set its level */
  work: number;
  /** not one of the café's own agents: a stand-in so a small team can still field a squad */
  reserve?: boolean;
}

const CLASSES: [RegExp, string][] = [
  [/review|audit|critic|lint|inspect/i, "reviewer"],
  [/test|\bqa\b|spec|verif|e2e/i, "tester"],
  [/secur|guard|protect|safe|sentinel|firewall|policy/i, "guardian"],
  [/debug|fix|bug|doctor|heal|repair|triage|incident/i, "debugger"],
  [/deploy|devops|infra|\bci\b|\bops\b|release|docker|k8s|cloud|build/i, "devops"],
  [/plan|architect|design|strateg|lead|manag|product|orchestr/i, "planner"],
  [/explor|search|research|scout|find|investigat|brows|web/i, "scout"],
  [/code|dev|implement|engineer|program|front|back|refactor|writ|general/i, "coder"],
];

/** The class an agent type fights as: by its name, or, for a name that says nothing, always the same one for it. */
export function classOf(type: string): string {
  for (const [re, kind] of CLASSES) if (re.test(type)) return kind;
  return AGENT_KINDS[seedOf(type) % AGENT_KINDS.length].id;
}

export const levelFor = (work: number): number =>
  Math.max(1, Math.min(MAX_LEVEL, 1 + Math.floor(Math.log2(1 + work / 2))));

const PALETTE = ["#7aa2ff", "#5ad1a0", "#f2b84b", "#e57373", "#b38cf5", "#4fc3f7", "#f48fb1", "#9ccc65"];

/** Stand-ins for a team with few agent types, so there is always a squad to field. */
const RESERVES = ["coder", "tester", "guardian", "debugger"];

/**
 * Everyone who can fight for this café: its leader first, then the agent types it has, the busiest first. `agents` are
 * the agents at the desks now, `roster` the types the project defines, `rows` the last week's hours.
 */
export function recruits(agents: AgentDef[], roster: string[], rows: HourRow[] | null, reserveName: Two, ui: "uk" | "en"): Recruit[] {
  const counts: Record<string, number> = {};
  let prompts = 0;
  for (const r of rows ?? []) {
    prompts += r.prompts;
    for (const [k, v] of Object.entries(r.agents)) counts[k] = (counts[k] ?? 0) + v;
  }
  const main = agents.find((a) => a.id === "main") ?? agents[0];
  const lead = readSrc(main?.key) ?? "claude";
  const leadWork = Math.round(prompts / 2);
  const out: Recruit[] = [
    {
      key: "main",
      kind: lead,
      name: main?.name ?? "Claude",
      body: kindOf(lead)?.body ?? "hero",
      color: main?.color ?? "#ff9a62",
      level: levelFor(leadWork),
      leader: true,
      work: leadWork,
    },
  ];
  const types = new Map<string, { name: string; color?: string }>();
  for (const a of agents)
    if (a.key?.startsWith("@") && !a.twin) types.set(a.key.slice(1), { name: a.name, color: a.color });
  for (const t of [...roster, ...Object.keys(counts)]) if (t && !types.has(t)) types.set(t, { name: t });
  for (const [type, { name, color }] of types) {
    const kind = classOf(type);
    const work = counts[type] ?? 0;
    out.push({
      key: type,
      kind,
      name,
      body: kindOf(kind)!.body,
      color: color ?? PALETTE[seedOf(type) % PALETTE.length],
      level: levelFor(work),
      work,
    });
  }
  out.sort((a, b) => Number(!!b.leader) - Number(!!a.leader) || b.work - a.work || a.name.localeCompare(b.name));
  for (const kind of RESERVES) {
    if (out.length >= SQUAD_MAX) break;
    if (out.some((r) => r.kind === kind)) continue;
    const k = kindOf(kind)!;
    out.push({
      key: `reserve:${kind}`,
      kind,
      name: `${reserveName[ui]} ${k.name[ui].toLowerCase()}`,
      body: k.body,
      color: PALETTE[seedOf(kind) % PALETTE.length],
      level: 1,
      work: 0,
      reserve: true,
    });
  }
  return out;
}

/** The squad to start with: the leader and the busiest of the rest, one of a class before two of any. */
export function firstSquad(all: Recruit[]): string[] {
  const picked: Recruit[] = all.filter((r) => r.leader).slice(0, 1);
  const rest = all.filter((r) => !r.leader);
  for (const r of rest) if (picked.length < SQUAD_MAX && !picked.some((p) => p.kind === r.kind)) picked.push(r);
  for (const r of rest) if (picked.length < SQUAD_MAX && !picked.includes(r)) picked.push(r);
  return picked.map((r) => r.key);
}
