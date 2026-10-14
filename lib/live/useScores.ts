"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type Game = "bets" | "cups" | "ttt" | "pong" | "cables";
const GAMES: readonly Game[] = ["bets", "cups", "ttt", "pong", "cables"];

export interface ScoreRow {
  player: string;
  game: Game;
  wins: number;
  played: number;
  best: number;
}

const LOCAL_KEY = "relay.scores";
/** relay_score_add takes one result per player and game every 2 seconds; the queue keeps further apart than that. */
const SPACING_MS = 2200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function clean(list: unknown): ScoreRow[] {
  if (!Array.isArray(list)) return [];
  return list.flatMap((r) => {
    const x = r as Partial<ScoreRow>;
    if (typeof x?.player !== "string" || !GAMES.includes(x.game as Game)) return [];
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    return [{ player: x.player.slice(0, 24), game: x.game as Game, wins: n(x.wins), played: n(x.played), best: n(x.best) }];
  });
}

function readLocal(): ScoreRow[] {
  try {
    return clean(JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

function addLocal(player: string, game: Game, win: boolean, value: number) {
  const rows = readLocal();
  const row = rows.find((r) => r.player === player && r.game === game);
  if (row) {
    row.wins += win ? 1 : 0;
    row.played += 1;
    row.best = Math.max(row.best, value);
  } else rows.push({ player, game, wins: win ? 1 : 0, played: 1, best: value });
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(rows));
  } catch {}
}

async function load(cloud: boolean, key: string | null, room: string | null): Promise<ScoreRow[]> {
  if (!cloud) return readLocal();
  const sb = supabase;
  if (!sb || (!key && !room)) return [];
  const { data, error } = room
    ? await sb.rpc("relay_scores_room", { p_room: room })
    : await sb.rpc("relay_scores_get", { p_key: key });
  return error ? [] : clean(data);
}

export interface Scores {
  rows: ScoreRow[];
  /** viewers by link play along but keep no score */
  canRecord: boolean;
  record: (player: string, game: Game, win: boolean, value?: number) => void;
}

/** Wins and best scores of the café's games: in the room's relay_scores when hosted, in the browser for a local Relay. */
export function useScores({ cloud, key, room, open }: { cloud: boolean; key: string | null; room: string | null; open: boolean }): Scores {
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [version, setVersion] = useState(0);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!open) return;
    let live = true;
    load(cloud, key, room).then((r) => live && setRows(r));
    return () => {
      live = false;
    };
  }, [open, cloud, key, room, version]);

  const canRecord = !cloud || (!!key && !room);
  const record = (player: string, game: Game, win: boolean, value = 0) => {
    if (!canRecord) return;
    const v = Math.max(0, Math.min(100000, Math.round(value)));
    queue.current = queue.current
      .then(async () => {
        if (!cloud) return addLocal(player, game, win, v);
        await supabase?.rpc("relay_score_add", { p_key: key, p_player: player, p_game: game, p_win: win, p_value: v });
        await sleep(SPACING_MS);
      })
      .catch(() => {})
      .then(() => setVersion((n) => n + 1));
  };

  return { rows, canRecord, record };
}
