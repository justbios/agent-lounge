"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Gauge, RotateCcw, Timer, Volume2, VolumeX } from "lucide-react";
import { Two, useTr, useUi } from "@/lib/i18n";
import { WIN_AT as CABLES_AT } from "@/lib/live/cables";
import { setClockPick, useClockPick } from "@/lib/live/clock";
import { CLOCKS, DuelKind, LiveDuel, Match, PARTY, TIMED, duelName, playersOf } from "@/lib/live/duel";
import { WIN_AT as HOCKEY_AT } from "@/lib/live/hockey";
import { LookPick, lookKey, lookOf } from "@/lib/live/interior";
import { WIN_AT as PONG_AT } from "@/lib/live/pong";
import { WIN_AT as SUMO_AT } from "@/lib/live/sumo";
import { setSfxOn, unlockSfx, useSfxOn } from "@/lib/live/sfx";
import { Guest } from "@/lib/live/social";
import { LEVELS, Level, SOLO_KINDS, botPlayer } from "@/lib/live/solo";
import { setSoloLevel, useBotThinking, useSoloLevel, useSoloTally } from "@/lib/live/soloStore";
import { Checkers as CheckersState } from "@/lib/live/useCheckers";
import { Chess as ChessState } from "@/lib/live/useChess";
import { Duels as DuelsState } from "@/lib/live/useDuels";
import type { HourRow } from "@/lib/live/recap";
import type { ArenaNet } from "@/lib/live/useArenaNet";
import { Four as FourState } from "@/lib/live/useFour";
import { Ttt } from "@/lib/live/useTicTacToe";
import type { AgentDef } from "@/lib/types";
import AgentSprite from "../cafe/AgentSprite";
import { BARISTA } from "../cafe/ambient";
import { Look, lookFor, pickedLook } from "../cafe/people";
import ArenaDuel from "./ArenaDuel";
import Cables from "./Cables";
import Checkers from "./Checkers";
import Chess from "./Chess";
import Four from "./Four";
import FullscreenButton from "./FullscreenButton";
import Hockey from "./Hockey";
import Pong from "./Pong";
import Sumo from "./Sumo";
import TicTacToe from "./TicTacToe";

/** The games to pick from, each with its sign and what it is about in a few words. */
const GAMES: { kind: DuelKind; icon: string; about: Two }[] = [
  {
    kind: "arena",
    icon: "⚔️",
    about: { uk: "твій загін агентів проти загону іншої людини", en: "your agent squad against someone else's" },
  },
  {
    kind: "raid",
    icon: "🗿",
    about: { uk: "удвох, по три агенти, проти легасі-моноліту", en: "together, three agents each, against the legacy monolith" },
  },
  { kind: "chess", icon: "♞", about: { uk: "мат королю перемагає", en: "checkmate wins" } },
  {
    kind: "checkers",
    icon: "⚪",
    about: { uk: "бити обов'язково, і назад теж", en: "you must capture, backwards too" },
  },
  {
    kind: "hockey",
    icon: "🏒",
    about: { uk: `заганяй шайбу у ворота, до ${HOCKEY_AT}`, en: `score the puck, first to ${HOCKEY_AT}` },
  },
  {
    kind: "sumo",
    icon: "🤼",
    about: { uk: `виштовхни інших з крижини, до ${SUMO_AT}`, en: `push the others off the ice, first to ${SUMO_AT}` },
  },
  { kind: "four", icon: "🔴", about: { uk: "склади чотири фішки підряд", en: "line up four discs" } },
  { kind: "ttt", icon: "❌", about: { uk: "три в ряд на полі 3×3", en: "three in a row on a 3×3 board" } },
  {
    kind: "pong",
    icon: "🏓",
    about: { uk: `відбивай м'яч, до ${PONG_AT}`, en: `hit the ball back, first to ${PONG_AT}` },
  },
  {
    kind: "cables",
    icon: "🔌",
    about: {
      uk: `тягни кабель і не врізайся, до ${CABLES_AT}`,
      en: `drag your cable without crashing, first to ${CABLES_AT}`,
    },
  },
];

/** at most this many of the café's agents are offered to play against */
const MOST_RIVALS = 8;

/** One of the café's own to play against: an agent as it looks at its desk, or the barista. */
interface Rival {
  key: string;
  name: string;
  color: string;
  look: Look;
}

