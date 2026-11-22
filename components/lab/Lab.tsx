"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { useTr, useUi } from "@/lib/i18n";
import type { BoardMove, Job } from "@/lib/live/bots/board";
import { think } from "@/lib/live/bots/think";
import { Bus } from "@/lib/live/bus";
import { legal as chkLegal } from "@/lib/live/checkers";
import { legal as chessLegal } from "@/lib/live/chess";
import { DuelKind, LiveDuel, duelName, sideOf } from "@/lib/live/duel";
import { COLS, landing } from "@/lib/live/four";
import { labState } from "@/lib/live/lab";
import { LEVELS, Level, SOLO_KINDS, botPlayer, isLevel } from "@/lib/live/solo";
import { useArenaNet } from "@/lib/live/useArenaNet";
import { useCheckers } from "@/lib/live/useCheckers";
import { useChess } from "@/lib/live/useChess";
import { useDuels } from "@/lib/live/useDuels";
import { useFour } from "@/lib/live/useFour";
import type { Scores } from "@/lib/live/useScores";
import type { Social } from "@/lib/live/useSocial";
import { useTicTacToe } from "@/lib/live/useTicTacToe";
import Duels from "../games/Duels";

/** attract mode starts the next game this long after one ends */
const AGAIN_MS = 4000;

/** A café with nobody in it and no line out: the games' hooks run on it as they are. */
function emptyCafe(name: string): Social {
  return {
    guests: [],
    bar: [],
    reactions: [],
    react: () => {},
    bus: new Bus(),
    self: "lab-you",
    name,
    room: null,
    disc: null,
    spin: () => {},
  };
}

const NO_SCORES: Scores = { rows: [], canRecord: false, record: () => {} };

interface Props {
  game?: string;
  level?: string;
  auto: boolean;
  seed?: number;
  speed?: number;
  clock?: number;
  second: boolean;
}

declare global {
  interface Window {
    /**
     * the lab's handle for Playwright: the game on screen as plain data, the moves the side to move may make, and
     * the move an agent of some level would make there (board games only; see docs/lab.md)
     */
    __lab?: {
      state: () => unknown;
      legal: () => BoardMove[];
      hint: (level?: Level, seed?: number) => Promise<BoardMove | null>;
    };
  }
}

