import type { Two } from "@/lib/i18n";
import { WIN_AT as CABLES_AT } from "@/lib/live/cables";
import type { DuelKind } from "@/lib/live/duel";
import { WIN_AT as HOCKEY_AT } from "@/lib/live/hockey";
import type { LookPick } from "@/lib/live/interior";
import { lookKey, lookOf } from "@/lib/live/interior";
import { WIN_AT as PONG_AT } from "@/lib/live/pong";
import { WIN_AT as SUMO_AT } from "@/lib/live/sumo";
import type { AgentDef } from "@/lib/types";
import { BARISTA } from "../../cafe/ambient";
import { Look, lookFor, pickedLook } from "../../cafe/people";

/** The machines along the hall's wall, in order, each with what it is about in a few words. */
export const GAMES: { kind: DuelKind; about: Two }[] = [
  {
    kind: "arena",
    about: { uk: "твій загін агентів проти загону іншої людини", en: "your agent squad against someone else's" },
  },
  {
    kind: "raid",
    about: { uk: "удвох, по три агенти, проти легасі-моноліту", en: "together, three agents each, against the legacy monolith" },
  },
  { kind: "chess", about: { uk: "мат королю перемагає", en: "checkmate wins" } },
  { kind: "checkers", about: { uk: "бити обов'язково, і назад теж", en: "you must capture, backwards too" } },
  {
    kind: "hockey",
    about: { uk: `заганяй шайбу у ворота, до ${HOCKEY_AT}`, en: `score the puck, first to ${HOCKEY_AT}` },
  },
  {
    kind: "sumo",
    about: { uk: `виштовхни інших з крижини, до ${SUMO_AT}`, en: `push the others off the ice, first to ${SUMO_AT}` },
  },
  { kind: "four", about: { uk: "склади чотири фішки підряд", en: "line up four discs" } },
  { kind: "ttt", about: { uk: "три в ряд на полі 3×3", en: "three in a row on a 3×3 board" } },
  { kind: "pong", about: { uk: `відбивай м'яч, до ${PONG_AT}`, en: `hit the ball back, first to ${PONG_AT}` } },
  {
    kind: "cables",
    about: {
      uk: `тягни кабель і не врізайся, до ${CABLES_AT}`,
      en: `drag your cable without crashing, first to ${CABLES_AT}`,
    },
  },
];

/** at most this many of the café's agents are offered to play against */
const MOST_RIVALS = 8;

/** One of the café's own to play against: an agent as it looks at its desk, or the barista. */
export interface Rival {
  key: string;
  name: string;
  color: string;
  look: Look;
}

/**
 * Who in the café can be played against right now: its agents, each once, under the names and looks they wear at
 * their desks. A café with no agent at work still has its barista.
 */
export function rivalsOf(agents: AgentDef[], looks: Record<string, LookPick>, barista: string): Rival[] {
  const seen = new Set<string>();
  const out: Rival[] = [];
  agents.forEach((a, i) => {
    const key = lookKey(a);
    // a teammate's desk in the lobby stands for a person, not an agent
    if (seen.has(key) || a.member != null) return;
    seen.add(key);
    const base = a.look ?? i;
    out.push({ key, name: a.name, color: a.color, look: lookFor(base, a.color, pickedLook(lookOf(looks, a), base)) });
  });
  if (!out.length) return [{ key: "barista", name: barista, color: "#e9e2cf", look: BARISTA }];
  return out.slice(0, MOST_RIVALS);
}
