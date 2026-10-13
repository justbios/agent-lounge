export type DuelKind = "ttt" | "pong";

export const DUEL_NAMES: Record<DuelKind, string> = { ttt: "хрестики-нулики", pong: "пінг-понг" };

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

export type DuelMsg =
  | { t: "invite"; kind: DuelKind; game: string; from: Player; to: string }
  | { t: "decline"; game: string; to: string }
  | { t: "accept"; kind: DuelKind; game: string; x: Player; o: Player }
  | { t: "leave"; game: string; by: string };

const kindOf = (v: unknown): DuelKind | null => (v === "ttt" || v === "pong" ? v : null);

export function cleanDuel(p: unknown): DuelMsg | null {
  const m = p as Record<string, unknown> | null;
  const game = str(m?.game, 64);
  if (!m || !game) return null;
  switch (m.t) {
    case "invite": {
      const kind = kindOf(m.kind);
      const from = cleanPlayer(m.from);
      const to = str(m.to, 64);
      return kind && from && to ? { t: "invite", kind, game, from, to } : null;
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
