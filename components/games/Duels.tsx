"use client";

import { useEffect, useRef } from "react";
import { RotateCcw, Timer, Volume2, VolumeX } from "lucide-react";
import { useTr, useUi } from "@/lib/i18n";
import { setClockPick, useClockPick } from "@/lib/live/clock";
import { CLOCKS, DuelKind, LiveDuel, TIMED, duelName } from "@/lib/live/duel";
import { setSfxOn, unlockSfx, useSfxOn } from "@/lib/live/sfx";
import { Guest } from "@/lib/live/social";
import { Checkers as CheckersState } from "@/lib/live/useCheckers";
import { Chess as ChessState } from "@/lib/live/useChess";
import { Duels as DuelsState } from "@/lib/live/useDuels";
import { Ttt } from "@/lib/live/useTicTacToe";
import Cables from "./Cables";
import Checkers from "./Checkers";
import Chess from "./Chess";
import FullscreenButton from "./FullscreenButton";
import Hockey from "./Hockey";
import Pong from "./Pong";
import TicTacToe from "./TicTacToe";

const KINDS: DuelKind[] = ["chess", "checkers", "hockey", "ttt", "pong", "cables"];

/** The games' sounds on and off, for this browser. */
function SoundButton() {
  const t = useTr();
  const on = useSfxOn();
  const label = on ? t("вимкнути звуки гри", "mute the game") : t("увімкнути звуки гри", "unmute the game");
  return (
    <button className="btn btn-ic" onClick={() => setSfxOn(!on)} title={label} aria-label={label}>
      {on ? <Volume2 size={14} /> : <VolumeX size={14} />}
    </button>
  );
}

/** The clock chess and draughts are offered with: none, or minutes a side. */
function ClockPick() {
  const t = useTr();
  const pick = useClockPick();
  return (
    <div
      className="clock-pick"
      role="radiogroup"
      aria-label={t("годинник для шахів і шашок", "clock for chess and checkers")}
    >
      <span>
        <Timer size={13} /> {t("шахи й шашки", "chess and checkers")}
      </span>
      {CLOCKS.map((s) => (
        <button
          key={s}
          className={`btn${s === pick ? " on" : ""}`}
          role="radio"
          aria-checked={s === pick}
          onClick={() => setClockPick(s)}
        >
          {s ? t(`${s / 60} хв`, `${s / 60} min`) : t("без годинника", "no clock")}
        </button>
      ))}
    </div>
  );
}

/**
 * Once a game is over, another one with the same person on the same board: the button, the wait for their yes, or
 * their own ask to answer. Whoever asks moves first, as with any invite.
 */
function Rematch({ duels }: { duels: DuelsState }) {
  const t = useTr();
  const m = duels.match!;
  const rival = m.x.id === duels.self ? m.o : m.x;
  if (duels.away) return null;
  const ask = duels.again;
  if (ask) {
    return (
      <div className="rematch" role="alert">
        <span>
          <b>{rival.name}</b> {t("хоче ще раз", "wants another game")}
        </span>
        <button className="btn ask-yes" onClick={() => duels.accept(ask)}>
          {t("грати", "play")}
        </button>
        <button className="btn" onClick={() => duels.decline(ask)}>
          {t("ні", "no")}
        </button>
      </div>
    );
  }
  if (duels.waiting?.again === m.id) {
    return (
      <div className="rematch">
        <span>{t(`Чекаю, поки ${rival.name} погодиться…`, `Waiting for ${rival.name} to say yes…`)}</span>
        <button className="btn" onClick={duels.cancel}>
          {t("скасувати", "cancel")}
        </button>
      </div>
    );
  }
  return (
    <>
      <button className="btn ask-yes" onClick={duels.rematch}>
        <RotateCcw size={13} />
        {t("ще раз", "play again")}
      </button>
      {duels.declined === rival.name && (
        <span className="rematch-no">{t(`${rival.name} зараз не хоче`, `${rival.name} doesn't want to now`)}</span>
      )}
    </>
  );
}

/** The match being played, or who in the café can be called to one and the invite in flight. */
export default function Duels({
  duels,
  ttt,
  chk,
  chess,
  guests,
  room,
  online,
  onEnd,
}: {
  duels: DuelsState;
  ttt: Ttt;
  chk: CheckersState;
  chess: ChessState;
  guests: Guest[];
  room: string | null;
  online: boolean;
  /** a real-time match was played to the end */
  onEnd: (kind: LiveDuel, win: boolean) => void;
}) {
  const ui = useUi();
  const t = useTr();
  const board = useRef<HTMLDivElement>(null);
  const pick = useClockPick();
  useEffect(() => {
    window.addEventListener("pointerdown", unlockSfx, true);
    window.addEventListener("keydown", unlockSfx, true);
    return () => {
      window.removeEventListener("pointerdown", unlockSfx, true);
      window.removeEventListener("keydown", unlockSfx, true);
    };
  }, []);
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
            <TicTacToe key={m.id} ttt={ttt} self={duels.self} note={note} />
          ) : m.kind === "checkers" ? (
            <Checkers key={m.id} chk={chk} self={duels.self} note={note} />
          ) : m.kind === "chess" ? (
            <Chess key={m.id} chess={chess} self={duels.self} note={note} />
          ) : m.kind === "cables" ? (
            <Cables key={m.id} match={m} self={duels.self} room={room} note={note} onEnd={(w) => onEnd("cables", w)} />
          ) : m.kind === "hockey" ? (
            <Hockey key={m.id} match={m} self={duels.self} room={room} note={note} onEnd={(w) => onEnd("hockey", w)} />
          ) : (
            <Pong key={m.id} match={m} self={duels.self} room={room} note={note} onEnd={(w) => onEnd("pong", w)} />
          )}
        </div>
        <div className="duel-tools">
          {(m.over || m.gone) && <Rematch duels={duels} />}
          <button className="btn" onClick={duels.close}>
            {m.over || note ? t("закрити", "close") : t("здатись і вийти", "give up and leave")}
          </button>
          <SoundButton />
          <FullscreenButton target={board} />
        </div>
      </div>
    );
  }
  const gameName = (g: { kind: DuelKind; clock?: number }) =>
    duelName(g.kind, ui) + (g.clock ? t(` на ${g.clock / 60} хв`, ` on ${g.clock / 60} min`) : "");
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
            `Чекаю, поки ${duels.waiting.to.name} погодиться на ${gameName(duels.waiting)}…`,
            `Waiting for ${duels.waiting.to.name} to say yes to ${gameName(duels.waiting)}…`,
          )}{" "}
          <button className="btn" onClick={duels.close}>
            {t("скасувати", "cancel")}
          </button>
        </div>
      ) : guests.length ? (
        <>
          <ClockPick />
          <ul className="duel-guests">
            {guests.map((g) => (
              <li key={g.id}>
                <span>{g.name}</span>
                {KINDS.map((k) => {
                  const clock = TIMED.includes(k) ? pick : 0;
                  return (
                    <button
                      key={k}
                      className="btn"
                      onClick={() => duels.invite(k, g, clock)}
                      aria-label={clock ? gameName({ kind: k, clock }) : undefined}
                    >
                      {duelName(k, ui)}
                      {clock > 0 && <small className="clock-tag">{clock / 60}′</small>}
                    </button>
                  );
                })}
              </li>
            ))}
          </ul>
        </>
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
