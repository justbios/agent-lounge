import type { ThemeId } from "@/components/cafe/theme";
import { HourRow } from "./recap";
import type { TrackId } from "./tracks";

/** One local day of a room, the shape relay_progress returns and progressFromHourly builds for a local Relay. */
export interface ProgressDay {
  day: string;
  prompts: number;
  tools: number;
  dispatches: number;
  fails: number;
  answers: number;
  minutes: number;
  peak_hour: number;
  night: boolean;
  early: boolean;
  /** absent from rooms that counted nothing yet */
  tokens?: number;
}

export interface CafeSettings {
  cat_name: string | null;
  theme: string | null;
  /** raw from the room; {@link cleanInterior} makes it safe to use */
  interior?: unknown;
}

export interface Progress {
  days: ProgressDay[];
  agents: number;
  tools: number;
  projects: number;
  chats: number;
  room: CafeSettings | null;
}

export type Decor = "garland" | "trophy" | "owl" | "arcade" | "aquarium" | "goldMachine" | "plant" | "crown" | "extinguisher";

interface Stats {
  tokens: number;
  prompts: number;
  tools: number;
  dispatches: number;
  fails: number;
  streak: number;
  minutes: number;
  peak: number;
  dayDispatches: number;
  dayTokens: number;
  night: number;
  early: number;
  agents: number;
  toolKinds: number;
  projects: number;
}

