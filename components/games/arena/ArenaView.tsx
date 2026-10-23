"use client";

import { memo, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bot,
  Crown,
  Crosshair,
  FastForward,
  Flame,
  Footprints,
  Gauge,
  HelpCircle,
  Heart,
  Hourglass,
  LogOut,
  ScrollText,
  Shield,
  Skull,
  Sparkles,
  Star,
  Swords,
  Users,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { type Level, decide } from "@/lib/arena/ai";
import { NET_LEVEL } from "@/lib/arena/net";
import { ALL_KINDS, type SkillDef, kindOf } from "@/lib/arena/content";
import { type Hex, area } from "@/lib/arena/hex";
import {
  type Estimate,
  METER_FULL,
  type Options,
  ROUND_CAP,
  type Setup,
  apply,
  estimate,
  kindDef,
  options,
  roundOrder,
  speedOf,
  startBattle,
  still,
} from "@/lib/arena/rules";
import { BAD, type Battle, type Beat, type Command, type Goal, type StatusId, type Team, type Unit } from "@/lib/arena/types";
import { type Two, type Ui, tr, useTr, useUi } from "@/lib/i18n";
import { setSfxOn, sfx, unlockSfx, useSfxOn } from "@/lib/live/sfx";
import FullscreenButton from "../FullscreenButton";
import { hexXZ } from "./geo";
import { KindIcon, SkillIcon } from "./icons";
import { faceOf } from "./portraits";
import { PLACES, type PlaceId } from "./scenery";
import { type Marks, Stage } from "./stage";

/*
 * One battle on the screen: the 3D field, and round it what a tactics game shows: whose turn it is and who comes
 * next, the fighter's card, its skill and its side's ultimate, what a blow will do before it is struck, the log, and
 * the result. A person plays one side (or both), the bot the other; every command goes through the rules, and the
 * field plays back what they say happened.
 */

export const TEAM_COLORS: [string, string] = ["#4f9dff", "#ff5a5a"];

export interface Intro {
  title: string;
  story: string;
  tip: string;
}

/** A battle with another person in the café. */
export interface Net {
  /** who gives a unit its commands now */
  who(b: Battle, id: number): "me" | "peer" | "bot";
  /** the people's commands so far, both sides', in order */
  moves: Command[];
  send(cmd: Command): void;
  /** the other person's name */
  peer: string;
  /** the other person has left: the bot plays their fighters */
  gone: boolean;
  /** the battle so far, when this screen opens after it began: replayed, with how many of `moves` it took */
  resume?: { battle: Battle; used: number };
}

export interface Outcome {
  winner: Team | "draw";
  rounds: number;
  /** the person's own fighters that fell, the summoned not counted */
  lost: number;
  /** who on the person's side dealt the most, and how much */
  mvp: { id: number; name: string; amount: number } | null;
  /** the person's side's heaviest single blow */
  best: { name: string; amount: number } | null;
  /** the three stars: won, won with no one lost, won fast (or, holding out, with most of the side's health left) */
  stars: [boolean, boolean, boolean];
  /** the person's side, the most damage first */
  crew: { id: number; dealt: number }[];
}

/** a battle won within this many rounds earns its third star */
const PAR = 6;
/** how long the two sides face each other before the battle */
const VS_SECS = 2.2;

type Mode = "act" | "skill" | "ult";

interface Aim {
  cmd: Command;
  marks: Marks;
  est: Estimate | null;
  cursor: "move" | "melee" | "shot" | "cast";
  /** a skill's name, for the hint by the pointer */
  skill?: SkillDef;
}

interface Pointer {
  h: Hex | null;
  x: number;
  z: number;
  /** on the canvas, px; negative when the pointer has left it */
  sx: number;
  sy: number;
}

interface Line {
  id: number;
  text: string;
  tone: "round" | "hit" | "die" | "cast" | "info" | "good" | "bad";
  team?: Team;
}

interface Banner {
  id: number;
  text: string;
  sub?: string;
  tone: "round" | "ult" | "win" | "lose" | "boss";
}

const STATUS: Record<StatusId, Two> = {
  marked: { uk: "Позначений", en: "Marked" },
  stun: { uk: "Оглушений", en: "Stunned" },
  slow: { uk: "Сповільнений", en: "Slowed" },
  silence: { uk: "Без умінь", en: "Silenced" },
  root: { uk: "Прикутий", en: "Rooted" },
  taunted: { uk: "Спровокований", en: "Taunted" },
  inspired: { uk: "Натхненний", en: "Inspired" },
  shield: { uk: "Щит", en: "Shield" },
  hasted: { uk: "Прискорений", en: "Hasted" },
  enraged: { uk: "Лють", en: "Enraged" },
};

const LOG_MAX = 80;
/** how many turns the queue shows, this round's and then the next one's */
const QUEUE_LEN = 13;
const SPEEDS = [1, 2, 4];
const SPEED_KEY = "relay.arena.speed";

function savedSpeed(): number {
  try {
    const n = Number(localStorage.getItem(SPEED_KEY));
    return SPEEDS.includes(n) ? n : 1;
  } catch {
    return 1;
  }
}

/** A fighter's name on the screen: an agent by its café name, a bug or a summoned one by what it is. */
export function nameOf(u: Unit, ui: Ui): string {
  const k = kindDef(u);
  return k.bug || u.summoned || still(u) ? k.name[ui] : u.name;
}

function skillOf(id: string): SkillDef | undefined {
  for (const k of ALL_KINDS) {
    if (k.skill?.id === id) return k.skill;
    if (k.ult?.id === id) return k.ult;
  }
  return undefined;
}

/** Of the hexes a blow can be struck from, the one the pointer leans towards: the side of the enemy it points at. */
function nearest(list: Hex[], x: number, z: number): Hex {
  let best = list[0];
  let bd = Infinity;
  for (const h of list) {
    const [hx, hz] = hexXZ(h);
    const d = (hx - x) ** 2 + (hz - z) ** 2;
    if (d < bd) {
      bd = d;
      best = h;
    }
  }
  return best;
}

const pathTo = (o: Options, from: Hex): Hex[] => (from === o.unit.hex ? [] : (o.moves.get(from) ?? []));

/** What the board shows before the pointer picks anything. */
function baseMarks(b: Battle, o: Options, mode: Mode): Marks {
  if (mode === "act") {
    const foes = new Set([...o.melee.keys(), ...o.shots]);
    return { moves: [...o.moves.keys()], foes: [...foes].map((id) => b.units[id].hex), from: o.unit.hex };
  }
  const c = mode === "skill" ? o.skill : o.ult;
  if (!c) return {};
  const hexes = [...c.targets.keys()];
  if (c.def.aim === "enemy") return { foes: hexes, from: o.unit.hex };
  if (c.def.aim === "hex") return { moves: hexes, from: o.unit.hex };
  return { friends: hexes, from: o.unit.hex };
}

/** What a click at this point would do, and how the board shows it. */
function aimAt(b: Battle, o: Options, mode: Mode, p: Pointer): Aim | null {
  const { h, x, z } = p;
  if (h == null) return null;
  const u = o.unit;
  const base = baseMarks(b, o, mode);
  if (mode === "act") {
    const t = b.units.find((v) => !v.dead && v.hex === h);
    if (t && t.team !== u.team) {
      if (o.shots.includes(t.id)) {
        const cmd: Command = { t: "attack", target: t.id };
        return { cmd, marks: { ...base, foes: [t.hex] }, est: estimate(b, cmd), cursor: "shot" };
      }
      const from = o.melee.get(t.id);
      if (!from) return null;
      const f = nearest(from, x, z);
      const cmd: Command = { t: "attack", target: t.id, from: f };
      return { cmd, marks: { ...base, path: pathTo(o, f), from: f, foes: [t.hex] }, est: estimate(b, cmd), cursor: "melee" };
    }
    const path = o.moves.get(h);
    if (!path) return null;
    return { cmd: { t: "move", to: h }, marks: { ...base, path }, est: null, cursor: "move" };
  }
  const c = mode === "skill" ? o.skill : o.ult;
  if (!c?.ready || !c.targets.has(h)) return null;
  const from = c.targets.get(h);
  let cmd: Command;
  let path: Hex[] = [];
  let stand = u.hex;
  if (mode === "ult") cmd = c.def.aim === "self" ? { t: "ult" } : { t: "ult", at: h };
  else if (from) {
    stand = nearest(from, x, z);
    path = pathTo(o, stand);
    cmd = { t: "skill", at: h, from: stand };
  } else cmd = { t: "skill", at: h };
  const marks: Marks = { ...base, path, from: stand };
  if (c.def.area) marks.area = area(h, c.def.area);
  if (c.def.aim === "enemy") marks.foes = [h];
  if (c.def.aim === "ally" || c.def.aim === "self") marks.friends = [h];
  return { cmd, marks, est: estimate(b, cmd), cursor: "cast", skill: c.def };
}

function goalText(g: Goal, round: number, ui: Ui): string {
  if (g.kind === "survive") return tr(ui, `Протримайтеся: раунд ${round} з ${g.rounds}`, `Hold out: round ${round} of ${g.rounds}`);
  if (g.kind === "protect")
    return tr(ui, `Захистіть прод: раунд ${round} з ${g.rounds}`, `Keep prod alive: round ${round} of ${g.rounds}`);
  return tr(ui, `Раунд ${round} з ${ROUND_CAP}`, `Round ${round} of ${ROUND_CAP}`);
}

export default function ArenaView({
  setup,
  people,
  level,
  sides,
  place,
  intro,
  next,
  net,
  onEnd,
  onRetry,
  onExit,
}: {
  setup: Setup;
  /** the sides a person plays; the bot plays the rest */
  people: Team[];
  level: Level;
  /** what each side is called on the screen */
  sides: [string, string];
  /** where the battle is fought */
  place: PlaceId;
  intro?: Intro;
  /** the battle after this one, offered once this one is won */
  next?: { name: string; go(): void };
  net?: Net;
  onEnd(o: Outcome): void;
  /** another battle like this one; left out, there is no button for it */
  onRetry?(): void;
  onExit(): void;
}) {
  const ui = useUi();
  const t = useTr();
  const sound = useSfxOn();
  const root = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const logBox = useRef<HTMLOListElement>(null);
  const stage = useRef<Stage | null>(null);
  /** the battle as it stands, ahead of the screen while beats still play */
  const battle = useRef<Battle | null>(null);
  const opening = useRef<{ battle: Battle; beats: Beat[] } | null>(null);
  const busyRef = useRef(true);
  const timer = useRef(0);
  const bannerTimer = useRef(0);
  const dealt = useRef(new Map<number, number>());
  /** who called each summoned unit in: what it deals counts as theirs */
  const owners = useRef(new Map<number, number>());
  const actor = useRef<number | null>(null);
  const best = useRef<[{ who: number; amount: number } | null, { who: number; amount: number } | null]>([null, null]);
  const lineId = useRef(0);
  // the battle as it begins, its first round's beats still to play: the screen shows its fighters from the start
  const [first] = useState(() => (net?.resume ? { battle: net.resume.battle, beats: [] } : startBattle(setup)));
  /** how many of the people's commands this screen has played, in a battle with another person */
  const used = useRef(net?.resume?.used ?? 0);
  const [shown, setShown] = useState<Battle | null>(first.battle);
  /** how many commands' beats have played: each time, the turn goes on to whoever has it */
  const [played, setPlayed] = useState(0);
  const [busy, setBusy] = useState(true);
  const [mode, setMode] = useState<Mode>("act");
  const [pointer, setPointer] = useState<Pointer | null>(null);
  const [inspect, setInspect] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [started, setStarted] = useState(!intro);
  // the two sides face each other for a moment while the camera sweeps in
  const [vs, setVs] = useState(true);
  const vsTimer = useRef(0);
  const [speed, setSpeed] = useState(savedSpeed);
  const [result, setResult] = useState<Outcome | null>(null);
  const [quit, setQuit] = useState(false);
  const [help, setHelp] = useState(false);
  const [logOpen, setLogOpen] = useState(true);
  // the bot plays the person's side too, until they take it back
  const [auto, setAuto] = useState(false);
  const autoRef = useRef(false);
  const me: Team = people[0] ?? 0;
  /** who gives a unit its commands: the person here, the other person, or the bot */
  const control = (b: Battle, id: number): "me" | "peer" | "bot" =>
    net ? net.who(b, id) : people.includes(b.units[id].team) ? "me" : "bot";

  const say = (text: string, tone: Line["tone"], team?: Team) => {
    const id = ++lineId.current;
    setLines((ls) => [...ls.slice(-(LOG_MAX - 1)), { id, text, tone, ...(team != null ? { team } : {}) }]);
  };

  const shout = (text: string, tone: Banner["tone"], sub?: string) => {
    window.clearTimeout(bannerTimer.current);
    setBanner({ id: ++lineId.current, text, tone, ...(sub ? { sub } : {}) });
    bannerTimer.current = window.setTimeout(() => setBanner(null), tone === "round" ? 1100 : 1800);
  };

  const finish = (b: Battle) => {
    const mvp = [...dealt.current]
      .filter(([id]) => b.units[id].team === me)
      .sort((x, y) => y[1] - x[1])[0];
    const top = best.current[me];
    const ours = b.units.filter((u) => u.team === me && !u.summoned);
    const lost = ours.filter((u) => u.dead).length;
    const won = b.winner === me;
    const health = ours.reduce((n, u) => n + Math.max(0, u.hp), 0) / Math.max(1, ours.reduce((n, u) => n + u.maxHp, 0));
    const out: Outcome = {
      winner: b.winner ?? "draw",
      rounds: b.round,
      lost,
      mvp: mvp ? { id: mvp[0], name: nameOf(b.units[mvp[0]], ui), amount: mvp[1] } : null,
      best: top ? { name: nameOf(b.units[top.who], ui), amount: top.amount } : null,
      stars: [won, won && lost === 0, won && (b.goal.kind === "wipe" ? b.round <= PAR : health > 0.5)],
      crew: ours.map((u) => ({ id: u.id, dealt: dealt.current.get(u.id) ?? 0 })).sort((x, y) => y.dealt - x.dealt),
    };
    sfx(out.winner === "draw" ? "draw" : people.includes(out.winner) ? "win" : "lose");
    // the stars ring in one by one as they light up on the screen
    if (people.length === 1) out.stars.forEach((got, i) => void (got && window.setTimeout(() => sfx("star"), 900 + i * 320)));
    setResult(out);
    onEnd(out);
  };

  // ---------- what the field tells us ----------

  const onBeat = (e: Beat, b: Battle) => {
    const n = (id: number) => nameOf(b.units[id], ui);
    const team = (id: number) => b.units[id].team;
    switch (e.e) {
      case "turn":
        actor.current = e.unit;
        return;
      case "round":
        shout(t(`Раунд ${e.round}`, `Round ${e.round}`), "round");
        say(t(`Раунд ${e.round}`, `Round ${e.round}`), "round");
        return;
      case "cast": {
        const def = skillOf(e.skill);
        if (!def) return;
        say(`${n(e.unit)}: ${def.name[ui]}`, "cast", team(e.unit));
        if (kindDef(b.units[e.unit]).ult?.id === e.skill) shout(def.name[ui], "ult", n(e.unit));
        return;
      }
      case "damage": {
        if (e.miss) {
          const text =
            e.from != null
              ? t(`${n(e.from)} промахується по ${n(e.unit)}`, `${n(e.from)} misses ${n(e.unit)}`)
              : t(`${n(e.unit)} ухиляється`, `${n(e.unit)} dodges`);
          return say(text, "info", e.from != null ? team(e.from) : team(e.unit));
        }
        if (e.amount <= 0) return;
        const by = e.from != null ? `${n(e.from)} → ` : "";
        const crit = e.crit ? t(", критично", ", critical") : "";
        say(`${by}${n(e.unit)}: −${e.amount}${crit}`, "hit", e.from != null ? team(e.from) : undefined);
        if (e.from != null) {
          const who = owners.current.get(e.from) ?? e.from;
          dealt.current.set(who, (dealt.current.get(who) ?? 0) + e.amount);
          const side = team(e.from);
          const top = best.current[side];
          if (!top || e.amount > top.amount) best.current[side] = { who: e.from, amount: e.amount };
        }
        return;
      }
      case "heal":
        return say(`${n(e.unit)} +${e.amount}`, "good", team(e.unit));
      case "die":
        return say(t(`${n(e.unit)} падає`, `${n(e.unit)} falls`), "die", team(e.unit));
      case "saved":
        return say(t(`${n(e.unit)}: відкат, 1 HP`, `${n(e.unit)}: rolled back, 1 HP`), "good", team(e.unit));
      case "spawn": {
        const by = actor.current;
        if (by != null && team(by) === team(e.unit)) owners.current.set(e.unit, owners.current.get(by) ?? by);
        return say(t(`${n(e.unit)} з'являється`, `${n(e.unit)} appears`), "cast", team(e.unit));
      }
      case "strike":
        return say(
          t(`${n(e.strike.by)}: удар упаде на початку раунду`, `${n(e.strike.by)}: it lands at the round's start`),
          "cast",
          e.strike.team,
        );
      case "wait":
        return say(t(`${n(e.unit)} чекає`, `${n(e.unit)} waits`), "info", team(e.unit));
      case "defend":
        return say(t(`${n(e.unit)} в обороні`, `${n(e.unit)} defends`), "info", team(e.unit));
      case "stunned":
        return say(t(`${n(e.unit)} оглушений, хід пропущено`, `${n(e.unit)} is stunned, turn lost`), "bad", team(e.unit));
      case "status":
        if (e.on) say(`${n(e.unit)}: ${STATUS[e.status][ui].toLowerCase()}`, BAD.includes(e.status) ? "bad" : "good", team(e.unit));
        return;
      case "phase":
        return shout(
          e.phase === 1 ? t("Моноліт кличе підмогу", "The monolith calls for help") : t("Моноліт лютує!", "The monolith rages!"),
          "boss",
          n(e.unit),
        );
      case "over": {
        const won = e.winner !== "draw" && people.includes(e.winner);
        const text =
          e.winner === "draw"
            ? t("Нічия", "A draw")
            : people.length > 1
              ? t(`Перемогли ${sides[e.winner]}`, `${sides[e.winner]} win`)
              : won
                ? t("Перемога!", "Victory!")
                : t("Поразка", "Defeat");
        shout(text, won || people.length > 1 ? "win" : "lose");
        return say(text, "round");
      }
    }
  };

  /** Plays one command's beats, then hands the turn to whoever has it: the person, or the bot after a breath. */
  const play = async (beats: Beat[], after: Battle) => {
    const st = stage.current;
    if (!st) return;
    busyRef.current = true;
    setBusy(true);
    await st.show(beats, after, (e) => onBeat(e, after));
    if (stage.current !== st) return;
    st.speed = savedSpeed();
    busyRef.current = false;
    setBusy(false);
    setShown(after);
    // the turn goes on from the effect below, which sees what came in while the beats played
    setPlayed((n) => n + 1);
    if (after.winner != null) return finish(after);
  };

  /** Plays a command for the active unit; one the person here gave also goes to the other person, if there is one. */
  const run = (cmd: Command, by: "me" | "peer" | "bot" = "me"): boolean => {
    const b = battle.current;
    if (!b || busyRef.current || b.winner != null) return false;
    const r = apply(b, cmd);
    if (!r) {
      sfx("illegal");
      return false;
    }
    if (net && by !== "bot") {
      used.current += 1;
      if (by === "me") net.send(cmd);
    }
    battle.current = r.battle;
    setMode("act");
    setInspect(null);
    void play(r.beats, r.battle);
    return true;
  };

  /** Hands the turn on: the person here waits to be asked, the other person's command is played once it has come. */
  const nudge = (b: Battle) => {
    const st = stage.current;
    const a = b.active;
    if (!st || a == null || b.winner != null || busyRef.current) return;
    const who = control(b, a);
    if (who === "peer") {
      const cmd = net?.moves[used.current];
      if (cmd) run(cmd, "peer");
      return;
    }
    if (who === "me" && !autoRef.current) {
      sfx("select");
      return;
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (stage.current !== st || battle.current !== b || busyRef.current) return;
      if (who === "me" && !autoRef.current) return sfx("select");
      run(decide(b, who === "me" ? "hard" : net ? NET_LEVEL : level), who);
    }, 280 / st.clock.speed);
  };
  // the beats have played, the other person's command came, or they left and the bot took their side over
  const nudgeEv = useEffectEvent(() => {
    const b = battle.current;
    if (b && b === shown) nudge(b);
  });
  const heard = net?.moves.length ?? 0;
  const gone = !!net?.gone;
  useEffect(() => nudgeEv(), [heard, gone, played]);
  const leftEv = useEffectEvent(() => {
    if (!net || result) return;
    const text = t(`${net.peer} вийшов`, `${net.peer} left`);
    shout(text, "boss", t("його бійцями тепер грає бот", "the bot plays their fighters now"));
    say(`${text}: ${t("його бійцями грає бот", "the bot plays their fighters")}`, "info");
  });
  useEffect(() => {
    if (gone) leftEv();
  }, [gone]);

  const begin = () => {
    const o = opening.current;
    opening.current = null;
    if (o) void play(o.beats, o.battle);
  };

  // ---------- what the person may do ----------

  const mine = !!shown && shown.winner == null && shown.active != null && control(shown, shown.active) === "me";
  const opts = useMemo(
    () => (shown && mine && !busy && started && !auto ? options(shown) : null),
    [shown, mine, busy, started, auto],
  );
  const aim = useMemo(() => (shown && opts && pointer ? aimAt(shown, opts, mode, pointer) : null), [shown, opts, mode, pointer]);

  // ---------- the field ----------

  const hoverEv = useEffectEvent((h: Hex | null, x: number, z: number, sx: number, sy: number) => {
    setPointer(sx < 0 ? null : { h, x, z, sx, sy });
  });

  const clickEv = useEffectEvent((h: Hex | null, x: number, z: number, right: boolean, sx: number, sy: number) => {
    unlockSfx();
    const b = shown;
    if (!b || !started || result) return;
    const at = h != null ? b.units.find((u) => !u.dead && u.hex === h) : undefined;
    if (right) {
      if (mode !== "act") setMode("act");
      else setInspect(at && at.id !== inspect ? at.id : null);
      return;
    }
    if (!opts) return setInspect(at?.id ?? null);
    // a tap with no pointer over the field first (a touch screen) shows what it would do; the next tap does it
    if (pointer?.h !== h) return setPointer({ h, x, z, sx, sy });
    const a = aimAt(b, opts, mode, { h, x, z, sx, sy });
    if (a) run(a.cmd);
    else if (at) setInspect(at.id === inspect ? null : at.id);
    else if (mode !== "act") setMode("act");
  });

  const wordsEv = useEffectEvent(() => ({
    miss: t("мимо", "miss"),
    saved: t("відкат!", "rollback!"),
    wait: t("чекає", "waits"),
    defend: t("оборона", "defend"),
    stunned: t("оглушений", "stunned"),
  }));

  const endVs = () => {
    window.clearTimeout(vsTimer.current);
    setVs(false);
    if (started) begin();
  };
  const endVsEv = useEffectEvent(endVs);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const st = new Stage({
      host: el,
      words: wordsEv(),
      colors: TEAM_COLORS,
      onHover: (h, x, z, sx, sy) => hoverEv(h, x, z, sx, sy),
      onClick: (h, x, z, right, sx, sy) => clickEv(h, x, z, right, sx, sy),
    });
    st.speed = savedSpeed();
    stage.current = st;
    battle.current = first.battle;
    opening.current = first;
    st.load(first.battle, place);
    st.flyIn(VS_SECS + 0.4);
    sfx("ult");
    vsTimer.current = window.setTimeout(() => endVsEv(), VS_SECS * 1000);
    return () => {
      window.clearTimeout(vsTimer.current);
      window.clearTimeout(timer.current);
      window.clearTimeout(bannerTimer.current);
      stage.current = null;
      st.dispose();
    };
  }, [first, place]);

  useEffect(() => {
    const st = stage.current;
    if (!st) return;
    if (!shown || !opts) st.setMarks({});
    else st.setMarks({ ...(aim ? aim.marks : baseMarks(shown, opts, mode)), hover: pointer?.h ?? null });
    const e = aim?.est;
    st.forecast(
      e
        ? [
            { id: e.target, min: e.min, max: e.max },
            ...(e.back && opts ? [{ id: opts.unit.id, min: e.back[0], max: e.back[1] }] : []),
          ]
        : [],
    );
  }, [shown, opts, aim, mode, pointer]);

  useEffect(() => {
    const box = logBox.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [lines, logOpen]);

  const pick = (which: "skill" | "ult") => {
    unlockSfx();
    const c = which === "skill" ? opts?.skill : opts?.ult;
    if (!opts || !c?.ready) return sfx("illegal");
    if (c.def.aim === "self") {
      run(which === "skill" ? { t: "skill", at: opts.unit.hex } : { t: "ult" });
      return;
    }
    sfx("select");
    setMode((m) => (m === which ? "act" : which));
  };

  const toggleAuto = () => {
    unlockSfx();
    const on = !autoRef.current;
    autoRef.current = on;
    setAuto(on);
    setMode("act");
    setInspect(null);
    const b = battle.current;
    if (on && started && b && !busyRef.current && b.winner == null && b.active != null && control(b, b.active) === "me")
      run(decide(b, "hard"));
  };

  const fastForward = () => {
    const st = stage.current;
    if (st && busyRef.current) st.speed = 12;
  };

  const changeSpeed = () => {
    const nextSpeed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(nextSpeed);
    try {
      localStorage.setItem(SPEED_KEY, String(nextSpeed));
    } catch {}
    if (stage.current) stage.current.speed = nextSpeed;
  };

  const keyEv = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      // the games' window under this one closes on Escape too: this one answers first
      e.stopPropagation();
      if (mode !== "act") setMode("act");
      else if (inspect != null) setInspect(null);
      else if (help) setHelp(false);
      else if (result) onExit();
      else setQuit((q) => !q);
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey || !started || result) return;
    if (e.code === "Digit1" || e.code === "KeyS") pick("skill");
    else if (e.code === "Digit2" || e.code === "KeyU") pick("ult");
    else if (e.code === "KeyW" && opts?.canWait) run({ t: "wait" });
    else if (e.code === "KeyD" && opts) run({ t: "defend" });
    else if (e.code === "KeyA") toggleAuto();
    else if (e.code === "Space") {
      e.preventDefault();
      fastForward();
    } else return;
  });

  useEffect(() => {
    const key = (e: KeyboardEvent) => keyEv(e);
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);

  // ---------- the screen ----------

  const b = shown;
  const active = b && b.active != null ? b.units[b.active] : null;
  const pointed = b && pointer?.h != null ? b.units.find((u) => !u.dead && u.hex === pointer.h) : undefined;
  const peek = b ? (inspect != null ? b.units[inspect] : pointed && pointed.id !== active?.id ? pointed : null) : null;
  const order = b
    ? [...new Set([b.active, ...b.queue, ...b.later])].filter((id): id is number => id != null && !b.units[id].dead)
    : [];
  // the round after this one, as things stand, to fill the queue out
  const soon = b && b.winner == null ? roundOrder(b, b.round + 1).slice(0, Math.max(0, QUEUE_LEN - order.length)) : [];
  const cursor = !opts ? "" : aim ? aim.cursor : pointer?.h != null ? "no" : "";

  const tip = (() => {
    if (!pointer || pointer.sx < 0 || !b) return null;
    if (aim?.est) {
      const e = aim.est;
      const target = b.units[e.target];
      return (
        <>
          {active && (
            <span className="ar-vs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={faceOf(active)} alt="" className={`ar-t${active.team}`} />
              {aim.skill ? <SkillIcon id={aim.skill.id} size={14} /> : aim.cursor === "shot" ? <Crosshair size={14} /> : <Swords size={14} />}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={faceOf(target)} alt="" className={`ar-t${target.team}`} />
            </span>
          )}
          {aim.skill && <b className="ar-tip-skill">{aim.skill.name[ui]}</b>}
          <span>
            {t("Шкода", "Damage")} <b>{e.min === e.max ? e.min : `${e.min}–${e.max}`}</b>
            {e.kills ? (
              <em className="kill">
                {" "}
                · <Skull size={12} /> {t("вб'є", "kills")}
              </em>
            ) : e.mayKill ? (
              <em className="kill"> · {t("може вбити", "may kill")}</em>
            ) : null}
          </span>
          {e.back && (
            <span className="back">
              {t("У відповідь", "Answer")} {e.back[0]}–{e.back[1]}
            </span>
          )}
          {e.miss != null && (
            <span className="back">
              {t("Промах", "Miss")} {Math.round(e.miss * 100)}%
            </span>
          )}
        </>
      );
    }
    if (aim?.skill) return <b className="ar-tip-skill">{aim.skill.name[ui]}</b>;
    if (pointed && aim?.cursor !== "move")
      return (
        <span>
          <b>{nameOf(pointed, ui)}</b> {pointed.hp}/{pointed.maxHp}
        </span>
      );
    return null;
  })();

  const view = (
    <div
      ref={root}
      className={`ar-root${busy ? " busy" : ""}`}
      data-cursor={cursor}
      data-mode={mode}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="ar-host" ref={host} />

      {b && (
        <div className="ar-top">
          <Side b={b} team={0} name={sides[0]} ui={ui} />
          <div className="ar-mid">
            <div className="ar-goal">
              {goalText(b.goal, Math.max(1, b.round), ui)}
              <small>{PLACES[place].name[ui]}</small>
            </div>
            <Queue
              b={b}
              order={order}
              soon={soon}
              theirs={net ? b.units.filter((u) => u.team === me && control(b, u.id) === "peer").map((u) => u.id) : []}
              ui={ui}
              onPick={(id) => setInspect(id === inspect ? null : id)}
            />
          </div>
          <Side b={b} team={1} name={sides[1]} ui={ui} />
        </div>
      )}

      <div className="ar-tools">
        <button
          className="btn btn-ic"
          onClick={changeSpeed}
          title={t("швидкість анімацій", "animation speed")}
          aria-label={t("швидкість анімацій", "animation speed")}
        >
          <Gauge size={14} /> <span className="ar-speed">{speed}×</span>
        </button>
        <button
          className={`btn btn-ic${auto ? " on" : ""}`}
          onClick={toggleAuto}
          disabled={!started || !!result}
          title={auto ? t("авто-бій: вимкнути (A)", "auto battle: off (A)") : t("авто-бій: бот грає за вас (A)", "auto battle: the bot plays for you (A)")}
          aria-label={t("авто-бій", "auto battle")}
          aria-pressed={auto}
        >
          <Bot size={14} />
        </button>
        <button
          className="btn btn-ic"
          onClick={fastForward}
          disabled={!busy}
          title={t("промотати (пробіл)", "fast-forward (space)")}
          aria-label={t("промотати", "fast-forward")}
        >
          <FastForward size={14} />
        </button>
        <button
          className="btn btn-ic"
          onClick={() => {
            unlockSfx();
            setSfxOn(!sound);
          }}
          title={sound ? t("вимкнути звук", "sound off") : t("увімкнути звук", "sound on")}
          aria-label={sound ? t("вимкнути звук", "sound off") : t("увімкнути звук", "sound on")}
        >
          {sound ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </button>
        <button
          className={`btn btn-ic${logOpen ? " on" : ""}`}
          onClick={() => setLogOpen((v) => !v)}
          title={t("журнал бою", "battle log")}
          aria-label={t("журнал бою", "battle log")}
        >
          <ScrollText size={14} />
        </button>
        <button
          className={`btn btn-ic${help ? " on" : ""}`}
          onClick={() => setHelp((v) => !v)}
          title={t("як грати", "how to play")}
          aria-label={t("як грати", "how to play")}
        >
          <HelpCircle size={14} />
        </button>
        <FullscreenButton target={root} />
        <button
          className="btn btn-ic"
          onClick={() => (result ? onExit() : setQuit((q) => !q))}
          title={t("вийти з бою", "leave the battle")}
          aria-label={t("вийти з бою", "leave the battle")}
        >
          <LogOut size={14} />
        </button>
      </div>

      {banner && (
        <div key={banner.id} className={`ar-banner ar-banner-${banner.tone}`}>
          <b>{banner.text}</b>
          {banner.sub && <small>{banner.sub}</small>}
        </div>
      )}

      {tip && pointer && (
        <div className="ar-tip" style={{ left: pointer.sx + 18, top: pointer.sy + 20 }}>
          {tip}
        </div>
      )}

      {b && peek && <Card b={b} u={peek} ui={ui} className="ar-peek" />}

      {b && (
        <div className="ar-bottom">
          {active && <Card b={b} u={active} ui={ui} className="ar-now" />}
          {opts ? (
            <div className="ar-actions">
              {mode !== "act" && (
                <div className="ar-hint">{t("Оберіть ціль · правий клік чи Esc скасує", "Pick a target · right click or Esc cancels")}</div>
              )}
              {opts.skill && (
                <button
                  className={`ar-act ar-act-skill${mode === "skill" ? " on" : ""}`}
                  disabled={!opts.skill.ready}
                  onClick={() => pick("skill")}
                  style={
                    {
                      "--cd": opts.skill.why === "cooldown" ? `${(opts.unit.cooldown / Math.max(1, opts.skill.def.cooldown)) * 360}deg` : "0deg",
                    } as React.CSSProperties
                  }
                  title={
                    opts.skill.def.text[ui] +
                    (opts.skill.why === "noTarget" ? t("\n\nЗараз немає до кого дістати.", "\n\nNothing in reach right now.") : "")
                  }
                >
                  <SkillIcon id={opts.skill.def.id} size={20} />
                  <span>{opts.skill.def.name[ui]}</span>
                  {opts.skill.why === "cooldown" ? (
                    <em className="ar-cd">{opts.unit.cooldown}</em>
                  ) : opts.skill.why === "silenced" ? (
                    <em className="ar-cd">×</em>
                  ) : opts.skill.why === "noTarget" ? (
                    <em className="ar-cd">—</em>
                  ) : (
                    <kbd>1</kbd>
                  )}
                </button>
              )}
              {opts.ult && (
                <button
                  className={`ar-act ar-act-ult${mode === "ult" ? " on" : ""}${opts.ult.ready ? " ready" : ""}`}
                  disabled={!opts.ult.ready}
                  onClick={() => pick("ult")}
                  title={opts.ult.def.text[ui]}
                  style={{ "--fill": `${Math.min(100, (b.meter[opts.unit.team] / METER_FULL) * 100)}%` } as React.CSSProperties}
                >
                  <SkillIcon id={opts.ult.def.id} size={20} />
                  <span>{opts.ult.def.name[ui]}</span>
                  {opts.ult.ready ? <kbd>2</kbd> : <em className="ar-cd">{Math.floor(b.meter[opts.unit.team])}%</em>}
                </button>
              )}
              <button className="ar-act" disabled={!opts.canWait} onClick={() => run({ t: "wait" })} title={t("походити пізніше в цьому раунді", "act later this round")}>
                <Hourglass size={20} />
                <span>{t("Чекати", "Wait")}</span>
                <kbd>W</kbd>
              </button>
              <button className="ar-act" onClick={() => run({ t: "defend" })} title={t("до свого ходу −30% шкоди", "−30% damage until its next turn")}>
                <Shield size={20} />
                <span>{t("Оборона", "Defend")}</span>
                <kbd>D</kbd>
              </button>
            </div>
          ) : (
            <div className="ar-actions ar-wait">
              {b.winner == null &&
                started &&
                (busy
                  ? t("…", "…")
                  : net && b.active != null && control(b, b.active) === "peer"
                    ? t(`Ходить ${net.peer}…`, `${net.peer} is moving…`)
                    : t("Хід суперника", "The other side's turn"))}
            </div>
          )}
          {logOpen && <Log lines={lines} box={logBox} />}
        </div>
      )}

      {help && (
        <div className="ar-help" onClick={() => setHelp(false)}>
          <b>{t("Як грати", "How to play")}</b>
          <ul>
            <li>
              <Footprints size={13} /> {t("Синє: куди можна піти. Клік туди — хід.", "Blue: where it can go. Click there to move.")}
            </li>
            <li>
              <Swords size={13} />{" "}
              {t(
                "Клік по ворогу — удар. Той бік ворога, куди вказує курсор, — звідки буде удар. Ворог відповідає раз за раунд.",
                "Click an enemy to strike. The side of it the pointer is on is where the blow comes from. It answers once a round.",
              )}
            </li>
            <li>
              <Crosshair size={13} />{" "}
              {t(
                "Стрілки стріляють, коли поруч немає ворога: повна шкода в межах дальності, далі — половина. Пострілу не відповідають.",
                "Shooters shoot when no enemy stands next to them: full damage within range, half beyond. Shots get no answer.",
              )}
            </li>
            <li>
              <Sparkles size={13} /> {t("1 — уміння, потім відновлюється кілька ходів.", "1: the skill; it then needs a few turns.")}
            </li>
            <li>
              <Zap size={13} />{" "}
              {t(
                "2 — ультимейт лідера: шкала заряджається від шкоди з обох боків.",
                "2: the leader's ultimate; the bar charges with damage on both sides.",
              )}
            </li>
            <li>
              <Hourglass size={13} /> {t("W — чекати: піти останнім у раунді. D — оборона.", "W: wait and act last this round. D: defend.")}
            </li>
            <li>
              <Bot size={13} /> {t("A — авто-бій: бот грає за вас, доки не вимкнете.", "A: auto battle; the bot plays for you until you turn it off.")}
            </li>
            <li>
              <Flame size={13} />{" "}
              {t(
                "Червоні клітинки блимають — там вибухне на початку раунду. Правий клік — картка бійця.",
                "Blinking red hexes blow up at the round's start. Right click shows a fighter's card.",
              )}
            </li>
          </ul>
        </div>
      )}

      {vs && shown && (
        <div className="ar-vs-intro" onClick={endVs}>
          <VsSide b={shown} team={0} name={sides[0]} ui={ui} />
          <div className="ar-vs-mid">
            {intro && <small>{intro.title}</small>}
            <span>VS</span>
            <small>{PLACES[place].name[ui]}</small>
          </div>
          <VsSide b={shown} team={1} name={sides[1]} ui={ui} />
        </div>
      )}

      {intro && !started && !vs && (
        <div className="ar-modal">
          <div className="ar-panel">
            <h3>{intro.title}</h3>
            <p>{intro.story}</p>
            <Foes setup={setup} ui={ui} />
            <p className="ar-tipline">
              <HelpCircle size={13} /> {intro.tip}
            </p>
            <div className="ar-panel-btns">
              <button className="btn" onClick={onExit}>
                {t("Назад", "Back")}
              </button>
              <button
                className="btn btn-primary"
                autoFocus
                onClick={() => {
                  unlockSfx();
                  setStarted(true);
                  begin();
                }}
              >
                <Swords size={14} /> {t("До бою", "To battle")}
              </button>
            </div>
          </div>
        </div>
      )}

      {quit && !result && (
        <div className="ar-modal" onClick={() => setQuit(false)}>
          <div className="ar-panel ar-panel-sm" onClick={(e) => e.stopPropagation()}>
            <h3>{t("Покинути бій?", "Leave the battle?")}</h3>
            <p>{t("Бій не зарахується.", "The battle will not count.")}</p>
            <div className="ar-panel-btns">
              <button className="btn" autoFocus onClick={() => setQuit(false)}>
                {t("Битися далі", "Keep fighting")}
              </button>
              <button className="btn" onClick={onExit}>
                <LogOut size={14} /> {t("Вийти", "Leave")}
              </button>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="ar-modal">
          <div className={`ar-panel ar-result ${result.winner !== "draw" && people.includes(result.winner) ? "won" : "lost"}`}>
            {people.length === 1 && (
              <div className="ar-stars" aria-label={t(`Зірок: ${result.stars.filter(Boolean).length} з 3`, `${result.stars.filter(Boolean).length} of 3 stars`)}>
                {result.stars.map((got, i) => (
                  <Star key={i} className={got ? "on" : ""} style={{ "--i": i } as React.CSSProperties} size={i === 1 ? 46 : 36} />
                ))}
              </div>
            )}
            <h3>
              {result.winner === "draw"
                ? t("Нічия", "A draw")
                : people.length > 1
                  ? t(`Перемогли ${sides[result.winner]}`, `${sides[result.winner]} win`)
                  : people.includes(result.winner)
                    ? t("Перемога", "Victory")
                    : t("Поразка", "Defeat")}
            </h3>
            {people.length === 1 && (
              <ul className="ar-stars-why">
                {result.stars.map((got, i) => (
                  <li key={i} className={got ? "on" : ""}>
                    <Star size={12} />
                    {
                      [
                        t("Перемога", "Victory"),
                        t("Без втрат", "No one lost"),
                        shown?.goal.kind === "wipe"
                          ? t(`За ${PAR} раундів`, `Within ${PAR} rounds`)
                          : t("Більше половини здоров'я", "Over half the health kept"),
                      ][i]
                    }
                  </li>
                ))}
              </ul>
            )}
            {shown && (
              <ul className="ar-crew">
                {result.crew.map(({ id, dealt }) => {
                  const u = shown.units[id];
                  const most = Math.max(1, result.crew[0]?.dealt ?? 1);
                  return (
                    <li key={id} className={`${u.dead ? "dead" : ""}${result.mvp?.id === id ? " mvp" : ""}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={faceOf(u)} alt="" />
                      {result.mvp?.id === id && <Crown className="ar-crew-crown" size={14} />}
                      {u.dead && <Skull className="ar-crew-dead" size={13} />}
                      <b>{nameOf(u, ui)}</b>
                      <span className="ar-crew-bar">
                        <i style={{ width: `${(dealt / most) * 100}%` }} />
                      </span>
                      <small>{dealt}</small>
                    </li>
                  );
                })}
              </ul>
            )}
            <dl>
              <dt>{t("Раундів", "Rounds")}</dt>
              <dd>{result.rounds}</dd>
              <dt>{t("Втрачено бійців", "Fighters lost")}</dt>
              <dd>{result.lost}</dd>
              {result.best && (
                <>
                  <dt>{t("Найсильніший удар", "Heaviest blow")}</dt>
                  <dd>
                    {result.best.name}, {result.best.amount}
                  </dd>
                </>
              )}
            </dl>
            <div className="ar-panel-btns">
              <button className="btn" onClick={onExit}>
                {t("До меню", "Menu")}
              </button>
              {onRetry && (
                <button className="btn" onClick={onRetry}>
                  {t("Ще раз", "Again")}
                </button>
              )}
              {next && result.winner !== "draw" && people.includes(result.winner) && (
                <button className="btn btn-primary" autoFocus onClick={next.go}>
                  {t("Далі:", "Next:")} {next.name}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(view, document.body);
}

/** A side's face: its leader, or the biggest of a side that has none. */
function leadOf(b: Battle, team: Team): Unit | undefined {
  const all = b.units.filter((u) => u.team === team && !u.summoned && !still(u));
  return all.find((u) => u.leader) ?? [...all].sort((x, y) => y.maxHp - x.maxHp)[0];
}

/** One side as the battle opens: its leader's face, big, its name and how many it brings. */
function VsSide({ b, team, name, ui }: { b: Battle; team: Team; name: string; ui: Ui }) {
  const lead = leadOf(b, team);
  const n = b.units.filter((u) => u.team === team && !u.summoned && !still(u)).length;
  return (
    <div className={`ar-vs-side ar-t${team}`}>
      {lead && (
        <span className="ar-vs-face" style={{ "--c": lead.color } as React.CSSProperties}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={faceOf(lead)} alt="" />
          <KindIcon kind={lead.kind} size={16} />
        </span>
      )}
      <b>{name}</b>
      <small>
        {lead && nameOf(lead, ui)} · {tr(ui, `бійців: ${n}`, `${n} fighters`)}
      </small>
    </div>
  );
}

/** One side's banner: its leader's face, its name, how many stand and how much health is left, its ultimate's bar. */
function Side({ b, team, name, ui }: { b: Battle; team: Team; name: string; ui: Ui }) {
  const all = b.units.filter((u) => u.team === team && !u.summoned && !still(u));
  const standing = b.units.filter((u) => u.team === team && !u.dead);
  const lead = leadOf(b, team);
  const ult = lead?.leader ? kindDef(lead).ult : undefined;
  const k = Math.min(1, b.meter[team] / METER_FULL);
  const hp = standing.reduce((n, u) => n + Math.max(0, u.hp), 0);
  const max = Math.max(1, all.reduce((n, u) => n + u.maxHp, 0));
  return (
    <div className={`ar-side ar-t${team}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {lead && <img className={`ar-side-face${lead.dead ? " dead" : ""}`} src={faceOf(lead)} alt="" />}
      <div className="ar-side-txt">
        <b>{name}</b>
        <span className="ar-side-hp" title={`${hp} HP`}>
          <i style={{ width: `${Math.min(1, hp / max) * 100}%` }} />
        </span>
        <small>
          <Users size={11} /> {standing.length} <Heart size={11} /> {hp}
        </small>
      </div>
      {ult && (
        <span className={`ar-meter${k >= 1 ? " full" : ""}`} title={`${ult.name[ui]}: ${Math.floor(k * 100)}%`}>
          <i style={{ width: `${k * 100}%` }} />
          <em>
            <SkillIcon id={ult.id} size={11} /> {ult.name[ui]}
          </em>
        </span>
      )}
    </div>
  );
}

/** One turn in the queue: the fighter's face on its side's colour, its health under it. */
function Turn({
  u,
  now,
  later,
  soon,
  peer,
  ui,
  onPick,
}: {
  u: Unit;
  now?: boolean;
  later?: boolean;
  soon?: boolean;
  /** the other person's, in a raid */
  peer?: boolean;
  ui: Ui;
  onPick(id: number): void;
}) {
  const name = nameOf(u, ui);
  return (
    <li className={`ar-q ar-t${u.team}${now ? " now" : ""}${later ? " later" : ""}${soon ? " soon" : ""}${peer ? " peer" : ""}`}>
      <button onClick={() => onPick(u.id)} title={`${name}, ${u.hp}/${u.maxHp}`} style={{ "--c": u.color } as React.CSSProperties}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={faceOf(u)} alt="" />
        <span className="ar-q-kind">
          <KindIcon kind={u.kind} size={9} />
        </span>
        <i style={{ width: `${(Math.max(0, u.hp) / u.maxHp) * 100}%` }} />
      </button>
    </li>
  );
}

const Queue = memo(function Queue({
  b,
  order,
  soon,
  theirs,
  ui,
  onPick,
}: {
  b: Battle;
  order: number[];
  soon: number[];
  /** the other person's fighters on this side, in a raid */
  theirs: number[];
  ui: Ui;
  onPick(id: number): void;
}) {
  return (
    <ol className="ar-queue" aria-label={tr(ui, "черга ходів", "turn order")}>
      {order.map((id, i) => (
        <Turn
          key={id}
          u={b.units[id]}
          now={i === 0}
          later={b.later.includes(id)}
          peer={theirs.includes(id)}
          ui={ui}
          onPick={onPick}
        />
      ))}
      {soon.length > 0 && (
        <li className="ar-q-round" title={tr(ui, `раунд ${b.round + 1}`, `round ${b.round + 1}`)}>
          <span>{b.round + 1}</span>
        </li>
      )}
      {soon.map((id) => (
        <Turn key={`soon${id}`} u={b.units[id]} soon peer={theirs.includes(id)} ui={ui} onPick={onPick} />
      ))}
    </ol>
  );
});

const Log = memo(function Log({ lines, box }: { lines: Line[]; box: React.RefObject<HTMLOListElement | null> }) {
  return (
    <ol className="ar-log" ref={box}>
      {lines.map((l) => (
        <li key={l.id} className={`ar-l-${l.tone}${l.team != null ? ` ar-t${l.team}` : ""}`}>
          {l.text}
        </li>
      ))}
    </ol>
  );
});

/** A fighter's card: what it is, its numbers now, what it does. */
function Card({ b, u, ui, className }: { b: Battle; u: Unit; ui: Ui; className: string }) {
  const k = kindDef(u);
  const shield = u.statuses.find((s) => s.id === "shield")?.power ?? 0;
  const t = (uk: string, en: string) => tr(ui, uk, en);
  return (
    <div className={`ar-card ar-t${u.team} ${className}`}>
      <div className="ar-card-top">
        <span className="ar-card-face" style={{ "--c": u.color } as React.CSSProperties}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={faceOf(u)} alt="" />
          <KindIcon kind={u.kind} size={12} />
        </span>
        <div>
          <div className="ar-card-hd">
            <b>{nameOf(u, ui)}</b>
            <span className="ar-lvl">
              {t("рів.", "lv")} {u.level}
            </span>
          </div>
          <div className="ar-card-kind">
            {k.name[ui]} · {k.role[ui]}
          </div>
        </div>
      </div>
      <div className="ar-card-hp">
        <span style={{ width: `${(Math.max(0, u.hp) / u.maxHp) * 100}%` }} />
        {shield > 0 && <span className="sh" style={{ width: `${Math.min(1, shield / u.maxHp) * 100}%` }} />}
        <em>
          {u.hp}/{u.maxHp}
          {shield > 0 ? ` +${shield}` : ""}
        </em>
      </div>
      <div className="ar-stats">
        <span title={t("атака", "attack")}>
          <Swords size={12} /> {u.atk}
        </span>
        <span title={t("захист", "defence")}>
          <Shield size={12} /> {u.def}
        </span>
        <span title={t("шкода", "damage")}>
          <Flame size={12} /> {u.dmg[0]}–{u.dmg[1]}
        </span>
        <span title={t("швидкість", "speed")}>
          <Footprints size={12} /> {speedOf(b, u)}
        </span>
        {u.range > 0 && (
          <span title={t("дальність", "range")}>
            <Crosshair size={12} /> {u.range}
          </span>
        )}
      </div>
      {(u.statuses.length > 0 || u.defending) && (
        <div className="ar-sts">
          {u.defending && <span className="good">{t("Оборона", "Defending")}</span>}
          {u.statuses.map((s) => (
            <span key={s.id} className={BAD.includes(s.id) ? "bad" : "good"}>
              {STATUS[s.id][ui]} {s.turns}
            </span>
          ))}
        </div>
      )}
      {k.passive && (
        <p>
          <b>{k.passive.name[ui]}.</b> {k.passive.text[ui]}
        </p>
      )}
      {k.skill && (
        <p>
          <b>
            {k.skill.name[ui]}
            {u.cooldown > 0 ? ` (${t("ще", "in")} ${u.cooldown})` : ""}.
          </b>{" "}
          {k.skill.text[ui]}
        </p>
      )}
      {u.leader && k.ult && (
        <p>
          <b>
            <Zap size={11} /> {k.ult.name[ui]}.
          </b>{" "}
          {k.ult.text[ui]}
        </p>
      )}
    </div>
  );
}

/** Who waits on the other side, before the battle. */
function Foes({ setup, ui }: { setup: Setup; ui: Ui }) {
  const groups = new Map<string, { name: string; level: number; n: number }>();
  for (const f of setup.teams[1]) {
    const k = kindOf(f.kind);
    const name = k?.bug ? k.name[ui] : f.name;
    const key = `${f.kind}:${f.level}:${name}`;
    const g = groups.get(key);
    if (g) g.n++;
    else groups.set(key, { name, level: f.level, n: 1 });
  }
  return (
    <ul className="ar-foes">
      {[...groups.values()].map((g) => (
        <li key={`${g.name}:${g.level}`}>
          {g.name}
          {g.n > 1 ? ` ×${g.n}` : ""} <small>{tr(ui, `рів. ${g.level}`, `lv ${g.level}`)}</small>
        </li>
      ))}
    </ul>
  );
}
