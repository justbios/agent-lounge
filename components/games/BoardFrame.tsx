"use client";

import { ReactNode } from "react";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

/**
 * The wooden frame round an 8 by 8 board: the files along the bottom and the ranks up the side as the viewer sits,
 * and a lit rim while it is the viewer's move. The squares, and anything laid over them, go inside.
 */
export default function BoardFrame({ flip, go, children }: { flip: boolean; go: boolean; children: ReactNode }) {
  const files = flip ? [...FILES].reverse() : FILES;
  const ranks = flip ? [...RANKS].reverse() : RANKS;
  return (
    <div className={`board-wrap${go ? " go" : ""}`}>
      <div className="board-ranks" aria-hidden>
        {ranks.map((r) => (
          <span key={r}>{r}</span>
        ))}
      </div>
      <div className="board-sq">{children}</div>
      <div className="board-files" aria-hidden>
        {files.map((f) => (
          <span key={f}>{f}</span>
        ))}
      </div>
    </div>
  );
}