/** Every game an agent plays, at each level and playing itself. */
function Index() {
  const ui = useUi();
  const t = useTr();
  const names: Record<Level, string> = { easy: t("легко", "easy"), normal: t("нормально", "normal"), hard: t("складно", "hard") };
  return (
    <main className="lab lab-index">
      <h1>{t("Лабораторія ігор", "Games lab")}</h1>
      <p className="alerts-hint">
        {t(
          "Лише для розробки. Кожне посилання відкриває гру на все вікно одразу в партії з агентом; як цим керувати з Playwright, написано в docs/lab.md.",
          "Development only. Each link opens a game on the whole window, straight into a match against an agent; docs/lab.md says how to drive it from Playwright.",
        )}
      </p>
      <ul>
        {SOLO_KINDS.map((k) => (
          <li key={k}>
            <b>{duelName(k, ui)}</b>
            {LEVELS.map((l) => (
              <a key={l} className="btn" href={`/lab?game=${k}&level=${l}`}>
                {names[l]}
              </a>
            ))}
            <a className="btn" href={`/lab?game=${k}&level=hard&auto=1&seed=1`}>
              {t("агенти самі", "agents alone")}
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}

function Table({ kind, level, auto, seed, speed, clock, second }: Omit<Props, "game" | "level"> & { kind: DuelKind; level: Level }) {
  const t = useTr();
  const you = t("Ти", "You");
  const agent = t("Агент", "Agent");
  const social = useMemo(() => emptyCafe(you), [you]);
  const duels = useDuels(social);
  const ttt = useTicTacToe(duels, social, NO_SCORES);
  const chk = useCheckers(duels, social, NO_SCORES);
  const chess = useChess(duels, social, NO_SCORES);
  const four = useFour(duels, social, NO_SCORES);
  const arena = useArenaNet(duels, social, NO_SCORES);
  const [begun, setBegun] = useState(false);
  const [won, setWon] = useState<boolean | null>(null);

  const begin = useEffectEvent(() => {
    const id = seed === undefined ? undefined : `lab-${kind}-${seed}`;
    duels.solo(kind, botPlayer("lab", agent), { level, auto, seed, speed }, { id, clock, second });
    setBegun(true);
  });
  useEffect(() => {
    // a moment after the page is up, so the game starts once however often the effect runs
    const timer = setTimeout(begin, 0);
    return () => clearTimeout(timer);
  }, []);

  const m = duels.match;
  const board = chess.board ?? chk.board ?? four.board ?? ttt.board;
  const mine = m ? sideOf(m, social.self) : null;

  // what is on screen as plain data, for Playwright
  const read = useEffectEvent(() => board ?? labState());
  const job = useEffectEvent((how: Level, chance: number): Job | null => {
    if (!m || m.over) return null;
    if (chess.board) return { kind: "chess", board: chess.board, level: how, seed: chance };
    if (chk.board) return { kind: "checkers", board: chk.board, level: how, seed: chance };
    if (four.board) return { kind: "four", board: four.board, level: how, seed: chance };
    if (ttt.board) return { kind: "ttt", board: ttt.board, level: how, seed: chance };
    return null;
  });
  const moves = useEffectEvent((): BoardMove[] => {
    const j = job("easy", 0);
    if (!j || j.board.winner) return [];
    if (j.kind === "chess") return chessLegal(j.board);
    if (j.kind === "checkers") return chkLegal(j.board);
    const cells = j.board.cells;
    if (j.kind === "four") return Array.from({ length: COLS }, (_, c) => c).filter((c) => landing(cells, c) >= 0);
    return cells.flatMap((c, i) => (c ? [] : [i]));
  });
  useEffect(() => {
    window.__lab = {
      state: () => read(),
      legal: () => moves(),
      hint: async (how = "hard", chance = 1) => {
        const j = job(how, chance);
        return j ? think(j) : null;
      },
    };
    return () => {
      delete window.__lab;
    };
  }, []);

  // attract mode plays on by itself
  const again = useEffectEvent(() => duels.rematch());
  const over = !!m?.over;
  useEffect(() => {
    if (!auto || !over) return;
    const timer = setTimeout(again, AGAIN_MS);
    return () => clearTimeout(timer);
  }, [auto, over]);

  const result = !m?.over
    ? undefined
    : board
      ? board.winner === "draw"
        ? "drawn"
        : board.winner === mine
          ? "won"
          : "lost"
      : won === null
        ? undefined
        : won
          ? "won"
          : "lost";
  const end = (_: LiveDuel, win: boolean) => {
    setWon(win);
    if (duels.match) duels.finish(duels.match.id);
  };
  return (
    <main
      className="lab"
      data-game={kind}
      data-level={level}
      data-side={mine ?? undefined}
      data-turn={board && !board.winner ? board.turn : undefined}
      data-ply={board ? ("moves" in board ? board.moves.length : board.cells.filter(Boolean).length) : undefined}
      data-over={m?.over ? "" : undefined}
      data-result={result}
    >
      {m ? (
        <Duels
          duels={duels}
          ttt={ttt}
          chk={chk}
          chess={chess}
          four={four}
          arena={arena}
          guests={[]}
          room={null}
          online={false}
          agents={[]}
          roster={[]}
          rows={null}
          onEnd={end}
        />
      ) : (
        begun && (
          <p className="alerts-hint">
            {t("Гру закрито.", "The game is closed.")} <a href="/lab">{t("До списку ігор", "Back to the games")}</a>
          </p>
        )
      )}
    </main>
  );
}

/** The lab page: the game its address names, or the list of them. */
export default function Lab({ game, level, ...rest }: Props) {
  const kind = SOLO_KINDS.find((k) => k === game);
  if (!kind) return <Index />;
  const how = isLevel(level) ? level : "normal";
  return <Table key={`${kind}.${how}.${rest.seed ?? ""}`} kind={kind} level={how} {...rest} />;
}
