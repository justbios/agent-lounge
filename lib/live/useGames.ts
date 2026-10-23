"use client";

import { LiveEvent } from "./types";
import { useBets } from "./useBets";
import { useCheckers } from "./useCheckers";
import { useChess } from "./useChess";
import { useArenaNet } from "./useArenaNet";
import { useDuels } from "./useDuels";
import { useFour } from "./useFour";
import { useScores } from "./useScores";
import { Social } from "./useSocial";
import { useTicTacToe } from "./useTicTacToe";

/** The café's games in one place: the scoreboard, «Ставки» on the chat on screen, and the games for two or three. */
export function useGames({
  social,
  cloud,
  key,
  room,
  events,
  scope,
  now,
  live,
  open,
}: {
  social: Social;
  cloud: boolean;
  key: string | null;
  room: string | null;
  events: LiveEvent[];
  scope: string | null;
  now: number;
  /** false while a replay plays: bets follow the real chat only */
  live: boolean;
  open: boolean;
}) {
  const scores = useScores({ cloud, key, room, open });
  const bets = useBets({ events, scope, social, scores, now, enabled: live && now > 0 });
  const duels = useDuels(social);
  const ttt = useTicTacToe(duels, social, scores);
  const chk = useCheckers(duels, social, scores);
  const chess = useChess(duels, social, scores);
  const four = useFour(duels, social, scores);
  const arena = useArenaNet(duels, social, scores);
  return { scores, bets, duels, ttt, chk, chess, four, arena };
}