/**
 * Who in the café can be played against right now: its agents, each once, under the names and looks they wear at
 * their desks. A café with no agent at work still has its barista.
 */
function rivalsOf(agents: AgentDef[], looks: Record<string, LookPick>, barista: string): Rival[] {
  const seen = new Set<string>();
  const out: Rival[] = [];
  agents.forEach((a, i) => {
    const key = lookKey(a);
    // a teammate's desk in the lobby stands for a person, not an agent
    if (seen.has(key) || a.member != null) return;
    seen.add(key);
    const base = a.look ?? i;
    out.push({ key, name: a.name, color: a.color, look: lookFor(base, a.color, pickedLook(lookOf(looks, a), base)) });
  });
  if (!out.length) return [{ key: "barista", name: barista, color: "#e9e2cf", look: BARISTA }];
  return out.slice(0, MOST_RIVALS);
}

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

/** How well the café's agents play, for this browser. */
function LevelPick() {
  const t = useTr();
  const level = useSoloLevel();
  const names: Record<Level, string> = {
    easy: t("легко", "easy"),
    normal: t("нормально", "normal"),
    hard: t("складно", "hard"),
  };
  return (
    <div className="clock-pick" role="radiogroup" aria-label={t("як сильно грає агент", "how well the agent plays")}>
      <span>
        <Gauge size={13} /> {t("рівень агента", "agent's level")}
      </span>
      {LEVELS.map((l) => (
        <button
          key={l}
          className={`btn${l === level ? " on" : ""}`}
          role="radio"
          aria-checked={l === level}
          onClick={() => setSoloLevel(l)}
        >
          {names[l]}
        </button>
      ))}
    </div>
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
}) {
  const ui = useUi();
  const t = useTr();
  // the board and its buttons go full screen together, so «play again» is there once a game ends
  const board = useRef<HTMLDivElement>(null);
  const pick = useClockPick();
  const level = useSoloLevel();
  const tally = useSoloTally();
  const thinking = useBotThinking(duels.match?.id);
  const [game, setGame] = useState<DuelKind | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const barista = t("Бариста", "Barista");
  const rivals = useMemo(() => rivalsOf(agents, looks ?? {}, barista), [agents, looks, barista]);
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
      <div className="duel" ref={board} data-solo={m.solo?.level} data-thinking={thinking ? "" : undefined}>
        <div className="duel-board">
          {m.kind === "arena" || m.kind === "raid" ? (
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
  const w = duels.waiting;
  const waitFor = w?.party
    ? w.party
        .filter((g) => !w.yes?.includes(g.id))
        .map((g) => g.name)
        .join(t(" і ", " and "))
    : w?.to.name;
  const ready = w?.party?.filter((g) => w.yes?.includes(g.id)).map((g) => g.name) ?? [];
  if (w) {
    return (
      <div className="ttt-lobby">
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
      </div>
    );
  }
  const most = game && PARTY.includes(game) ? 2 : 1;
  const chosen = guests.filter((g) => picked.includes(g.id)).slice(0, most);
  const clock = game && TIMED.includes(game) ? pick : 0;
  /** this game can be played against one of the café's agents */
  const alone = !!game && SOLO_KINDS.includes(game);
  const mine = game ? tally[game] : undefined;
  const score = mine && mine.won + mine.lost + mine.drawn > 0 ? mine : null;
  const names = chosen.map((g) => g.name).join(t(" і ", " and "));
  const go = () => {
    if (!game || !chosen.length) return;
    if (chosen.length === 2) duels.invite(game, chosen);
    else duels.invite(game, chosen[0], clock);
  };
  const toggle = (id: string) =>
    setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id].slice(-most)));
  return (
    <div className="ttt-lobby">
      <div className="gtiles" role="radiogroup" aria-label={t("гра", "game")}>
        {GAMES.map((g) => (
          <button
            key={g.kind}
            className={`gtile${game === g.kind ? " on" : ""}`}
            role="radio"
            aria-checked={game === g.kind}
            onClick={() => setGame(g.kind)}
          >
            <span className="gtile-ic" aria-hidden>
              {g.icon}
            </span>
            <b>{duelName(g.kind, ui)}</b>
            <small>{g.about[ui]}</small>
            <span className="gtile-n">
              {SOLO_KINDS.includes(g.kind)
                ? PARTY.includes(g.kind)
                  ? t("агент або 2–3 гравці", "an agent or 2–3 players")
                  : t("агент або удвох", "an agent or 2 players")
                : PARTY.includes(g.kind)
                  ? t("2–3 гравці", "2–3 players")
                  : t("удвох", "2 players")}
            </span>
          </button>
        ))}
      </div>
      {game && (
        <div className="gwho">
          {alone && (
            <>
              <div className="gwho-ttl gwho-bot">
                <Bot size={13} />
                {t(
                  "З агентом кафе: гра почнеться одразу",
                  "Against one of the café's agents: the game starts at once",
                )}
              </div>
              <div className="gset">
                <LevelPick />
                {TIMED.includes(game) && <ClockPick />}
              </div>
              <div className="gbots">
                {rivals.map((r) => (
                  <button
                    key={r.key}
                    className="gbot"
                    aria-label={t(`Грати з агентом ${r.name}`, `Play against ${r.name}`)}
                    onClick={() => duels.solo(game, botPlayer(r.key, r.name), { level }, { clock })}
                  >
                    <AgentSprite look={r.look} label={r.name} />
                    <b style={{ color: r.color }}>{r.name}</b>
                    <small>▶ {t("грати", "play")}</small>
                  </button>
                ))}
              </div>
              {score && (
                <div className="gbot-tally">
                  {t(
                    `твій рахунок з агентами в цій грі: ${score.won} : ${score.lost}`,
                    `you against the agents at this game: ${score.won} : ${score.lost}`,
                  )}
                  {score.drawn > 0 && t(` · нічиїх ${score.drawn}`, ` · ${score.drawn} drawn`)}
                </div>
              )}
            </>
          )}
          {online && guests.length ? (
            <>
              <div className={`gwho-ttl${alone ? " gwho-or" : ""}`}>
                {alone
                  ? most === 2
                    ? t("Або з гостями кафе: познач одного чи двох", "Or with the café's guests: pick one or two")
                    : t("Або з гостем кафе", "Or with a guest of the café")
                  : most === 2
                    ? t("З ким? Познач одного або двох", "Who with? Pick one or two")
                    : t("З ким?", "Who with?")}
              </div>
              <div className="gchips">
                {guests.map((g) => {
                  const on = chosen.some((c) => c.id === g.id);
                  return (
                    <button
                      key={g.id}
                      className={`gchip${on ? " on" : ""}`}
                      aria-pressed={on}
                      onClick={() => toggle(g.id)}
                    >
                      {g.name}
                    </button>
                  );
                })}
              </div>
              {TIMED.includes(game) && !alone && <ClockPick />}
              <button className="btn ask-yes ggo" disabled={!chosen.length} onClick={go}>
                {chosen.length
                  ? t(`▶ Запросити: ${names}`, `▶ Invite ${names}`)
                  : t("Познач, з ким грати", "Pick who to play with")}
              </button>
            </>
          ) : (
            <p className={`alerts-hint${alone ? " gwho-or" : ""}`}>
              {!online
                ? alone
                  ? t(
                      "З людьми грають у хмарному режимі: тоді тут з'являться гості кафе.",
                      "Games with people work in cloud mode: the café's guests show up here then.",
                    )
                  : t(
                      "У цю гру грають з тими, хто теж відкрив це кафе. Це працює в хмарному режимі.",
                      "This game is played with others who opened this café. It works in cloud mode.",
                    )
                : alone
                  ? t(
                      "Гостей у кафе зараз немає. Запроси когось через двері в сцені, і зіграєте удвох.",
                      "No guests in the café right now. Invite someone through the door in the scene to play together.",
                    )
                  : t(
                      "Поки в кафе більше нікого. Запроси когось через двері в сцені: щойно людина відкриє кафе, " +
                        "її ім'я з'явиться тут.",
                      "Nobody else is in the café yet. Invite someone through the door in the scene: once they open " +
                        "the café, their name shows up here.",
                    )}
            </p>
          )}
        </div>
      )}
      {duels.declined && (
        <p className="alerts-hint">
          {t(`${duels.declined} зараз не хоче грати.`, `${duels.declined} does not want to play right now.`)}
        </p>
      )}
    </div>
  );
}
