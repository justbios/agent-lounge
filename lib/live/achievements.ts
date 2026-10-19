import type { ThemeId } from "@/components/cafe/theme";
import type { Ui } from "@/lib/i18n";
import { HourRow } from "./recap";
import type { TrackId } from "./tracks";

/** One local day of a room, the shape relay_progress returns and progressFromHourly builds for a local Agent Lounge. */
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
  /** the tools used that day, by their café names; absent before Agent Lounge counted them */
  kinds?: string[];
  /** the most different agents handed work in one hour of the day */
  crowd?: number;
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
  kinds: Set<string>;
  crowd: number;
}

export interface AchievementDef {
  id: string;
  icon: string;
  /** Ukrainian; {@link achText} gives the name, hint and decor in the viewer's language */
  title: string;
  titleEn: string;
  hint: string;
  hintEn: string;
  goal: number;
  value: (s: Stats) => number;
  /** counted over the whole history at once, so there is no day it was earned on */
  lifetime?: boolean;
  decor?: Decor;
  decorName?: string;
  decorNameEn?: string;
  /** coffee beans it pays when reached after the beans started over */
  reward: number;
  /** a theme it opens; the night café is open from the start */
  theme?: ThemeId;
  /** a record it opens on the jukebox; lo-fi and the keyboards play from the start */
  track?: TrackId;
  /** teaches a part of Claude Code, and so is shown first */
  learn?: boolean;
}

const used = (kind: string) => (s: Stats) => (s.kinds.has(kind) ? 1 : 0);

