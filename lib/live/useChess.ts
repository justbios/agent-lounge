"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ChessBoard, Move, catchUp, cleanChess, newChess, play } from "./chess";
import { Match, sideOf } from "./duel";
import { Duels } from "./useDuels";
import { Scores } from "./useScores";
import { Social } from "./useSocial";

const RESEND_MS = 4000;
const RESENDS = 15;
const RESENDS_OVER = 3;

export interface Chess {
  match: Match | null;
  board: ChessBoard | null;
  move: (mv: Move) => void;
}

/**
 * Chess on top of a duel, sent the way draughts is: every move goes out with the whole game before it, and again
 * while the other side has not answered, so a message lost on the way stalls nothing.
 */
export function useChess(duels: Duels, social: Social, scores: Scores): Chess {
  const { bus, self, name } = social;
  const match = duels.match?.kind === "chess" ? duels.match : null;
  const [saved, setSaved] = useState<ChessBoard | null>(null);
  const recorded = useRef(new Set<string>());
  const sent = useRef({ at: -1, n: 0 });
  const board = match ? (saved?.id === match.id ? saved : newChess(match.id)) : null;

  const onMsg = useEffectEvent((p: unknown) => {
    const m = cleanChess(p);
    if (!m || !match || !board || m.game !== match.id || !sideOf(match, m.by) || match.gone) return;
    const next = catchUp(board, m.moves);
    if (next) setSaved(next);
  });
  useEffect(() => bus.on("chess", (p, mine) => !mine && onMsg(p)), [bus]);

  const resend = useEffectEvent(() => {
    if (!match || !board || match.gone || !board.moves.length) return;
    if (sent.current.at !== board.moves.length) sent.current = { at: board.moves.length, n: 0 };
    const waiting = board.turn !== sideOf(match, self);
    if (board.winner ? sent.current.n >= RESENDS_OVER : !waiting || sent.current.n >= RESENDS) return;
    sent.current.n += 1;
    bus.send("chess", { game: match.id, by: self, moves: board.moves });
  });
  useEffect(() => {
    if (!match) return;
    const t = setInterval(resend, RESEND_MS);
    return () => clearInterval(t);
  }, [match]);

  const settle = useEffectEvent((m: Match, b: ChessBoard) => {
    if (recorded.current.has(b.id)) return;
    recorded.current.add(b.id);
    scores.record(name, "chess", b.winner === sideOf(m, self));
    duels.finish(m.id);
  });
  useEffect(() => {
    if (match && board?.winner) settle(match, board);
  }, [match, board]);

  const move = (mv: Move) => {
    if (!match || !board) return;
    const next = play(match, board, mv, self);
    if (!next) return;
    setSaved(next);
    bus.send("chess", { game: match.id, by: self, moves: next.moves });
  };

  return { match, board, move };
}
