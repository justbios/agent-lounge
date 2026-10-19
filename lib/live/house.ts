import { useMemo } from "react";
import type { Ui } from "@/lib/i18n";
import { LiveScene, LiveSession, buildLiveModel, sessionRoster } from "./liveModel";
import { buildTeamModel, memberName, memberOf } from "./teamModel";
import { LiveEvent } from "./types";

/** The whole team at their desks, on the ground floor of a team café. */
export const LOBBY = "lobby";

const PER_FLOOR = 3;

/** One storey of the café, top to bottom on the page: a teammate's chats, or a row of a solo café's. */
export interface Floor {
  key: string;
  label: string;
  /** the teammate's colour, for the plate on the wall */
  color?: string;
  chats: LiveSession[];
}

/**
 * The café as a house in cross-section, every chat a room of its own. A team café gives each teammate a storey, the one
 * reading the page on the ground floor; a solo one stacks its chats three to a storey, the latest at the bottom.
 */
export function houseFloors(
  chats: LiveSession[],
  team: { on: boolean; members: string[]; colorOf: Record<string, string>; me: string | null },
  ui: Ui,
): Floor[] {
  if (!team.on) {
    const out: Floor[] = [];
    for (let i = 0; i < chats.length; i += PER_FLOOR) {
      const n = out.length + 1;
      const label = ui === "en" ? `floor ${n}` : `${n} поверх`;
      out.push({ key: `f${n}`, label, chats: chats.slice(i, i + PER_FLOOR) });
    }
    return out.reverse();
  }
  const order = [...team.members].sort((a, b) => (a === team.me ? -1 : b === team.me ? 1 : 0));
  return order
    .map((m) => ({
      key: `m:${m}`,
      label: memberName(m, ui),
      color: team.colorOf[m],
      chats: chats.filter((s) => memberOf(s) === m),
    }))
    .filter((f) => f.chats.length > 0)
    .reverse();
}

/** Every room's café, built only while the house is on screen; `ids` is the chats' session ids joined by "|". */
export function useHouseScenes(
  events: LiveEvent[],
  ids: string,
  members: string[] | null,
  on: boolean,
  ui: Ui,
): Map<string, LiveScene> {
  return useMemo(() => {
    const m = new Map<string, LiveScene>();
    if (!on) return m;
    for (const id of ids.split("|")) if (id) m.set(id, buildLiveModel(events, id, sessionRoster(events, id) ?? [], ui));
    if (members) m.set(LOBBY, buildTeamModel(events, members, ui));
    return m;
  }, [events, ids, members, on, ui]);
}