export interface AchievementDef {
  id: string;
  icon: string;
  title: string;
  hint: string;
  goal: number;
  value: (s: Stats) => number;
  /** counted over the whole history at once, so there is no day it was earned on */
  lifetime?: boolean;
  decor?: Decor;
  decorName?: string;
  /** coffee beans it pays when reached after the beans started over */
  reward: number;
  /** a theme it opens; the night café is open from the start */
  theme?: ThemeId;
  /** a record it opens on the jukebox; lo-fi and the keyboards play from the start */
  track?: TrackId;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first_question", icon: "💬", title: "Перше питання", hint: "постав Claude перше питання", goal: 1, value: (s) => s.prompts, reward: 50 },
  { id: "first_handoff", icon: "🤝", title: "Перше доручення", hint: "Claude вперше доручив роботу агенту", goal: 1, value: (s) => s.dispatches, decor: "plant", decorName: "рослина в кутку", reward: 50 },
  { id: "questions_100", icon: "💯", title: "Сотня питань", hint: "100 питань за весь час", goal: 100, value: (s) => s.prompts, reward: 100, track: "jazz" },
  { id: "questions_1000", icon: "👑", title: "Тисяча питань", hint: "1000 питань за весь час", goal: 1000, value: (s) => s.prompts, decor: "crown", decorName: "корона для кота", reward: 300 },
  { id: "tools_1000", icon: "🏆", title: "Тисяча дій", hint: "1000 дій інструментами", goal: 1000, value: (s) => s.tools, decor: "trophy", decorName: "кубок на автоматі", reward: 100, track: "synth" },
  { id: "tools_10000", icon: "🚀", title: "Десять тисяч дій", hint: "10 000 дій інструментами", goal: 10000, value: (s) => s.tools, reward: 200 },
  { id: "team_5", icon: "👾", title: "Команда з п'яти", hint: "5 різних агентів отримали роботу", goal: 5, value: (s) => s.agents, lifetime: true, decor: "arcade", decorName: "аркадний автомат", reward: 100, track: "chip" },
  { id: "team_10", icon: "🎉", title: "Повна зала", hint: "10 різних агентів отримали роботу", goal: 10, value: (s) => s.agents, lifetime: true, reward: 200 },
  { id: "rush_hour", icon: "⚡", title: "Година пік", hint: "10 доручень агентам за одну годину", goal: 10, value: (s) => s.peak, decor: "goldMachine", decorName: "золота кавоварка", reward: 200, theme: "space" },
  { id: "rush_50", icon: "🌪", title: "Шторм", hint: "50 доручень агентам за одну годину", goal: 50, value: (s) => s.peak, reward: 300 },
  { id: "factory", icon: "🏭", title: "Фабрика", hint: "300 доручень агентам за один день", goal: 300, value: (s) => s.dayDispatches, reward: 300 },
  { id: "polyglot", icon: "🐠", title: "На всі руки", hint: "15 різних інструментів", goal: 15, value: (s) => s.toolKinds, lifetime: true, decor: "aquarium", decorName: "акваріум", reward: 100 },
  { id: "projects_5", icon: "📁", title: "П'ять проєктів", hint: "Claude працював у 5 різних проєктах", goal: 5, value: (s) => s.projects, lifetime: true, reward: 100 },
  { id: "night_owl", icon: "🦉", title: "Нічна сова", hint: "питання між північчю і п'ятою ранку", goal: 1, value: (s) => s.night, decor: "owl", decorName: "сова на підвіконні", reward: 50, track: "rain" },
  { id: "early_bird", icon: "🐦", title: "Рання пташка", hint: "питання між п'ятою і сьомою ранку", goal: 1, value: (s) => s.early, reward: 50 },
  { id: "streak_3", icon: "🔥", title: "Три дні поспіль", hint: "питання три дні поспіль", goal: 3, value: (s) => s.streak, decor: "garland", decorName: "гірлянда", reward: 100, theme: "forest" },
  { id: "streak_7", icon: "📅", title: "Тиждень поспіль", hint: "питання сім днів поспіль", goal: 7, value: (s) => s.streak, reward: 200 },
  { id: "streak_30", icon: "🌙", title: "Місяць поспіль", hint: "питання тридцять днів поспіль", goal: 30, value: (s) => s.streak, reward: 300 },
  { id: "marathon", icon: "🏃", title: "Марафон", hint: "5 годин роботи за один день", goal: 300, value: (s) => s.minutes, reward: 200, theme: "winter" },
  { id: "ultra", icon: "🏔", title: "Ультрамарафон", hint: "16 годин роботи за один день", goal: 960, value: (s) => s.minutes, reward: 300 },
  { id: "tokens_1m", icon: "🪙", title: "Мільйон токенів", hint: "Claude і агенти разом витратили мільйон токенів", goal: 1e6, value: (s) => s.tokens, reward: 50 },
  { id: "tokens_day_2b", icon: "🍩", title: "Ненажера", hint: "два мільярди токенів за один день, разом із кешем", goal: 2e9, value: (s) => s.dayTokens, reward: 300 },
  { id: "tokens_1b", icon: "💎", title: "Мільярд токенів", hint: "мільярд токенів за весь час, разом із кешем", goal: 1e9, value: (s) => s.tokens, reward: 300 },
  { id: "fails_50", icon: "🧯", title: "Загартований", hint: "50 невдалих викликів інструментів", goal: 50, value: (s) => s.fails, decor: "extinguisher", decorName: "вогнегасник", reward: 50 },
];

export interface Earned {
  def: AchievementDef;
  value: number;
  done: boolean;
  /** the local day it was earned on, when the history can tell */
  day: string | null;
}

const DAY_MS = 24 * 3600 * 1000;
const dayNum = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY_MS);

