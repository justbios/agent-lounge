"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useTr } from "@/lib/i18n";
import { DuelKind, LiveDuel, Match, playersOf } from "@/lib/live/duel";
import type { LookPick } from "@/lib/live/interior";
import { setSfxOn, unlockSfx, useSfxOn } from "@/lib/live/sfx";
import { Guest } from "@/lib/live/social";
import { useBotThinking } from "@/lib/live/soloStore";
import { Checkers as CheckersState } from "@/lib/live/useCheckers";
import { Chess as ChessState } from "@/lib/live/useChess";
import { Duels as DuelsState } from "@/lib/live/useDuels";
import type { HourRow } from "@/lib/live/recap";
import type { ArenaNet } from "@/lib/live/useArenaNet";
import { Four as FourState } from "@/lib/live/useFour";
import { Ttt } from "@/lib/live/useTicTacToe";
import type { AgentDef } from "@/lib/types";
import ArenaDuel from "./ArenaDuel";
import Cables from "./Cables";
import Checkers from "./Checkers";
import Chess from "./Chess";
import Four from "./Four";
import Hockey from "./Hockey";
import MatchFrame from "./match/MatchFrame";
import Pong from "./Pong";
import Sumo from "./Sumo";
import TicTacToe from "./TicTacToe";
import Lobby from "./hall/Lobby";
import { rivalsOf } from "./hall/games";
import { recalledGame } from "./hall/last";

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

/**
 * Once a game is over, another one with the same person on the same board: the button, the wait for their yes, or
 * their own ask to answer. Whoever asks moves first, as with any invite. One of the café's agents never has to be
 * asked: the next game starts at once.
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

/**
 * The match being played, or the games to pick from and who to play with: one of the café's own agents, at once and
 * with nothing sent anywhere, or a guest, by invite.
 */
export default function Duels({
  duels,
  ttt,
  chk,
  chess,
  four,
  arena,
  guests,
  room,
  online,
  agents,
  looks,
  roster,
  rows,
  onEnd,
  onShut,
}: {
  duels: DuelsState;
  ttt: Ttt;
  chk: CheckersState;
  chess: ChessState;
  four: FourState;
  arena: ArenaNet;
  guests: Guest[];
  room: string | null;
  online: boolean;
  /** the café's agents, roster and last week: the squad for the agents' battle, and who to play against alone */
  agents: AgentDef[];
  /** how the café dressed its agents, for their faces in the list */
  looks?: Record<string, LookPick>;
  roster: string[];
  rows: HourRow[] | null;
  /** a real-time match was played to the end */
  onEnd: (kind: LiveDuel, win: boolean) => void;
  /** closes the games altogether: «закрити» on a match's result card, shown only where this is given */
  onShut?: () => void;
}) {
  const t = useTr();
  // the board and its buttons go full screen together, so «play again» is there once a game ends
  const board = useRef<HTMLDivElement>(null);
  const thinking = useBotThinking(duels.match?.id);
  // the café's agents as they look at their desks: the faces at the seats and on the cards of a match
  const barista = t("Бариста", "Barista");
  const rivals = useMemo(() => rivalsOf(agents, looks ?? {}, barista), [agents, looks, barista]);
  const [game, setGame] = useState<DuelKind | null>(recalledGame);
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
      <MatchFrame
        frame={board}
        duels={duels}
        boards={{
          ttt: ttt.board,
          four: four.board,
          checkers: chk.board,
          chess: chess.board,
          timeOut: (m.kind === "chess" ? chess.clock : m.kind === "checkers" ? chk.clock : null)?.out ?? null,
        }}
        faces={rivals}
        thinking={!!thinking}
        note={note}
        again={<Rematch duels={duels} />}
        sound={<SoundButton />}
        onEnd={onEnd}
        onShut={onShut}
      >
        {(end) =>
          m.kind === "arena" || m.kind === "raid" ? (
            <ArenaDuel
              key={m.id}
              net={arena}
              self={duels.self}
              agents={agents}
              roster={roster}
              rows={rows}
              note={note}
              onLeave={duels.close}
            />
          ) : m.kind === "ttt" ? (
            <TicTacToe key={m.id} ttt={ttt} self={duels.self} note={note} />
          ) : m.kind === "checkers" ? (
            <Checkers key={m.id} chk={chk} self={duels.self} note={note} />
          ) : m.kind === "chess" ? (
            <Chess key={m.id} chess={chess} self={duels.self} note={note} />
          ) : m.kind === "four" ? (
            <Four key={m.id} four={four} self={duels.self} note={note} />
          ) : m.kind === "sumo" ? (
            <Sumo key={m.id} match={m} self={duels.self} room={room} note={note} onEnd={(w) => end("sumo", w)} />
          ) : m.kind === "cables" ? (
            <Cables key={m.id} match={m} self={duels.self} room={room} note={note} onEnd={(w) => end("cables", w)} />
          ) : m.kind === "hockey" ? (
            <Hockey key={m.id} match={m} self={duels.self} room={room} note={note} onEnd={(w) => end("hockey", w)} />
          ) : (
            <Pong key={m.id} match={m} self={duels.self} room={room} note={note} onEnd={(w) => end("pong", w)} />
          )
        }
      </MatchFrame>
    );
  }
  return (
    <Lobby
      duels={duels}
      guests={guests}
      online={online}
      agents={agents}
      looks={looks}
      game={game}
      onGame={setGame}
      picked={picked}
      onPicked={setPicked}
    />
  );
}