/** An achievement's name, hint and the decor it brings, in one interface language. */
export function achText(a: AchievementDef, ui: Ui): { title: string; hint: string; decorName?: string } {
  return ui === "en"
    ? { title: a.titleEn, hint: a.hintEn, decorName: a.decorNameEn }
    : { title: a.title, hint: a.hint, decorName: a.decorName };
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "learn_plan", icon: "🗺", title: "План наперед", titleEn: "Plan ahead", hint: "Shift+Tab двічі вмикає режим плану: Claude спершу покаже план, а ти його затвердиш", hintEn: "Shift+Tab twice turns on plan mode: Claude shows you a plan first, and you approve it", goal: 1, value: used("exitplanmode"), reward: 50, learn: true },
  { id: "learn_todo", icon: "📝", title: "Список справ", titleEn: "To-do list", hint: "попроси Claude розбити велику задачу на кроки: він складе список справ і відмічатиме зроблене", hintEn: "ask Claude to break a big task into steps: it writes a to-do list and ticks off what's done", goal: 1, value: used("plan"), reward: 50, learn: true },
  { id: "learn_skill", icon: "🧩", title: "Навичка", titleEn: "Skill", hint: "скіл — готова інструкція для Claude: набери / з назвою скіла або попроси взяти потрібний", hintEn: "a skill is a ready-made instruction for Claude: type / and the skill's name, or ask Claude to use one", goal: 1, value: used("skill"), reward: 50, learn: true },
  { id: "learn_web", icon: "🌐", title: "В мережу", titleEn: "Online", hint: "попроси Claude пошукати в інтернеті або прочитати сторінку за посиланням", hintEn: "ask Claude to search the web or read a page from a link", goal: 1, value: used("web"), reward: 50, learn: true },
  { id: "learn_ask", icon: "❓", title: "Питання з варіантами", titleEn: "Multiple choice", hint: "напиши Claude «спершу розпитай мене»: він спитає з готовими варіантами відповіді", hintEn: "tell Claude “ask me first”: it asks you questions with ready answers to pick from", goal: 1, value: used("ask"), reward: 50, learn: true },
  { id: "learn_team", icon: "👥", title: "Командна година", titleEn: "Team hour", hint: "попроси Claude розкидати задачу на агентів паралельно: три різні агенти за одну годину", hintEn: "ask Claude to split a task across agents in parallel: three different agents in one hour", goal: 3, value: (s) => s.crowd, reward: 50, learn: true },
  { id: "first_question", icon: "💬", title: "Перше питання", titleEn: "First question", hint: "постав Claude перше питання", hintEn: "ask Claude your first question", goal: 1, value: (s) => s.prompts, reward: 50 },
  { id: "first_handoff", icon: "🤝", title: "Перше доручення", titleEn: "First handoff", hint: "Claude вперше доручив роботу агенту", hintEn: "Claude handed work to an agent for the first time", goal: 1, value: (s) => s.dispatches, decor: "plant", decorName: "рослина в кутку", decorNameEn: "corner plant", reward: 50 },
  { id: "questions_100", icon: "💯", title: "Сотня питань", titleEn: "A hundred questions", hint: "100 питань за весь час", hintEn: "100 questions in all", goal: 100, value: (s) => s.prompts, reward: 100, track: "jazz" },
  { id: "questions_1000", icon: "👑", title: "Тисяча питань", titleEn: "A thousand questions", hint: "1000 питань за весь час", hintEn: "1,000 questions in all", goal: 1000, value: (s) => s.prompts, decor: "crown", decorName: "корона для кота", decorNameEn: "crown for the cat", reward: 300 },
  { id: "tools_1000", icon: "🏆", title: "Тисяча дій", titleEn: "A thousand actions", hint: "1000 дій інструментами", hintEn: "1,000 tool actions", goal: 1000, value: (s) => s.tools, decor: "trophy", decorName: "кубок на автоматі", decorNameEn: "trophy on the vending machine", reward: 100, track: "synth" },
  { id: "tools_10000", icon: "🚀", title: "Десять тисяч дій", titleEn: "Ten thousand actions", hint: "10 000 дій інструментами", hintEn: "10,000 tool actions", goal: 10000, value: (s) => s.tools, reward: 200 },
  { id: "team_5", icon: "👾", title: "Команда з п'яти", titleEn: "Team of five", hint: "5 різних агентів отримали роботу", hintEn: "5 different agents got work", goal: 5, value: (s) => s.agents, lifetime: true, decor: "arcade", decorName: "аркадний автомат", decorNameEn: "arcade machine", reward: 100, track: "chip" },
  { id: "team_10", icon: "🎉", title: "Повна зала", titleEn: "Full house", hint: "10 різних агентів отримали роботу", hintEn: "10 different agents got work", goal: 10, value: (s) => s.agents, lifetime: true, reward: 200 },
  { id: "rush_hour", icon: "⚡", title: "Година пік", titleEn: "Rush hour", hint: "10 доручень агентам за одну годину", hintEn: "10 handoffs to agents in one hour", goal: 10, value: (s) => s.peak, decor: "goldMachine", decorName: "золота кавоварка", decorNameEn: "golden coffee machine", reward: 200, theme: "space" },
  { id: "rush_50", icon: "🌪", title: "Шторм", titleEn: "Storm", hint: "50 доручень агентам за одну годину", hintEn: "50 handoffs to agents in one hour", goal: 50, value: (s) => s.peak, reward: 300 },
  { id: "factory", icon: "🏭", title: "Фабрика", titleEn: "Factory", hint: "300 доручень агентам за один день", hintEn: "300 handoffs to agents in one day", goal: 300, value: (s) => s.dayDispatches, reward: 300 },
  { id: "polyglot", icon: "🐠", title: "На всі руки", titleEn: "Jack of all trades", hint: "15 різних інструментів", hintEn: "15 different tools", goal: 15, value: (s) => s.toolKinds, lifetime: true, decor: "aquarium", decorName: "акваріум", decorNameEn: "aquarium", reward: 100 },
  { id: "projects_5", icon: "📁", title: "П'ять проєктів", titleEn: "Five projects", hint: "Claude працював у 5 різних проєктах", hintEn: "Claude worked in 5 different projects", goal: 5, value: (s) => s.projects, lifetime: true, reward: 100 },
  { id: "night_owl", icon: "🦉", title: "Нічна сова", titleEn: "Night owl", hint: "питання між північчю і п'ятою ранку", hintEn: "a question between midnight and 5 a.m.", goal: 1, value: (s) => s.night, decor: "owl", decorName: "сова на підвіконні", decorNameEn: "owl on the windowsill", reward: 50, track: "rain" },
  { id: "early_bird", icon: "🐦", title: "Рання пташка", titleEn: "Early bird", hint: "питання між п'ятою і сьомою ранку", hintEn: "a question between 5 and 7 a.m.", goal: 1, value: (s) => s.early, reward: 50 },
  { id: "streak_3", icon: "🔥", title: "Три дні поспіль", titleEn: "Three days running", hint: "питання три дні поспіль", hintEn: "questions three days in a row", goal: 3, value: (s) => s.streak, decor: "garland", decorName: "гірлянда", decorNameEn: "string lights", reward: 100, theme: "forest" },
  { id: "streak_7", icon: "📅", title: "Тиждень поспіль", titleEn: "A week running", hint: "питання сім днів поспіль", hintEn: "questions seven days in a row", goal: 7, value: (s) => s.streak, reward: 200 },
  { id: "streak_30", icon: "🌙", title: "Місяць поспіль", titleEn: "A month running", hint: "питання тридцять днів поспіль", hintEn: "questions thirty days in a row", goal: 30, value: (s) => s.streak, reward: 300 },
  { id: "marathon", icon: "🏃", title: "Марафон", titleEn: "Marathon", hint: "5 годин роботи за один день", hintEn: "5 hours of work in one day", goal: 300, value: (s) => s.minutes, reward: 200, theme: "winter" },
  { id: "ultra", icon: "🏔", title: "Ультрамарафон", titleEn: "Ultramarathon", hint: "16 годин роботи за один день", hintEn: "16 hours of work in one day", goal: 960, value: (s) => s.minutes, reward: 300 },
  { id: "tokens_1m", icon: "🪙", title: "Мільйон токенів", titleEn: "A million tokens", hint: "Claude і агенти разом витратили мільйон токенів", hintEn: "Claude and the agents spent a million tokens together", goal: 1e6, value: (s) => s.tokens, reward: 50 },
  { id: "tokens_day_2b", icon: "🍩", title: "Ненажера", titleEn: "Glutton", hint: "два мільярди токенів за один день, разом із кешем", hintEn: "two billion tokens in one day, cache included", goal: 2e9, value: (s) => s.dayTokens, reward: 300 },
  { id: "tokens_1b", icon: "💎", title: "Мільярд токенів", titleEn: "A billion tokens", hint: "мільярд токенів за весь час, разом із кешем", hintEn: "a billion tokens in all, cache included", goal: 1e9, value: (s) => s.tokens, reward: 300 },
  { id: "fails_50", icon: "🧯", title: "Загартований", titleEn: "Battle-hardened", hint: "50 невдалих викликів інструментів", hintEn: "50 failed tool calls", goal: 50, value: (s) => s.fails, decor: "extinguisher", decorName: "вогнегасник", decorNameEn: "fire extinguisher", reward: 50 },
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
  const s: Stats = { tokens: 0, prompts: 0, tools: 0, dispatches: 0, fails: 0, streak: 0, minutes: 0, peak: 0, dayDispatches: 0, dayTokens: 0, night: 0, early: 0, agents: p.agents, toolKinds: p.tools, projects: p.projects, kinds: new Set(), crowd: 0 };
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
    d.kinds?.forEach((k) => s.kinds.add(k));
    s.crowd = Math.max(s.crowd, d.crowd ?? 0);
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

