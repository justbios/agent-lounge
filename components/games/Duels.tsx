"use client";

import { useRef } from "react";
import { DUEL_NAMES, DuelKind } from "@/lib/live/duel";
import { Guest } from "@/lib/live/social";
import { Duels as DuelsState } from "@/lib/live/useDuels";
import { Ttt } from "@/lib/live/useTicTacToe";
import Cables from "./Cables";
import FullscreenButton from "./FullscreenButton";
import Pong from "./Pong";
import TicTacToe from "./TicTacToe";

const KINDS: DuelKind[] = ["pong", "cables", "ttt"];

/** The match being played, or who in the café can be called to one and the invite in flight. */
export default function Duels({
  duels,
  ttt,
  guests,
  room,
  online,
  onEnd,
}: {
  duels: DuelsState;
  ttt: Ttt;
  guests: Guest[];
  room: string | null;
  online: boolean;
  /** a real-time match was played to the end */
  onEnd: (kind: "pong" | "cables", win: boolean) => void;
}) {
  const board = useRef<HTMLDivElement>(null);
  const m = duels.match;
  if (m) {
    const rival = m.x.id === duels.self ? m.o : m.x;
    const note = m.over ? null : m.gone ? `${rival.name}: гру закрито` : duels.away ? `${rival.name} більше не в кафе` : null;
    return (
      <div className="duel">
        <div className="duel-board" ref={board}>
          {m.kind === "ttt" ? (
            <TicTacToe ttt={ttt} self={duels.self} note={note} />
          ) : m.kind === "cables" ? (
            <Cables key={m.id} match={m} self={duels.self} room={room} note={note} onEnd={(w) => onEnd("cables", w)} />
          ) : (
            <Pong key={m.id} match={m} self={duels.self} room={room} note={note} onEnd={(w) => onEnd("pong", w)} />
          )}
        </div>
        <div className="duel-tools">
          <button className="btn" onClick={duels.close}>
            {m.over || note ? "закрити" : "здатись і вийти"}
          </button>
          <FullscreenButton target={board} />
        </div>
      </div>
    );
  }
  if (!online) {
    return <p className="alerts-hint">Удвох грають з кимось, хто теж відкрив це кафе. Це працює в хмарному режимі.</p>;
  }
  return (
    <div className="ttt-lobby">
      {duels.waiting ? (
        <div className="ttt-wait">
          Чекаю, поки {duels.waiting.to.name} погодиться на {DUEL_NAMES[duels.waiting.kind]}…{" "}
          <button className="btn" onClick={duels.close}>
            скасувати
          </button>
        </div>
      ) : guests.length ? (
        <ul className="duel-guests">
          {guests.map((g) => (
            <li key={g.id}>
              <span>{g.name}</span>
              {KINDS.map((k) => (
                <button key={k} className="btn" onClick={() => duels.invite(k, g)}>
                  {DUEL_NAMES[k]}
                </button>
              ))}
            </li>
          ))}
        </ul>
      ) : (
        <p className="alerts-hint">Поки в кафе більше нікого. Запроси когось через двері або відкрий кафе на телефоні.</p>
      )}
      {duels.declined && <p className="alerts-hint">{duels.declined} зараз не хоче грати.</p>}
    </div>
  );
}
