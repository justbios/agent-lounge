"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Check, Crown, Lock, Star, Swords, Users } from "lucide-react";
import type { Level } from "@/lib/arena/ai";
import { AGENT_KINDS, LEADER_KINDS, SQUAD_MAX, kindOf } from "@/lib/arena/content";
import { Dice, seedOf } from "@/lib/arena/rng";
import type { Setup } from "@/lib/arena/rules";
import { SPRINT, type Scenario, quickSetup, scenarioSetup } from "@/lib/arena/scenarios";
import { type Recruit, firstSquad, recruits } from "@/lib/arena/squad";
import type { Fighter } from "@/lib/arena/types";
import { type Ui, tr, useTr, useUi } from "@/lib/i18n";
import type { HourRow } from "@/lib/live/recap";
import { useHalloween } from "@/lib/live/season";
import type { AgentDef } from "@/lib/types";
import type { Intro, Outcome } from "./arena/ArenaView";
import { type PlaceId, placeFor } from "./arena/scenery";

/*
 * The agents' battle: the café's own agents as a squad of fighters, against the bugs in a five-battle sprint or a
 * quick fight, or against another squad of agents. The field itself (three.js) loads only once a battle starts.
 */

const ArenaView = dynamic(() => import("./arena/ArenaView"), {
  ssr: false,
  loading: () => <div className="arena-loading">…</div>,
});

const Face = dynamic(() => import("./arena/Face"), { ssr: false, loading: () => <i className="arena-face" /> });

const KEY = "relay.arena";

interface Saved {
  squad?: string[];
  level?: Level;
  /** sprint battles won */
  won?: string[];
  /** each sprint battle's best stars, out of three */
  stars?: Record<string, number>;
  wins?: number;
  played?: number;
}

function load(): Saved {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? "{}") as Saved) ?? {};
  } catch {
    return {};
  }
}

