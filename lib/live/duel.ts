import type { Ui } from "@/lib/i18n";

export type DuelKind = "ttt" | "pong" | "cables" | "checkers" | "hockey" | "chess" | "sumo" | "four" | "arena" | "raid";

export const DUEL_NAMES: Record<DuelKind, string> = {
  ttt: "хрестики-нулики",
  pong: "пінг-понг",
  cables: "кабелі",
  checkers: "шашки",
  hockey: "аерохокей",
  chess: "шахи",
  sumo: "сумо",
  four: "чотири в ряд",
  arena: "бій загонів",
  raid: "рейд на моноліт",
};

export const DUEL_NAMES_EN: Record<DuelKind, string> = {
  ttt: "tic-tac-toe",
  pong: "ping-pong",
  cables: "cables",
  checkers: "checkers",
  hockey: "air hockey",
  chess: "chess",
  sumo: "sumo",
  four: "four in a row",
  arena: "squad battle",
  raid: "monolith raid",
};

/** A game's name in the viewer's language. */
export const duelName = (kind: DuelKind, ui: Ui = "uk"): string =>
  (ui === "en" ? DUEL_NAMES_EN : DUEL_NAMES)[kind];

/** Played turn by turn over the café's own channel, so they survive the games panel closing. */
export const TURN_BASED: readonly DuelKind[] = ["ttt", "checkers", "chess", "four", "arena", "raid"];
export type LiveDuel = Exclude<DuelKind, "ttt" | "checkers" | "chess" | "four" | "arena" | "raid">;
/** the games three can play together */
export const PARTY: readonly DuelKind[] = ["cables", "sumo"];

/** the games that can be played on a clock, as in blitz */
export const TIMED: readonly DuelKind[] = ["chess", "checkers"];
/** seconds on each side's clock to choose from; 0 plays without one */
export const CLOCKS: readonly number[] = [0, 60, 120, 180, 300, 600];
/** a clock one can choose, in seconds */
export const isClock = (v: unknown): v is number => typeof v === "number" && v > 0 && CLOCKS.includes(v);

export interface Player {
  id: string;
  name: string;
}

/** People in the café playing one game: two, or three in a game for three; x is whoever sent the invite. */
export interface Match {
  kind: DuelKind;
  id: string;
  x: Player;
  o: Player;
  /** the third player, in a game for three */
  z?: Player;
  /** another player closed the game */
  gone: boolean;
  /** who closed it, in a game for three */
  left?: string;
  /** played to the end; leaving no longer tells the other side */
  over: boolean;
  /** seconds on each side's clock, for chess and draughts played on one */
  clock?: number;
}

export type Side = "x" | "o";

export const sideOf = (m: { x: Player; o: Player }, player: string): Side | null =>
  m.x.id === player ? "x" : m.o.id === player ? "o" : null;

/** Everyone in a match, in seat order: x, o, then z if there is one. */
export const playersOf = (m: { x: Player; o: Player; z?: Player }): Player[] => [m.x, m.o, ...(m.z ? [m.z] : [])];

/** A player's seat in a match, or -1. */
export const seatOf = (m: { x: Player; o: Player; z?: Player }, player: string): number =>
  playersOf(m).findIndex((p) => p.id === player);

export const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.length > 0 && v.length <= max ? v : null;

export function cleanPlayer(v: unknown): Player | null {
  const p = v as Partial<Player> | null;
  const id = str(p?.id, 64);
  const name = str(p?.name, 24);
  return id && name ? { id, name } : null;
}

/**
 * An invite with `party` is to a game for three: one goes to each of the two players it lists, in their seat order
 * after the inviter, and the game starts for the inviter once both said yes. A decline then says `by` whom.
 * An invite with `again` asks for another game of the one just played (its id), so the other side can answer it on
 * that game's board; a café without rematches takes it as a plain invite. `clock` puts a chess or draughts game on a
 * clock of that many seconds a side, and the accept repeats it; a café without clocks leaves it out of its accept, so
 * neither side times that game.
 */
export type DuelMsg =
  | {
      t: "invite";
      kind: DuelKind;
      game: string;
      from: Player;
      to: string;
      again?: string;
      clock?: number;
      party?: Player[];
    }
  | { t: "decline"; game: string; to: string; by?: string }
  | { t: "accept"; kind: DuelKind; game: string; x: Player; o: Player; clock?: number }
  | { t: "leave"; game: string; by: string };

const kindOf = (v: unknown): DuelKind | null =>
  typeof v === "string" && Object.hasOwn(DUEL_NAMES, v) ? (v as DuelKind) : null;

const clockOf = (kind: DuelKind, v: unknown) => (TIMED.includes(kind) && isClock(v) ? { clock: v } : {});

/** The two invited to a game for three, in seat order, or null when that isn't what `v` is. */
function cleanParty(v: unknown, kind: DuelKind, from: Player, to: string): Player[] | null {
  if (!Array.isArray(v) || v.length !== 2 || !PARTY.includes(kind)) return null;
  const [o, z] = v.map(cleanPlayer);
  const ok = o && z && o.id !== z.id && from.id !== o.id && from.id !== z.id && (o.id === to || z.id === to);
  return ok ? [o, z] : null;
}

export function cleanDuel(p: unknown): DuelMsg | null {
  const m = p as Record<string, unknown> | null;
  const game = str(m?.game, 64);
  if (!m || !game) return null;
  switch (m.t) {
    case "invite": {
      const kind = kindOf(m.kind);
      const from = cleanPlayer(m.from);
      const to = str(m.to, 64);
      const again = str(m.again, 64);
      if (!kind || !from || !to) return null;
      const party = m.party === undefined ? null : cleanParty(m.party, kind, from, to);
      if (m.party !== undefined && !party) return null;
      return {
        t: "invite",
        kind,
        game,
        from,
        to,
        ...(again ? { again } : {}),
        ...clockOf(kind, m.clock),
        ...(party ? { party } : {}),
      };
    }
    case "decline": {
      const to = str(m.to, 64);
      const by = str(m.by, 64);
      return to ? { t: "decline", game, to, ...(by ? { by } : {}) } : null;
    }
    case "accept": {
      const kind = kindOf(m.kind);
      const x = cleanPlayer(m.x);
      const o = cleanPlayer(m.o);
      return kind && x && o ? { t: "accept", kind, game, x, o, ...clockOf(kind, m.clock) } : null;
    }
    case "leave": {
      const by = str(m.by, 64);
      return by ? { t: "leave", game, by } : null;
    }
  }
  return null;
}
