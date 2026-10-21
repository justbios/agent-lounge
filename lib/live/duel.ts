import type { Ui } from "@/lib/i18n";

export type DuelKind = "ttt" | "pong" | "cables" | "checkers" | "hockey" | "chess";

export const DUEL_NAMES: Record<DuelKind, string> = {
  ttt: "хрестики-нулики",
  pong: "пінг-понг",
  cables: "кабелі",
  checkers: "шашки",
  hockey: "аерохокей",
  chess: "шахи",
};

export const DUEL_NAMES_EN: Record<DuelKind, string> = {
  ttt: "tic-tac-toe",
  pong: "ping-pong",
  cables: "cables",
  checkers: "checkers",
  hockey: "air hockey",
  chess: "chess",
};

/** A game's name in the viewer's language. */
export const duelName = (kind: DuelKind, ui: Ui = "uk"): string =>
  (ui === "en" ? DUEL_NAMES_EN : DUEL_NAMES)[kind];

/** Played turn by turn over the café's own channel, so they survive the games panel closing. */
export const TURN_BASED: readonly DuelKind[] = ["ttt", "checkers", "chess"];
export type LiveDuel = Exclude<DuelKind, "ttt" | "checkers" | "chess">;

export interface Player {
  id: string;
  name: string;
}

/** Two people in the café playing one game; x is whoever sent the invite. */
export interface Match {
  kind: DuelKind;
  id: string;
  x: Player;
  o: Player;
  /** the other player closed the game */
  gone: boolean;
  /** played to the end; leaving no longer tells the other side */
  over: boolean;
}

export type Side = "x" | "o";

export const sideOf = (m: { x: Player; o: Player }, player: string): Side | null =>
  m.x.id === player ? "x" : m.o.id === player ? "o" : null;

export const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.length > 0 && v.length <= max ? v : null;

export function cleanPlayer(v: unknown): Player | null {
  const p = v as Partial<Player> | null;
  const id = str(p?.id, 64);
  const name = str(p?.name, 24);
  return id && name ? { id, name } : null;
}

/**
 * An invite with `again` asks for another game of the one just played (its id), so the other side can answer it on
 * that game's board; a café without rematches takes it as a plain invite.
 */
export type DuelMsg =
  | { t: "invite"; kind: DuelKind; game: string; from: Player; to: string; again?: string }
  | { t: "decline"; game: string; to: string }
  | { t: "accept"; kind: DuelKind; game: string; x: Player; o: Player }
  | { t: "leave"; game: string; by: string };

const kindOf = (v: unknown): DuelKind | null =>
  typeof v === "string" && Object.hasOwn(DUEL_NAMES, v) ? (v as DuelKind) : null;

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
      return kind && from && to ? { t: "invite", kind, game, from, to, ...(again ? { again } : {}) } : null;
    }
    case "decline": {
      const to = str(m.to, 64);
      return to ? { t: "decline", game, to } : null;
    }
    case "accept": {
      const kind = kindOf(m.kind);
      const x = cleanPlayer(m.x);
      const o = cleanPlayer(m.o);
      return kind && x && o ? { t: "accept", kind, game, x, o } : null;
    }
    case "leave": {
      const by = str(m.by, 64);
      return by ? { t: "leave", game, by } : null;
    }
  }
  return null;
}
