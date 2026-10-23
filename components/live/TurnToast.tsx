"use client";

import { useState } from "react";
import { Gamepad2, Swords } from "lucide-react";
import { useTr, useUi } from "@/lib/i18n";
import { duelName, sideOf } from "@/lib/live/duel";
import GameClock from "../games/GameClock";
import type { useGames } from "@/lib/live/useGames";

type Games = ReturnType<typeof useGames>;

/** A game for two waits on your move while the games are closed; the board is a click away. */
export default function TurnToast({ games, onOpen }: { games: Games; onOpen: () => void }) {
  const ui = useUi();
  const t = useTr();
  const [later, setLater] = useState("");
  const { duels, ttt, chk, chess, four, arena } = games;
  const m = duels.match;
  // the agents' battle goes on with someone while the games are closed
  const net = arena.match;
  if (net && !net.over && !net.gone && !duels.away) {
    const key = `${net.id}.${arena.moves.length}`;
    if (later === key) return null;
    const rival = net.x.id === duels.self ? net.o : net.x;
    return (
      <div className="invite-toast" role="status">
        <Swords size={15} />
        <span>
          <b>{rival.name}</b> {t(`у бою з тобою (${duelName(net.kind, ui)})`, `is in battle with you (${duelName(net.kind, ui)})`)}
        </span>
        <button className="btn" onClick={onOpen}>
          {t("до бою", "to battle")}
        </button>
        <button className="btn" onClick={() => setLater(key)}>
          {t("потім", "later")}
        </button>
      </div>
    );
  }
  const b = chess.board ?? chk.board ?? four.board ?? ttt.board;
  if (!m || !b || m.over || m.gone || duels.away || b.winner || b.turn !== sideOf(m, duels.self)) return null;
  const key = `${m.id}.${"moves" in b ? b.moves.length : b.cells.filter(Boolean).length}`;
  if (later === key) return null;
  const rival = m.x.id === duels.self ? m.o : m.x;
  const clock = chess.board ? chess.clock : chk.board ? chk.clock : null;
  return (
    <div className="invite-toast" role="status">
      <Gamepad2 size={15} />
      <span>
        <b>{rival.name}</b>{" "}
        {t(`чекає на твій хід (${duelName(m.kind, ui)})`, `is waiting for your move (${duelName(m.kind, ui)})`)}
      </span>
      {clock && <GameClock clock={clock} side={b.turn} turn={b.turn} over={false} mine />}
      <button className="btn" onClick={onOpen}>
        {t("до гри", "play")}
      </button>
      <button className="btn" onClick={() => setLater(key)}>
        {t("потім", "later")}
      </button>
    </div>
  );
}