/** The same per-day shape for a local Agent Lounge, folded from the hourly rows it counts in memory. */
export function progressFromHourly(rows: HourRow[], room: CafeSettings | null): Progress {
  const days = new Map<string, ProgressDay>();
  const agents = new Set<string>();
  const tools = new Set<string>();
  const projects = new Set<string>();
  const chats = new Set<string>();
  const kinds = new Map<string, Set<string>>();
  for (const r of rows) {
    const t = Date.parse(r.hour);
    const key = localDay(t);
    const hour = new Date(t).getHours();
    let d = days.get(key);
    if (!d) {
      d = { day: key, prompts: 0, tools: 0, dispatches: 0, fails: 0, answers: 0, minutes: 0, peak_hour: 0, night: false, early: false, tokens: 0, crowd: 0 };
      days.set(key, d);
      kinds.set(key, new Set());
    }
    d.prompts += r.prompts;
    d.tools += r.tools;
    d.dispatches += r.dispatches;
    d.fails += r.fails;
    d.answers += r.answers;
    d.tokens = (d.tokens ?? 0) + (r.tok_in ?? 0) + (r.tok_cw ?? 0) + (r.tok_cr ?? 0) + (r.tok_out ?? 0);
    d.minutes += Object.keys(r.mins).length;
    d.peak_hour = Math.max(d.peak_hour, r.dispatches);
    d.crowd = Math.max(d.crowd ?? 0, Object.keys(r.agents).length);
    Object.keys(r.tools_by).forEach((k) => kinds.get(key)!.add(k));
    if (r.prompts > 0 && hour < 5) d.night = true;
    if (r.prompts > 0 && (hour === 5 || hour === 6)) d.early = true;
    Object.keys(r.agents).forEach((k) => agents.add(k));
    Object.keys(r.tools_by).forEach((k) => tools.add(k));
    Object.keys(r.projects).forEach((k) => projects.add(k));
    Object.keys(r.sessions).forEach((k) => chats.add(k));
  }
  return {
    days: [...days.values()]
      .map((d) => ({ ...d, kinds: [...kinds.get(d.day)!] }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    agents: agents.size,
    tools: tools.size,
    projects: projects.size,
    chats: chats.size,
    room,
  };
}
