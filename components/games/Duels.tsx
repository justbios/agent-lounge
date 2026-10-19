"use client";

import { useRef } from "react";
import { useTr, useUi } from "@/lib/i18n";
import { DuelKind, LiveDuel, duelName } from "@/lib/live/duel";
import { Guest } from "@/lib/live/social";
import { Checkers as CheckersState } from "@/lib/live/useCheckers";
import { Duels as DuelsState } from "@/lib/live/useDuels";
import { Ttt } from "@/lib/live/useTicTacToe";
import Cables from "./Cables";
import Checkers from "./Checkers";
import FullscreenButton from "./FullscreenButton";
import Hockey from "./Hockey";
import Pong from "./Pong";
import TicTacToe from "./TicTacToe";

const KINDS: DuelKind[] = ["hockey", "checkers", "ttt", "pong", "cables"];

/** The match being played, or who in the café can be called to one and the invite in flight. */
export default function Duels({
  duels,
  ttt,
  chk,
  guests,
  room,
  online,
  onEnd,
}: {
  duels: DuelsState;
  ttt: Ttt;
  chk: CheckersState;
  guests: Guest[];
  room: string | null;
  online: boolean;
  /** a real-time match was played to the end */
  onEnd: (kind: LiveDuel, win: boolean) => void;
}) {
  const ui = useUi();
  const t = useTr();
  const board = useRef<HTMLDivElement>(null);
  const m = duels.match;
  if (m) {
    const rival = m.x.id === duels.self ? m.o : m.x;
    const note = m.over
      ? null
      : m.gone
        ? t(`${rival.name}: гру закрито`, `${rival.name} closed the game`)
        : duels.away
          ? t(`${rival.name} більше не в кафе`, `${rival.name} left the café`)
          : null;
    return (
      <div className="duel">
        <div className="duel-board" ref={board}>
          {m.kind === "ttt" ? (
            <TicTacToe ttt={ttt} self={duels.self} note={note} />
          ) : m.kind === "checkers" ? (
            <Checkers chk={chk} self={duels.self} note={note} />
          ) : m.kind === "cables" ? (
            <Cables key={m.id} match={m} self={duels.self} room={room} note={note} onEnd={(w) => onEnd("cables", w)} />
          ) : m.kind === "hockey" ? (
            <Hockey key={m.id} match={m} self={duels.self} room={room} note={note} onEnd={(w) => onEnd("hockey", w)} />
          ) : (
            <Pong key={m.id} match={m} self={duels.self} room={room} note={note} onEnd={(w) => onEnd("pong", w)} />
          )}
        </div>
        <div className="duel-tools">
          <button className="btn" onClick={duels.close}>
            {m.over || note ? t("закрити", "close") : t("здатись і вийти", "give up and leave")}
          </button>
          <FullscreenButton target={board} />
        </div>
      </div>
    );
  }
  if (!online) {
    return (
      <p className="alerts-hint">
        {t(
          "Удвох грають з кимось, хто теж відкрив це кафе. Це працює в хмарному режимі.",
          "Games for two are played with someone else who opened this café. They work in cloud mode.",
        )}
      </p>
    );
  }
  return (
    <div className="ttt-lobby">
      {duels.waiting ? (
        <div className="ttt-wait">
          {t(
            `Чекаю, поки ${duels.waiting.to.name} погодиться на ${duelName(duels.waiting.kind, ui)}…`,
            `Waiting for ${duels.waiting.to.name} to say yes to ${duelName(duels.waiting.kind, ui)}…`,
          )}{" "}
          <button className="btn" onClick={duels.close}>
            {t("скасувати", "cancel")}
          </button>
        </div>
      ) : guests.length ? (
        <ul className="duel-guests">
          {guests.map((g) => (
            <li key={g.id}>
              <span>{g.name}</span>
              {KINDS.map((k) => (
                <button key={k} className="btn" onClick={() => duels.invite(k, g)}>
                  {duelName(k, ui)}
                </button>
              ))}
            </li>
          ))}
        </ul>
      ) : (
        <p className="alerts-hint">
          {t(
            "Поки в кафе більше нікого. Запроси когось через двері в сцені: щойно людина відкриє кафе, " +
              "тут з'явиться її ім'я й кнопки ігор.",
            "Nobody else is in the café yet. Invite someone through the door in the scene: once they open the café, " +
              "their name and the game buttons show up here.",
          )}
        </p>
      )}
      {duels.declined && (
        <p className="alerts-hint">
          {t(`${duels.declined} зараз не хоче грати.`, `${duels.declined} does not want to play right now.`)}
        </p>
      )}
    </div>
  );
}