function store(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

const LEVELS: [Level, string, string][] = [
  ["easy", "легко", "easy"],
  ["normal", "звичайно", "normal"],
  ["hard", "важко", "hard"],
];

const RIVAL_COLORS = ["#ff7a7a", "#ffa36b", "#e86fb0", "#c98bff", "#ffd36b"];

let fights = 0;
/** A new battle's id: its dice are seeded by it, so each one is its own. */
const fightId = (kind: string) => `${kind}:${Date.now().toString(36)}${fights++}`;

type Mode = { kind: "sprint"; sc: Scenario } | { kind: "quick" } | { kind: "spar" };

interface Fight {
  id: string;
  mode: Mode;
  setup: Setup;
  sides: [string, string];
  place: PlaceId;
  intro?: Intro;
}

/** Another café's squad, as many and as strong as this one: a leader and agents of any class. */
function rivals(squad: Fighter[], id: string, ui: Ui): Fighter[] {
  const d = new Dice(seedOf(`${id}:rivals`));
  const lv = Math.round(squad.reduce((n, f) => n + f.level, 0) / Math.max(1, squad.length));
  const lead = LEADER_KINDS[d.int(0, LEADER_KINDS.length - 1)];
  const out: Fighter[] = [{ kind: lead.id, name: lead.name[ui], body: lead.body, color: RIVAL_COLORS[0], level: lv, leader: true }];
  while (out.length < squad.length) {
    const k = AGENT_KINDS[d.int(0, AGENT_KINDS.length - 1)];
    out.push({ kind: k.id, name: k.name[ui], body: k.body, color: RIVAL_COLORS[out.length % RIVAL_COLORS.length], level: lv });
  }
  return out;
}

const RESERVE = { uk: "Запасний", en: "Reserve" };

/** The squad's agents: as saved, or the first pick; the leader always among them. */
function squadKeys(all: Recruit[], saved: string[] | undefined): string[] {
  const kept = (saved ?? []).filter((k) => all.some((r) => r.key === k));
  const lead = all.find((r) => r.leader)?.key;
  const pick = kept.length ? kept : firstSquad(all);
  return lead && !pick.includes(lead) ? [lead, ...pick].slice(0, SQUAD_MAX) : pick;
}

/** The squad as picked in the battle's menu, the leader first: what this side brings to a battle with another person. */
export function useSquad(agents: AgentDef[], roster: string[], rows: HourRow[] | null): Fighter[] {
  const ui = useUi();
  const all = useMemo(() => recruits(agents, roster, rows, RESERVE, ui), [agents, roster, rows, ui]);
  const [saved] = useState(load);
  const keys = squadKeys(all, saved.squad);
  return all.filter((r) => keys.includes(r.key));
}

export default function Arena({ agents, roster, rows }: { agents: AgentDef[]; roster: string[]; rows: HourRow[] | null }) {
  const ui = useUi();
  const t = useTr();
  const spooky = useHalloween().on;
  const [saved, setSaved] = useState<Saved>(load);
  const [fight, setFight] = useState<Fight | null>(null);
  const all = useMemo(() => recruits(agents, roster, rows, RESERVE, ui), [agents, roster, rows, ui]);
  const keys = useMemo(() => squadKeys(all, saved.squad), [saved.squad, all]);
  const squad: Fighter[] = all.filter((r) => keys.includes(r.key));
  const level = saved.level ?? "normal";
  const won = new Set(saved.won ?? []);

  const keep = (patch: Partial<Saved> | ((s: Saved) => Partial<Saved>)) =>
    setSaved((s) => {
      const n = { ...s, ...(typeof patch === "function" ? patch(s) : patch) };
      store(n);
      return n;
    });

  const toggle = (key: string) => {
    if (keys.includes(key)) keep({ squad: keys.filter((k) => k !== key) });
    else if (keys.length < SQUAD_MAX) keep({ squad: [...keys, key] });
  };

  const start = (mode: Mode) => {
    const id = fightId(mode.kind);
    const ours = t("Агенти", "Agents");
    if (mode.kind === "sprint") {
      const sc = mode.sc;
      setFight({
        id,
        mode,
        setup: scenarioSetup(sc, squad, id),
        sides: [ours, t("Баги", "Bugs")],
        place: placeFor(id, spooky, sc.id),
        intro: { title: sc.name[ui], story: sc.story[ui], tip: sc.tip[ui] },
      });
    } else if (mode.kind === "quick") {
      const d = new Dice(seedOf(id));
      setFight({
        id,
        mode,
        setup: quickSetup(squad, id, (n) => d.int(0, n - 1)),
        sides: [ours, t("Баги", "Bugs")],
        place: placeFor(id, spooky),
      });
    } else {
      setFight({
        id,
        mode,
        setup: { id, teams: [squad, rivals(squad, id, ui)] },
        sides: [ours, t("Суперники", "Rivals")],
        place: placeFor(id, spooky),
      });
    }
  };

  const ended = (mode: Mode, o: Outcome) => {
    const win = o.winner === 0;
    const got = o.stars.filter(Boolean).length;
    keep((s) => ({
      played: (s.played ?? 0) + 1,
      wins: (s.wins ?? 0) + (win ? 1 : 0),
      ...(win && mode.kind === "sprint"
        ? {
            won: [...new Set([...(s.won ?? []), mode.sc.id])],
            stars: { ...s.stars, [mode.sc.id]: Math.max(got, s.stars?.[mode.sc.id] ?? 0) },
          }
        : {}),
    }));
  };

  const nextOf = (mode: Mode) => {
    if (mode.kind !== "sprint") return undefined;
    const sc = SPRINT[SPRINT.findIndex((x) => x.id === mode.sc.id) + 1];
    return sc ? { name: sc.name[ui], go: () => start({ kind: "sprint", sc }) } : undefined;
  };

  return (
    <div className="arena">
      <p className="arena-about">
        {t(
          "Покрокова битва на гексах: ваші агенти проти багів. Клас бійця — з назви агента, рівень — з того, скільки він працював за тиждень. У кожного своє вміння, а лідер (головний агент чату) має ультимейт.",
          "A turn-based battle on hexes: your agents against the bugs. A fighter's class comes from the agent's name, its level from how much it worked this week. Each has its own skill, and the leader (the chat's main agent) has an ultimate.",
        )}
      </p>

      <div className="arena-hd">
        <span className="muted-sm">
          {t("Загін", "Squad")} {keys.length}/{SQUAD_MAX}
        </span>
        <div className="viewseg" role="radiogroup" aria-label={t("складність", "difficulty")}>
          {LEVELS.map(([id, uk, en]) => (
            <button key={id} role="radio" aria-checked={level === id} className={level === id ? "on" : ""} onClick={() => keep({ level: id })}>
              {t(uk, en)}
            </button>
          ))}
        </div>
      </div>

      <div className="arena-recruits">
        {all.map((r) => {
          const k = kindOf(r.kind);
          const on = keys.includes(r.key);
          return (
            <button
              key={r.key}
              className={`arena-recruit${on ? " on" : ""}${r.reserve ? " reserve" : ""}`}
              aria-pressed={on}
              disabled={r.leader || (!on && keys.length >= SQUAD_MAX)}
              onClick={() => toggle(r.key)}
              title={[k?.skill && `${k.skill.name[ui]}: ${k.skill.text[ui]}`, r.leader && k?.ult && `${k.ult.name[ui]}: ${k.ult.text[ui]}`]
                .filter(Boolean)
                .join("\n")}
            >
              <Face f={r} />
              <b>
                {r.leader && <Crown size={11} />} {r.name}
              </b>
              <small>
                {k?.name[ui]} · {tr(ui, `рів. ${r.level}`, `lv ${r.level}`)}
              </small>
              <span className="arena-skill">{r.leader ? k?.ult?.name[ui] : k?.skill?.name[ui]}</span>
              {on && <Check className="arena-tick" size={13} />}
            </button>
          );
        })}
      </div>

      <div className="arena-sprint">
        <div className="muted-sm">
          {t("Спринт", "The sprint")} · {won.size}/{SPRINT.length}
          {won.size > 0 && (
            <span className="arena-stars-sum">
              <Star size={11} /> {SPRINT.reduce((n, sc) => n + (won.has(sc.id) ? (saved.stars?.[sc.id] ?? 1) : 0), 0)}/{SPRINT.length * 3}
            </span>
          )}
        </div>
        <ol>
          {SPRINT.map((sc, i) => {
            const open = i === 0 || won.has(SPRINT[i - 1].id) || won.has(sc.id);
            const done = won.has(sc.id);
            return (
              <li key={sc.id}>
                <button
                  className={`arena-node${done ? " done" : ""}${open && !done ? " open" : ""}`}
                  disabled={!open || !squad.length}
                  onClick={() => start({ kind: "sprint", sc })}
                >
                  <span className="arena-node-n">{done ? <Check size={13} /> : open ? i + 1 : <Lock size={12} />}</span>
                  {sc.name[ui]}
                  {done && (
                    <span className="arena-node-stars" aria-label={t(`зірок: ${saved.stars?.[sc.id] ?? 1}`, `${saved.stars?.[sc.id] ?? 1} stars`)}>
                      {[0, 1, 2].map((k) => (
                        <Star key={k} size={10} className={k < (saved.stars?.[sc.id] ?? 1) ? "on" : ""} />
                      ))}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="arena-btns">
        <button className="btn" disabled={!squad.length} onClick={() => start({ kind: "quick" })}>
          <Swords size={14} /> {t("Швидкий бій з багами", "Quick fight with bugs")}
        </button>
        <button className="btn" disabled={!squad.length} onClick={() => start({ kind: "spar" })}>
          <Users size={14} /> {t("Спаринг з чужими агентами", "Spar with other agents")}
        </button>
        {(saved.played ?? 0) > 0 && (
          <span className="muted-sm">{t(`Перемог: ${saved.wins ?? 0} з ${saved.played}`, `Won ${saved.wins ?? 0} of ${saved.played}`)}</span>
        )}
      </div>

      <p className="arena-about arena-together">
        {t(
          "З іншою людиною в кафе: «Бій загонів» (ваш загін проти її) і «Рейд на моноліт» (удвох проти боса) — у розділі «Удвох і втрьох».",
          "With someone else in the café: «Squad battle» (your squad against theirs) and «Monolith raid» (the two of you against the boss) are under «For two or three».",
        )}
      </p>

      {fight && (
        <ArenaView
          key={fight.id}
          setup={fight.setup}
          people={[0]}
          level={level}
          sides={fight.sides}
          place={fight.place}
          {...(fight.intro ? { intro: fight.intro } : {})}
          {...(nextOf(fight.mode) ? { next: nextOf(fight.mode) } : {})}
          onEnd={(o) => ended(fight.mode, o)}
          onRetry={() => start(fight.mode)}
          onExit={() => setFight(null)}
        />
      )}
    </div>
  );
}
