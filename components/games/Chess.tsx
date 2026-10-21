"use client";

import { useEffect, useRef, useState } from "react";
import { useTr } from "@/lib/i18n";
import {
  ChessBoard,
  Kind,
  Move,
  N,
  PROMOS,
  VALUE,
  checked,
  kindOf,
  legal,
  light,
  owner,
  sqName,
} from "@/lib/live/chess";
import { Side, sideOf } from "@/lib/live/duel";
import { sfx } from "@/lib/live/sfx";
import { Chess as ChessState } from "@/lib/live/useChess";
import BoardFrame from "./BoardFrame";
import Finale, { Mood } from "./Finale";
import Seat, { BoardSay } from "./Seat";
import { ChessPiece } from "./Sprite";
import { Sparks } from "./Sparks";
import { useNewMoves } from "./useNewMoves";
import { useSlide } from "./useSlide";

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

/** The pieces a side has taken, the heaviest first, and how far ahead it is. */
function Taken({ b, side }: { b: ChessBoard; side: Side }) {
  const got = b.taken
    .filter((p) => owner(p) !== side)
    .map(kindOf)
    .sort((x, y) => VALUE[y] - VALUE[x]);
  const lead = worth(b, side) - worth(b, side === "x" ? "o" : "x");
  return (
    <>
      {got.map((k, i) => (
        <ChessPiece key={i} kind={k} white={side === "o"} className="took" />
      ))}
      {lead > 0 && <em>+{lead}</em>}
    </>
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

/** The game so far, two moves to a line the way a scoresheet has it. */
function Moves({ san }: { san: string[] }) {
  const t = useTr();
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [san.length]);
  if (!san.length) return null;
  const rows = Array.from({ length: Math.ceil(san.length / 2) }, (_, i) => san.slice(i * 2, i * 2 + 2));
  return (
    <ol className="chess-moves" ref={list} aria-label={t("ходи", "moves")}>
      {rows.map((pair, i) => (
        <li key={i}>
          <span className="n">{i + 1}.</span>
          {pair.map((s, j) => (
            <span key={j} className={i * 2 + j === san.length - 1 ? "now" : ""}>
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
  const theirs: Side = mine === "x" ? "o" : "x";
  const rival = m.x.id === self ? m.o : m.x;
  const grid = useRef<HTMLDivElement>(null);
  const [pick, setPick] = useState<{ ply: number; sq: number; to?: number } | null>(null);
  const ply = b.moves.length;
  const [opened] = useState(ply);
  const fresh = ply !== opened;
  const live = !b.winner && !note && b.turn === mine;
  const moves = live ? legal(b) : [];
  const sel = pick?.ply === ply ? pick : null;
  const targets = new Map<number, Move[]>();
  for (const mv of moves) if (mv[0] === sel?.sq) targets.set(mv[1], [...(targets.get(mv[1]) ?? []), mv]);
  const last = b.moves.at(-1);
  const check = b.winner === "draw" ? -1 : checked(b);
  const flip = mine === "o";
  const lastSan = b.san.at(-1) ?? "";
  const victim = fresh && last && lastSan.includes("x") ? b.taken.at(-1) : undefined;
  // en passant: a pawn landed on the square the last double step skipped, and took the pawn that made it
  const prev = b.moves.at(-2);
  const passant = !!last && !!prev && Math.abs(prev[1] - prev[0]) === 2 * N && (prev[0] + prev[1]) / 2 === last[1];
  const takenAt = passant ? prev[1] : last?.[1];
  const movable = new Set(sel ? [] : moves.map((mv) => mv[0]));

  useNewMoves(b, ply, (now, _, soon) => {
    const san = now.san.at(-1) ?? "";
    sfx(san.includes("x") ? "capture" : "move");
    if (san.includes("=")) soon("promote", 120);
    if (now.winner) soon(now.winner === "draw" ? "draw" : now.winner === mine ? "win" : "lose", 320);
    else if (san.endsWith("+")) soon("check");
    else if (now.turn === mine) soon("turn", 220);
  });

  const slides: number[][] = last ? [[last[0], last[1]]] : [];
  if (last && kindOf(b.cells[last[1]]) === "k" && Math.abs(last[1] - last[0]) === 2) {
    slides.push(last[1] > last[0] ? [last[0] + 3, last[0] + 1] : [last[0] - 4, last[0] - 1]);
  }
  useSlide(grid, ply, slides, flip);

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
        return sfx("illegal");
      }
      sfx("select");
      return setPick({ ply, sq });
    }
    setPick(null);
  };

  const ending: Record<string, string> = {
    stalemate: t("пат: нічия", "stalemate: a draw"),
    fifty: t("нічия: 50 ходів без взяття й ходу пішака", "draw: 50 moves with no capture or pawn move"),
    material: t("нічия: нічим поставити мат", "draw: not enough left to mate"),
    repeat: t("нічия: позиція втретє та сама", "draw: the same position a third time"),
  };
  const status =
    b.end === "mate"
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
  const verdict = { win: t("Мат! Перемога", "Checkmate! You win"), lose: t("Мат", "Checkmate"), draw: t("Нічия", "Draw") };
  const order = Array.from({ length: N * N }, (_, i) => (flip ? N * N - 1 - i : i));
  const promoting = sel?.to != null;

  return (
    <div className="bgame chess">
      <Seat
        name={rival.name}
        on={!b.winner && b.turn === theirs}
        won={b.winner === theirs}
        mark={<ChessPiece kind="k" white={theirs === "x"} className="seat-piece" />}
      >
        <Taken b={b} side={theirs} />
      </Seat>
      <BoardFrame flip={flip} go={live}>
        <div className="chess-grid" ref={grid} role="grid" aria-label={t("шахова дошка", "chess board")}>
          {order.map((sq) => {
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
            ]
              .filter(Boolean)
              .join(" ");
            const what = who
              ? `, ${t(whose(kindOf(p), who === mine), who === mine ? "your" : "their")} ${t(...NAMES[kindOf(p)])}`
              : "";
            return (
              <button
                key={sq}
                data-sq={sq}
                className={cls}
                disabled={!live || promoting}
                onClick={() => tap(sq)}
                aria-label={`${sqName(sq)}${what}`}
              >
                {who && <ChessPiece kind={kindOf(p)} white={who === "x"} />}
                {victim && sq === takenAt && (
                  <span key={ply} className="poof">
                    <ChessPiece kind={kindOf(victim)} white={owner(victim) === "x"} className="poof-piece" />
                    <Sparks />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {promoting && (
          <div className="promo" role="dialog" aria-label={t("на кого обміняти пішака", "promote the pawn to")}>
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
        {fresh && end && <Finale mood={end} text={verdict[end]} />}
      </BoardFrame>
      <Seat
        name={m.x.id === self ? m.x.name : m.o.name}
        you
        on={!b.winner && b.turn === mine}
        won={b.winner === mine}
        mark={<ChessPiece kind="k" white={mine === "x"} className="seat-piece" />}
      >
        <Taken b={b} side={mine} />
      </Seat>
      <BoardSay text={status} mood={mood} />
      <Moves san={b.san} />
    </div>
  );
}
