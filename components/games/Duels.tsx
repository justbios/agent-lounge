"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, Timer, Volume2, VolumeX } from "lucide-react";
import { useTr, useUi } from "@/lib/i18n";
import { setClockPick, useClockPick } from "@/lib/live/clock";
import { CLOCKS, DuelKind, LiveDuel, Match, PARTY, TIMED, duelName, playersOf } from "@/lib/live/duel";
import { setSfxOn, unlockSfx, useSfxOn } from "@/lib/live/sfx";
import { Guest } from "@/lib/live/social";
import { Checkers as CheckersState } from "@/lib/live/useCheckers";
import { Chess as ChessState } from "@/lib/live/useChess";
import { Duels as DuelsState } from "@/lib/live/useDuels";
import { Four as FourState } from "@/lib/live/useFour";
import { Ttt } from "@/lib/live/useTicTacToe";
import Cables from "./Cables";
import Checkers from "./Checkers";
import Chess from "./Chess";
import Four from "./Four";
import FullscreenButton from "./FullscreenButton";
import Hockey from "./Hockey";
import Pong from "./Pong";
import Sumo from "./Sumo";
import TicTacToe from "./TicTacToe";

const KINDS: DuelKind[] = ["chess", "checkers", "hockey", "sumo", "four", "ttt", "pong", "cables"];

/** Everyone else at a match. */
const othersOf = (m: Match, self: string) => playersOf(m).filter((p) => p.id !== self);

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
  const rivals = othersOf(m, duels.self)
    .map((p) => p.name)
    .join(t(" і ", " and "));
  if (duels.away) return null;
  const ask = duels.again;
  if (ask) {
    return (
      <div className="rematch" role="alert">
        <span>
          <b>{ask.from.name}</b> {t("хоче ще раз", "wants another game")}
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
        <span>
          {m.z
            ? t(`Чекаю, поки ${rivals} погодяться…`, `Waiting for ${rivals} to say yes…`)
            : t(`Чекаю, поки ${rivals} погодиться…`, `Waiting for ${rivals} to say yes…`)}
        </span>
        <button className="btn" onClick={duels.cancel}>
          {t("скасувати", "cancel")}
        </button>
      </div>
    );
  }
  // a game for three is asked again by whoever asked for it the first time
  if (m.z && m.x.id !== duels.self) return null;
  const no = duels.declined && othersOf(m, duels.self).some((p) => p.name === duels.declined) ? duels.declined : null;
  return (
    <>
      <button className="btn ask-yes" onClick={duels.rematch}>
        <RotateCcw size={13} />
        {t("ще раз", "play again")}
      </button>
      {no && <span className="rematch-no">{t(`${no} зараз не хоче`, `${no} doesn't want to now`)}</span>}
    </>
  );
}

/** The match being played, or who in the café can be called to one and the invite in flight. */
export default function Duels({
  duels,
  ttt,
  chk,
  chess,
  four,
  guests,
  room,
  online,
  onEnd,
}: {
  duels: DuelsState;
  ttt: Ttt;
  chk: CheckersState;
  chess: ChessState;
  four: FourState;
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
  const [three, setThree] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
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
    const gone = m.left ?? othersOf(m, duels.self)[0].name;
    const note = m.over
      ? null
      : m.gone
        ? t(`${gone}: гру закрито`, `${gone} closed the game`)
        : duels.away
          ? t(`${duels.away} більше не в кафе`, `${duels.away} left the café`)
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
          ) : m.kind === "four" ? (
            <Four key={m.id} four={four} self={duels.self} note={note} />
          ) : m.kind === "sumo" ? (
            <Sumo key={m.id} match={m} self={duels.self} room={room} note={note} onEnd={(w) => onEnd("sumo", w)} />
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
          "Удвох і втрьох грають з тими, хто теж відкрив це кафе. Це працює в хмарному режимі.",
          "Games for two or three are played with others who opened this café. They work in cloud mode.",
        )}
      </p>
    );
  }
  const party = guests.filter((g) => picked.includes(g.id));
  const w = duels.waiting;
  const waitFor = w?.party
    ? w.party
        .filter((g) => !w.yes?.includes(g.id))
        .map((g) => g.name)
        .join(t(" і ", " and "))
    : w?.to.name;
  const ready = w?.party?.filter((g) => w.yes?.includes(g.id)).map((g) => g.name) ?? [];
  return (
    <div className="ttt-lobby">
      {w ? (
        <div className="ttt-wait">
          {w.party && !ready.length
            ? t(
                `Чекаю, поки ${waitFor} погодяться на ${gameName(w)} утрьох…`,
                `Waiting for ${waitFor} to say yes to ${gameName(w)} for three…`,
              )
            : t(
                `Чекаю, поки ${waitFor} погодиться на ${gameName(w)}…`,
                `Waiting for ${waitFor} to say yes to ${gameName(w)}…`,
              )}
          {ready.length > 0 && <small> {t(`${ready.join(", ")} уже з тобою`, `${ready.join(", ")} is in`)}</small>}{" "}
          <button className="btn" onClick={duels.close}>
            {t("скасувати", "cancel")}
          </button>
        </div>
      ) : guests.length ? (
        <>
          {guests.length >= 2 && (
            <div className="duel-mode" role="radiogroup" aria-label={t("скільки гравців", "how many players")}>
              {[false, true].map((v) => (
                <button
                  key={String(v)}
                  className={`btn${three === v ? " on" : ""}`}
                  role="radio"
                  aria-checked={three === v}
                  onClick={() => setThree(v)}
                >
                  {v ? t("утрьох", "for three") : t("удвох", "for two")}
                </button>
              ))}
            </div>
          )}
          {three && guests.length >= 2 ? (
            <div className="duel-party">
              <p className="alerts-hint">{t("Обери двох, з ким грати:", "Pick the two to play with:")}</p>
              <ul className="duel-guests">
                {guests.map((g) => {
                  const on = picked.includes(g.id);
                  return (
                    <li key={g.id}>
                      <label className="party-pick">
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={!on && party.length >= 2}
                          onChange={() =>
                            setPicked((list) => (on ? list.filter((x) => x !== g.id) : [...list, g.id].slice(-2)))
                          }
                        />
                        <span>{g.name}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div className="party-go">
                {PARTY.map((k) => (
                  <button key={k} className="btn" disabled={party.length !== 2} onClick={() => duels.invite(k, party)}>
                    {duelName(k, ui)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
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
          )}
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
