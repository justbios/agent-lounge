"use client";

import { LiveEvent } from "./types";
import { useBets } from "./useBets";
import { useScores } from "./useScores";
import { Social } from "./useSocial";
import { useTicTacToe } from "./useTicTacToe";

/** The café's games in one place: the scoreboard, «Ставки» on the chat on screen, and noughts and crosses. */
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
  const ttt = useTicTacToe(social, scores, social.guests);
  return { scores, bets, ttt };
}
