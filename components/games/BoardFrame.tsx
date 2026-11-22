"use client";

import { ReactNode, Ref } from "react";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

/**
 * The tournament table an 8 by 8 board lies on: a walnut frame with brass corners, the files along the bottom and
 * the ranks up the side as the viewer sits, a lit rim while it is the viewer's move, a red one when their clock is
 * nearly gone, and three quiet dots on the far edge while an agent thinks. The squares, and anything laid over
 * them, go inside.
 */
export default function BoardFrame({
  flip,
  go,
  tense,
  sq,
  children,
}: {
  flip: boolean;
  go: boolean;
  /** the viewer's clock is in its last seconds */
  tense?: boolean;
  /** the squares' own box, for a board that shakes it when something lands hard */
  sq?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  const files = flip ? [...FILES].reverse() : FILES;
  const ranks = flip ? [...RANKS].reverse() : RANKS;
  return (
    <div className={`board-wrap${go ? " go" : ""}${tense ? " tense" : ""}`}>
      <span className="board-think" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      <div className="board-ranks" aria-hidden>
        {ranks.map((r) => (
          <span key={r}>{r}</span>
        ))}
      </div>
      <div className="board-sq" ref={sq}>
        {children}
      </div>
      <div className="board-files" aria-hidden>
        {files.map((f) => (
          <span key={f}>{f}</span>
        ))}
      </div>
    </div>
  );
}
