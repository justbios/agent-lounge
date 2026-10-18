import { CafeSettings, Decor, Earned, Progress, ProgressDay, decorOf, evaluate, localDay } from "./achievements";
import {
  BEANS_FROM,
  BEAN_ERA,
  BeanWork,
  Interior,
  ItemId,
  LookPick,
  Placed,
  beansEarned,
  beansSpent,
  cleanInterior,
  itemOf,
} from "./interior";
import { QUEST_BEANS, questsWon } from "./quest";

export const NO_SETTINGS: CafeSettings = { cat_name: null, theme: null };

/**
 * cafe — the café's only room, off personal keys; lobby — the shared hall of a café on personal keys;
 * mine and theirs — a teammate's own room on personal keys.
 */
export type RoomKind = "cafe" | "lobby" | "mine" | "theirs";

export interface CafeState {
  kind: RoomKind;
  /** the teammate whose room it is, for mine and theirs */
  whose: string | null;
  progress: Progress | null;
  earned: Earned[];
  decor: Set<Decor>;
  settings: CafeSettings;
  error: boolean;
  editable: boolean;
  save: (patch: Partial<CafeSettings>) => Promise<boolean>;
  interior: Interior;
  /** what the sign over the bar says: the room's own name, or the café's */
  title?: string;
  /** counted from {@link BEANS_FROM}: earned since, spent on what was bought since, and what is left */
  beans: { earned: number; spent: number; left: number };
  buy: (item: ItemId) => Promise<boolean>;
  /** puts a piece down, or moves the one with the same pid */
  place: (p: Placed) => Promise<boolean>;
  stow: (pid: string) => Promise<boolean>;
  setLook: (agent: string, pick: LookPick | null) => Promise<boolean>;
  /** the neon sign's own line, the second cat's name, the café's name and whether its pet is a dog */
  setNames: (patch: Pick<Interior, "sign" | "cat2Name" | "title" | "pet">) => Promise<boolean>;
  /** puts every piece and look as given at once: only pieces the room owns stand, and nothing is bought */
  arrange: (next: Pick<Interior, "placed" | "looks">) => Promise<boolean>;
}

export interface RoomSource {
  kind: RoomKind;
  whose: string | null;
  progress: Progress | null;
  work: BeanWork | null;
  settings: CafeSettings;
  error: boolean;
  editable: boolean;
  /** the café's own name, for a room that has none */
  cafeTitle?: string;
  /** the whole café's days, whose weekly quests pay this room too; a room's own days when absent */
  teamDays?: ProgressDay[];
  save: (patch: Partial<CafeSettings>) => Promise<boolean>;
}

/** The local day the beans started over on: achievements reached after it pay beans. */
const FROM_DAY = localDay(Date.parse(BEANS_FROM));

/**
 * The days since the restart with at least one question. The restart day counts only when the work since the restart
 * holds more questions than the later days, as its earlier hours earn nothing.
 */
function daysAsked(p: Progress | null, w: BeanWork | null): number {
  if (!p || !w) return 0;
  const after = p.days.filter((d) => d.day > FROM_DAY && d.prompts > 0);
  const later = after.reduce((s, d) => s + d.prompts, 0);
  return after.length + (w.prompts > later ? 1 : 0);
}

/** Everything one room shows and lets its keeper change, worked out from what Agent Lounge sent for it. */
export function cafeRoom(src: RoomSource): CafeState {
  const { kind, whose, progress, work, settings, error, editable, save } = src;
  const earned = progress ? evaluate(progress) : [];
  const done = earned.filter((e) => e.done);
  const interior = cleanInterior(settings.interior);
  const quests = questsWon(src.teamDays ?? progress?.days ?? [], FROM_DAY) * QUEST_BEANS;
  const rewards = quests + done.filter((e) => e.day && e.day > FROM_DAY).reduce((s, e) => s + e.def.reward, 0);
  const earnedBeans = beansEarned(work, rewards, daysAsked(progress, work));
  const spent = beansSpent(interior);
  const beans = { earned: earnedBeans, spent, left: earnedBeans - spent };
  const fit = (next: Interior) => save({ interior: next });
  const buy = async (item: ItemId) => {
    const it = itemOf(item);
    const one = it?.place === "perk" || it?.rare;
    if (!it || !editable || beans.left < it.price || (one && interior.owned.includes(item))) return false;
    const paid = [...(interior.paid ?? []), item];
    return fit({ ...interior, owned: [...interior.owned, item], paid, era: BEAN_ERA });
  };
  const place = (p: Placed) => {
    const rest = interior.placed.filter((q) => q.pid !== p.pid);
    return fit({ ...interior, placed: [...rest, p] });
  };
  const stow = (pid: string) => fit({ ...interior, placed: interior.placed.filter((q) => q.pid !== pid) });
  const setLook = (agent: string, pick: LookPick | null) => {
    const looks = { ...interior.looks };
    if (pick) looks[agent] = pick;
    else delete looks[agent];
    return fit({ ...interior, looks });
  };
  const setNames = (patch: Pick<Interior, "sign" | "cat2Name" | "title" | "pet">) =>
    fit(cleanInterior({ ...interior, ...patch }));
  const arrange = (next: Pick<Interior, "placed" | "looks">) =>
    fit(cleanInterior({ ...interior, placed: next.placed, looks: next.looks }));

  return {
    kind,
    whose,
    progress,
    earned,
    decor: decorOf(earned),
    settings,
    error,
    editable,
    save,
    interior,
    title: interior.title ?? src.cafeTitle,
    beans,
    buy,
    place,
    stow,
    setLook,
    setNames,
    arrange,
  };
}
