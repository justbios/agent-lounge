"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";
import { useTr } from "@/lib/i18n";
import { Kind, Move, N, PROMOS, VALUE, checked, kindOf, legal, light, owner, sqName } from "@/lib/live/chess";
import type { ChessBoard } from "@/lib/live/chess";
import { Side, sideOf } from "@/lib/live/duel";
import { sfx } from "@/lib/live/sfx";
import { boardSfx } from "@/lib/live/sounds/boards";
import { Chess as ChessState } from "@/lib/live/useChess";
import BoardFrame from "./BoardFrame";
import Finale, { Mood } from "./Finale";
import GameClock, { useLowClock, useTimeUp } from "./GameClock";
import Seat, { BoardSay } from "./Seat";
import { ChessPiece } from "./Sprite";
import { FINAL_MS, INTRO_MS } from "./beats";
import BoardFx, { BoardFxHandle } from "./boards/BoardFx";
import { attackers, between, heft, trayOf } from "./boards/chessView";
import { useDrag } from "./boards/drag";
import {
  FLY_MS,
  Gait,
  KNOCK_MS,
  Trip,
  calm,
  flyOff,
  headShake,
  heading,
  landings,
  rackOpen,
  shake,
  spot,
  travel,
  trayPop,
  useLater,
  useStage,
} from "./boards/motion";
import { BLACK, WHITE } from "./sprites";

const NAMES: Record<Kind, [uk: string, en: string]> = {
  k: ["король", "king"],
  q: ["ферзь", "queen"],
  r: ["тура", "rook"],
  b: ["слон", "bishop"],
  n: ["кінь", "knight"],
  p: ["пішак", "pawn"],
};
/** "твоя тура", "твій кінь" */
const whose = (k: Kind, mine: boolean) => (k === "r" ? (mine ? "твоя" : "чужа") : mine ? "твій" : "чужий");

const worth = (b: ChessBoard, s: Side) => b.cells.reduce((n, p) => n + (owner(p) === s ? VALUE[kindOf(p)] : 0), 0);
const other = (s: Side): Side => (s === "x" ? "o" : "x");
/** the colours a piece breaks into when it is hit */
const chipsOf = (s: Side) => (s === "x" ? [WHITE.w, WHITE.s] : [BLACK.w, BLACK.s, "#7a6aa8"]);
const GOLD = ["#ffd25a", "#fff3c4", "#ffc456", "#ff6aa8"];

/**
 * A side's tray: the pieces it has taken, the heaviest first and like beside like, and how far ahead it is. The one
 * just taken is marked, so the piece knocked off the board has somewhere to land.
 */
function Tray({ b, side, fresh }: { b: ChessBoard; side: Side; fresh: boolean }) {
  const got = trayOf(b.taken, side);
  const lead = worth(b, side) - worth(b, other(side));
  // the latest capture is this side's when the piece it took is the other's
  const newest = fresh && b.san.at(-1)?.includes("x") ? b.taken.length - 1 : -1;
  return (
    <span className="took-tray" data-tray={side}>
      {got.length > 0 && (
        <span className="took-rack">
          {got.map((g) => (
            <ChessPiece
              key={g.i}
              kind={g.kind}
              white={side === "o"}
              className={`took${g.lead ? " gap" : ""}${g.i === newest ? " new" : ""}`}
            />
          ))}
        </span>
      )}
      {lead > 0 && (
        <b key={lead} className="took-lead">
          +{lead}
        </b>
      )}
    </span>
  );
}

/** A move written down with little pieces for the letters: they read the same in every language, and N is no knight. */
function Notation({ san, white }: { san: string; white: boolean }) {
  return (
    <>
      {san.split(/([KQRBN])/).map((part, i) =>
        i % 2 ? <ChessPiece key={i} kind={part.toLowerCase() as Kind} white={white} className="fig" /> : part,
      )}
    </>
  );
}