/** Walks the days in order and records the first day each achievement crossed its goal. */
export function evaluate(p: Progress): Earned[] {
  const s: Stats = { tokens: 0, prompts: 0, tools: 0, dispatches: 0, fails: 0, streak: 0, minutes: 0, peak: 0, dayDispatches: 0, dayTokens: 0, night: 0, early: 0, agents: p.agents, toolKinds: p.tools, projects: p.projects };
  const day = new Map<string, string>();
  let run = 0;
  let prev: number | null = null;
  for (const d of p.days) {
    s.tokens += d.tokens ?? 0;
    s.prompts += d.prompts;
    s.tools += d.tools;
    s.dispatches += d.dispatches;
    s.fails += d.fails;
    s.minutes = Math.max(s.minutes, d.minutes);
    s.peak = Math.max(s.peak, d.peak_hour);
    s.dayDispatches = Math.max(s.dayDispatches, d.dispatches);
    s.dayTokens = Math.max(s.dayTokens, d.tokens ?? 0);
    if (d.night) s.night = 1;
    if (d.early) s.early = 1;
    const n = dayNum(d.day);
    run = d.prompts > 0 ? (prev != null && n === prev + 1 ? run + 1 : 1) : 0;
    prev = d.prompts > 0 ? n : null;
    s.streak = Math.max(s.streak, run);
    for (const a of ACHIEVEMENTS) {
      if (!a.lifetime && !day.has(a.id) && a.value(s) >= a.goal) day.set(a.id, d.day);
    }
  }
  return ACHIEVEMENTS.map((def) => {
    const value = def.value(s);
    return { def, value, done: value >= def.goal, day: day.get(def.id) ?? null };
  });
}

/** The achievement that opens a theme, or none for one open from the start. */
export const themeKey = (id: ThemeId) => ACHIEVEMENTS.find((a) => a.theme === id) ?? null;

/** The achievement that opens a record, or none for one open from the start. */
export const trackKey = (id: TrackId) => ACHIEVEMENTS.find((a) => a.track === id) ?? null;

/** Themes this room may pick: the night café and every one its achievements opened. */
export function openThemes(earned: Earned[]): Set<ThemeId> {
  return new Set<ThemeId>(["cafe", ...earned.filter((e) => e.done && e.def.theme).map((e) => e.def.theme!)]);
}

/** Records this room may put on: lo-fi, the keyboards and every one its achievements opened. */
export function openTracks(earned: Earned[]): Set<TrackId> {
  return new Set<TrackId>(["lofi", "keys", ...earned.filter((e) => e.done && e.def.track).map((e) => e.def.track!)]);
}

export function decorOf(earned: Earned[]): Set<Decor> {
  return new Set(earned.filter((e) => e.done && e.def.decor).map((e) => e.def.decor!));
}

export function localDay(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The same per-day shape for a local Relay, folded from the hourly rows it counts in memory. */
export function progressFromHourly(rows: HourRow[], room: CafeSettings | null): Progress {
  const days = new Map<string, ProgressDay>();
  const agents = new Set<string>();
  const tools = new Set<string>();
  const projects = new Set<string>();
  const chats = new Set<string>();
  for (const r of rows) {
    const t = Date.parse(r.hour);
    const key = localDay(t);
    const hour = new Date(t).getHours();
    let d = days.get(key);
    if (!d) {
      d = { day: key, prompts: 0, tools: 0, dispatches: 0, fails: 0, answers: 0, minutes: 0, peak_hour: 0, night: false, early: false, tokens: 0 };
      days.set(key, d);
    }
    d.prompts += r.prompts;
    d.tools += r.tools;
    d.dispatches += r.dispatches;
    d.fails += r.fails;
    d.answers += r.answers;
    d.tokens = (d.tokens ?? 0) + (r.tok_in ?? 0) + (r.tok_cw ?? 0) + (r.tok_cr ?? 0) + (r.tok_out ?? 0);
    d.minutes += Object.keys(r.mins).length;
    d.peak_hour = Math.max(d.peak_hour, r.dispatches);
    if (r.prompts > 0 && hour < 5) d.night = true;
    if (r.prompts > 0 && (hour === 5 || hour === 6)) d.early = true;
    Object.keys(r.agents).forEach((k) => agents.add(k));
    Object.keys(r.tools_by).forEach((k) => tools.add(k));
    Object.keys(r.projects).forEach((k) => projects.add(k));
    Object.keys(r.sessions).forEach((k) => chats.add(k));
  }
  return {
    days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
    agents: agents.size,
    tools: tools.size,
    projects: projects.size,
    chats: chats.size,
    room,
  };
}