/** The scoresheet: the game so far, a numbered pair of moves to a cell, the latest one lit. */
function Moves({ san }: { san: string[] }) {
  const t = useTr();
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [san.length]);
  const rows = Array.from({ length: Math.ceil(san.length / 2) }, (_, i) => san.slice(i * 2, i * 2 + 2));
  return (
    <ol className="chess-moves" ref={list} aria-label={t("ходи", "moves")}>
      {!san.length && <li className="blank">{t("тут буде запис партії", "the moves will be written down here")}</li>}
      {rows.map((pair, i) => (
        <li key={i}>
          <span className="n">{i + 1}</span>
          {pair.map((s, j) => (
            <span key={j} className={`${j ? "bk" : "wt"}${i * 2 + j === san.length - 1 ? " now" : ""}`}>
              <Notation san={s} white={j === 0} />
            </span>
          ))}
        </li>
      ))}
    </ol>
  );
}

/** Chess for two: the inviter plays white and moves first, each side sees its own pieces at the bottom. */
export default function Chess({ chess, self, note }: { chess: ChessState; self: string; note: string | null }) {
  const t = useTr();
  const m = chess.match!;
  const b = chess.board!;
  const mine = sideOf(m, self) ?? "o";
  const theirs = other(mine);
  const rival = m.x.id === self ? m.o : m.x;
  const root = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const squares = useRef<HTMLDivElement>(null);
  const fx = useRef<BoardFxHandle>(null);
  const flyers = useRef<HTMLDivElement>(null);
  const later = useLater();
  /** where the piece of the move just made was let go from the hand, when it was dragged */
  const hand = useRef<{ sq: number; dx: number; dy: number } | null>(null);
  const [pick, setPick] = useState<{ ply: number; sq: number; to?: number } | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const ply = b.moves.length;
  const [opened] = useState(ply);
  const fresh = ply !== opened;
  const timeUp = useTimeUp(chess.clock);
  const seen = fresh || timeUp;
  const live = !b.winner && !note && b.turn === mine;
  const tense = useLowClock(chess.clock, mine, b.turn, !!b.winner || m.gone);
  const moves = live ? legal(b) : [];
  const sel = pick?.ply === ply ? pick : null;
  const targets = new Map<number, Move[]>();
  for (const mv of moves) if (mv[0] === sel?.sq) targets.set(mv[1], [...(targets.get(mv[1]) ?? []), mv]);
  const last = b.moves.at(-1);
  const check = b.winner ? -1 : checked(b);
  const flip = mine === "o";
  const lastSan = b.san.at(-1) ?? "";
  const victim = fresh && last && lastSan.includes("x") ? b.taken.at(-1) : undefined;
  // en passant: a pawn landed on the square the last double step skipped, and took the pawn that made it
  const prev = b.moves.at(-2);
  const passant = !!last && !!prev && Math.abs(prev[1] - prev[0]) === 2 * N && (prev[0] + prev[1]) / 2 === last[1];
  const takenAt = passant ? prev[1] : last?.[1];
  const movable = new Set(sel ? [] : moves.map((mv) => mv[0]));
  // a pawn that has just become a piece walks in as the pawn it was
  const born = fresh && !!last?.[2];

  // how the game ended, for the board to show: the mated king and what mates it, a flag, a draw
  const kingOf = (s: Side) => b.cells.indexOf(s === "x" ? "K" : "k");
  const loser = b.winner && b.winner !== "draw" ? other(b.winner) : null;
  const mated = b.end === "mate" && loser ? kingOf(loser) : -1;
  const maters = mated >= 0 ? attackers(b.cells, mated, other(loser!)) : [];
  const rays = new Map<number, number>();
  for (const a of maters) between(a, mated).forEach((s, i) => rays.set(s, i));
  const flagged = b.end === "time" && loser ? kingOf(loser) : -1;
  const drawn = b.winner === "draw";
  // the king goes over away from what mates it, and never off the board
  const [mx] = mated >= 0 ? spot(mated, flip) : [0];
  const ax = maters.length ? spot(maters[0], flip)[0] : mx;
  const fall = mx === 0 ? 1 : mx === 7 ? -1 : ax < mx ? 1 : ax > mx ? -1 : mx < 4 ? 1 : -1;

  useStage(ply, (was) => {
    const el = grid.current;
    if (!el || !last || ply <= was) return;
    const still = calm();
    const mover = other(b.turn);
    const arrived = kindOf(b.cells[last[1]]);
    const walked: Kind = last[2] ? "p" : arrived;
    const gait: Gait = walked === "n" ? "hop" : "slide";
    const dropped = hand.current?.sq === last[1] ? hand.current : null;
    hand.current = null;
    const trip: Trip = { path: [last[0], last[1]], gait, drop: dropped, pick: last[2] ? ":scope > .shed" : undefined };
    const land = still ? 0 : landings(trip)[0];
    // the board's own beats (the check, the mate) wait in CSS for the piece to land
    root.current?.style.setProperty("--land", `${land}ms`);
    if (!still) travel(el, trip, flip);

    // castling: the rook hops over its king as the king arrives
    const castled = arrived === "k" && Math.abs(last[1] - last[0]) === 2;
    if (castled) {
      const rook: Trip = {
        path: last[1] > last[0] ? [last[0] + 3, last[0] + 1] : [last[0] - 4, last[0] - 1],
        gait: "hop",
        wait: still ? 0 : 70,
      };
      if (!still) travel(el, rook, flip);
      later(
        () => {
          boardSfx.clack("r", true);
          fx.current?.dust(rook.path[1], heft("r"));
        },
        still ? 60 : landings(rook)[0],
      );
    }

    const took = lastSan.includes("x") ? b.taken.at(-1) : undefined;
    if (took && takenAt !== undefined) {
      const dir = heading(last[0], takenAt, flip);
      const tray = root.current?.querySelector(`[data-tray="${mover}"] .took.new`);
      if (!still) {
        el.querySelectorAll<HTMLElement>(".poof").forEach((p) => flyOff(flyers.current, p, tray ?? null, dir, land));
        const arrive = land + KNOCK_MS + FLY_MS - 30;
        rackOpen(tray?.parentElement, arrive);
        trayPop(tray, arrive);
        trayPop(root.current?.querySelector(`[data-tray="${mover}"] .took-lead`), arrive);
        later(() => boardSfx.tray(), arrive);
      }
      later(() => {
        boardSfx.knock(kindOf(took));
        fx.current?.chips(takenAt, chipsOf(other(mover)), dir, heft(kindOf(took)) - 1);
        shake(squares.current, heft(kindOf(took)) - 0.4);
      }, land);
    } else {
      later(() => {
        boardSfx.clack(walked);
        fx.current?.dust(last[1], heft(walked));
      }, land);
    }
    if (chess.clock) later(() => boardSfx.punch(), land + 40);

    if (last[2]) {
      const cell = el.querySelector<HTMLElement>(`[data-sq="${last[1]}"]`);
      if (!still && cell) {
        const shed = cell.querySelector(":scope > .shed");
        const piece = cell.querySelector(":scope > .born");
        shed?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 50, delay: land, fill: "both" });
        piece?.animate(
          [
            { opacity: 0, scale: "0.6", filter: "brightness(4)" },
            { opacity: 1, scale: "1.6", filter: "brightness(3)", offset: 0.3 },
            { opacity: 1, scale: "0.94", filter: "brightness(1.2)", offset: 0.75 },
            { opacity: 1, scale: "1", filter: "brightness(1)" },
          ],
          { duration: 340, delay: land, fill: "backwards", easing: "ease-out" },
        );
      }
      later(() => {
        boardSfx.promote(arrived);
        fx.current?.burst(last[1], GOLD, 22);
      }, land + 50);
    }

    if (b.end === "mate") {
      // the held moment, the lines to the king, the king going over; the result's own sound comes with its card
      later(() => {
        boardSfx.mateHit();
        shake(squares.current, 3);
      }, land);
      later(() => {
        boardSfx.beam();
        for (const a of maters) fx.current?.glint(a, GOLD, 6);
      }, land + 300);
      later(() => boardSfx.topple(), land + 640);
      later(() => {
        fx.current?.dust(mated, 2.6);
        shake(squares.current, 1.2);
      }, land + 640 + 250);
      later(() => sfx(b.winner === mine ? "win" : "lose"), FINAL_MS);
    } else if (b.winner === "draw") {
      later(() => boardSfx.hush(), land + 220);
      later(() => sfx("draw"), FINAL_MS);
    } else if (check >= 0) later(() => boardSfx.check(), land + 140);
    else if (b.turn === mine) later(() => sfx("turn"), land + 200);
  });

  // a flag falls: its own short ending, then the result's sound with its card
  useStage(timeUp, () => {
    if (!timeUp) return;
    boardSfx.flag();
    shake(squares.current, 1.5, 240);
    later(() => sfx(b.winner === mine ? "win" : "lose"), FINAL_MS);
  });

  // as a new game opens, once the two sides have been shown, the pieces come to attention
  useEffect(() => {
    if (opened) return;
    const el = grid.current;
    const up = setTimeout(() => {
      if (!el || el.dataset.played !== undefined || calm()) return;
      el.setAttribute("data-ready", "");
      boardSfx.rattle();
    }, INTRO_MS);
    const down = setTimeout(() => el?.removeAttribute("data-ready"), INTRO_MS + 1200);
    return () => {
      clearTimeout(up);
      clearTimeout(down);
    };
  }, [opened]);

  /** A soft no: the piece shakes its head, and in check the king says why. */
  const refuse = (sq: number) => {
    boardSfx.refuse();
    const el = grid.current;
    headShake(el?.querySelector(`[data-sq="${sq}"] > .piece`));
    if (check >= 0 && check !== sq && !calm()) {
      el?.querySelector(`[data-sq="${check}"] > .piece`)?.animate([{ scale: "1" }, { scale: "1.2" }, { scale: "1" }], { duration: 260 });
    }
  };

  const tap = (sq: number) => {
    if (!live) return;
    const go = targets.get(sq);
    if (sel && go) {
      if (go.length > 1) return setPick({ ...sel, to: sq });
      setPick(null);
      return chess.move(go[0]);
    }
    if (owner(b.cells[sq]) === mine && sel?.sq !== sq) {
      if (!moves.some((mv) => mv[0] === sq)) {
        setPick(null);
        return refuse(sq);
      }
      boardSfx.lift(kindOf(b.cells[sq]));
      return setPick({ ply, sq });
    }
    // reaching for a piece it cannot take
    if (sel && owner(b.cells[sq]) === theirs) refuse(sel.sq);
    setPick(null);
  };

  const promoting = sel?.to != null;
  // the pawn the picked pawn would take in passing: it stands beside it, not on the square it goes to
  const passed = sel && b.ep >= 0 && targets.has(b.ep) && kindOf(b.cells[sel.sq]) === "p" ? b.ep + (mine === "x" ? N : -N) : -1;
  const drag = useDrag(grid, {
    live: live && !promoting,
    flip,
    grabs: (sq) => owner(b.cells[sq]) === mine && moves.some((mv) => mv[0] === sq),
    lift: (sq) => {
      boardSfx.lift(kindOf(b.cells[sq]));
      setPick({ ply, sq });
    },
    over: setOver,
    drop: (from, to, at) => {
      if (to === null || to === from) return false;
      const go = moves.filter((mv) => mv[0] === from && mv[1] === to);
      if (!go.length) {
        boardSfx.refuse();
        setPick(null);
        return false;
      }
      // a pawn on the last rank glides home while its player chooses what it becomes
      if (go.length > 1) {
        setPick({ ply, sq: from, to });
        return false;
      }
      hand.current = { sq: to, ...at };
      setPick(null);
      chess.move(go[0]);
      return true;
    },
  });

  const ending: Record<string, string> = {
    stalemate: t("пат: нічия", "stalemate: a draw"),
    fifty: t("нічия: 50 ходів без взяття й ходу пішака", "draw: 50 moves with no capture or pawn move"),
    material: t("нічия: нічим поставити мат", "draw: not enough left to mate"),
    repeat: t("нічия: позиція втретє та сама", "draw: the same position a third time"),
  };
  const status =
    b.end === "time"
      ? b.winner === mine
        ? t(`у ${rival.name} скінчився час: перемога твоя!`, `${rival.name} ran out of time: you win!`)
        : t(`твій час скінчився: перемога ${rival.name}`, `you ran out of time: ${rival.name} wins`)
      : b.end === "mate"
        ? b.winner === mine
          ? t("мат: перемога твоя!", "checkmate: you win!")
          : t(`мат: ${rival.name} перемагає`, `checkmate: ${rival.name} wins`)
        : b.end
          ? ending[b.end]
          : (note ??
            (b.turn === mine
              ? check >= 0
                ? t("шах! твій хід", "check! your move")
                : t("твій хід", "your move")
              : check >= 0
                ? t(`шах · ходить ${rival.name}`, `check · ${rival.name}’s move`)
                : t(`ходить ${rival.name}`, `${rival.name}’s move`)));
  const end: Mood | null = b.winner ? (b.winner === "draw" ? "draw" : b.winner === mine ? "win" : "lose") : null;
  const mood = end ?? (live ? "go" : null);
  const verdict =
    b.end === "time"
      ? { win: t("Перемога за часом!", "Won on time!"), lose: t("Час скінчився", "Out of time"), draw: "" }
      : { win: t("Мат! Перемога", "Checkmate! You win"), lose: t("Мат", "Checkmate"), draw: t("Нічия", "Draw") };
  const clock = (side: Side) =>
    chess.clock && (
      <GameClock clock={chess.clock} side={side} turn={b.turn} over={!!b.winner || m.gone} mine={side === mine} />
    );
  const waitClock = t("годинник піде після першого ходу білих", "the clocks start after white’s first move");
  const order = Array.from({ length: N * N }, (_, i) => (flip ? N * N - 1 - i : i));
  const [cx, cy] = check >= 0 ? spot(check, flip) : [0, 0];
  const mover = sel ? b.cells[sel.sq] : "";

  return (
    <div className="bgame chess" ref={root}>
      <Seat
        name={rival.name}
        on={!b.winner && b.turn === theirs}
        won={b.winner === theirs}
        mark={<ChessPiece kind="k" white={theirs === "x"} className="seat-piece" />}
        clock={clock(theirs)}
      >
        <Tray b={b} side={theirs} fresh={fresh} />
      </Seat>
      <BoardFrame flip={flip} go={live} tense={tense} sq={squares}>
        <div
          className="chess-grid"
          ref={grid}
          role="grid"
          aria-label={t("шахова дошка", "chess board")}
          data-end={b.end ?? undefined}
          data-live={seen ? "" : undefined}
          data-played={ply ? "" : undefined}
          {...drag}
        >
          {order.map((sq, at) => {
            const p = b.cells[sq];
            const who = owner(p);
            const hit = targets.has(sq) && (!!p || (kindOf(b.cells[sel!.sq]) === "p" && sq === b.ep));
            const cls = [
              light(sq) ? "lt" : "dk",
              last?.[0] === sq ? "was" : last?.[1] === sq ? "now" : "",
              sel?.sq === sq ? "sel" : "",
              targets.has(sq) ? (hit ? "hit" : "to") : "",
              sq === check ? "chk" : "",
              movable.has(sq) ? "can" : "",
              over === sq && sel && sel.sq !== sq ? "over" : "",
              sq === mated ? "mated" : maters.includes(sq) ? "mater" : rays.has(sq) ? "ray" : mated >= 0 ? "dim" : "",
              sq === flagged ? "flagged" : "",
              drawn && kindOf(p) === "k" ? "even" : "",
              sq === passed ? "passed" : "",
            ]
              .filter(Boolean)
              .join(" ");
            const what = who
              ? `, ${t(whose(kindOf(p), who === mine), who === mine ? "your" : "their")} ${t(...NAMES[kindOf(p)])}`
              : "";
            const style = {
              "--f": at % N,
              "--r": Math.floor(at / N),
              "--i": rays.get(sq) ?? 0,
              "--fall": fall,
            } as CSSProperties;
            return (
              <button
                key={sq}
                data-sq={sq}
                className={cls}
                style={style}
                disabled={!live || promoting}
                onClick={() => tap(sq)}
                aria-label={`${sqName(sq)}${what}`}
              >
                {who && <ChessPiece kind={kindOf(p)} white={who === "x"} className={born && sq === last![1] ? "piece born" : "piece"} />}
                {born && sq === last![1] && <ChessPiece key={`shed${ply}`} kind="p" white={who === "x"} className="piece shed" />}
                {targets.has(sq) && mover && !p && <ChessPiece kind={kindOf(mover)} white={mine === "x"} className="chess-ghost" />}
                {victim && sq === takenAt && (
                  <span key={`poof${ply}`} className="poof">
                    <ChessPiece kind={kindOf(victim)} white={owner(victim) === "x"} className="poof-piece" />
                  </span>
                )}
                {drawn && seen && kindOf(p) === "k" && <i className="chess-half">½</i>}
              </button>
            );
          })}
        </div>
        <div className="board-fly" ref={flyers} aria-hidden />
        <BoardFx ref={fx} flip={flip} />
        {seen && check >= 0 && (
          <span
            key={ply}
            className={`chess-call${cy === 0 ? " under" : ""}`}
            style={{ "--x": Math.min(6.4, Math.max(0.6, cx)), "--y": cy } as CSSProperties}
            aria-hidden
          >
            {t("шах", "check")}
          </span>
        )}
        {promoting && (
          <div
            className="promo"
            role="dialog"
            aria-label={t("на кого обміняти пішака", "promote the pawn to")}
            style={{ "--file": spot(sel.to!, flip)[0] } as CSSProperties}
            onClick={(e) => e.target === e.currentTarget && setPick(null)}
          >
            <span>{t("пішак стає…", "the pawn becomes…")}</span>
            <div>
              {PROMOS.map((q) => (
                <button
                  key={q}
                  className="btn"
                  onClick={() => {
                    setPick(null);
                    chess.move([sel.sq, sel.to!, q]);
                  }}
                  aria-label={t(...NAMES[q])}
                  title={t(...NAMES[q])}
                >
                  <ChessPiece kind={q} white={mine === "x"} />
                </button>
              ))}
            </div>
            <button className="btn" onClick={() => setPick(null)}>
              {t("скасувати", "cancel")}
            </button>
          </div>
        )}
        {seen && end && <Finale mood={end} text={verdict[end]} />}
      </BoardFrame>
      <Seat
        name={m.x.id === self ? m.x.name : m.o.name}
        you
        on={!b.winner && b.turn === mine}
        won={b.winner === mine}
        mark={<ChessPiece kind="k" white={mine === "x"} className="seat-piece" />}
        clock={clock(mine)}
      >
        <Tray b={b} side={mine} fresh={fresh} />
      </Seat>
      <BoardSay text={chess.clock && !ply && !note ? `${status} · ${waitClock}` : status} mood={mood} />
      <Moves san={b.san} />
    </div>
  );
}
