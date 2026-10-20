"use client";

import { RefObject, useLayoutEffect, useRef } from "react";

/**
 * Slides the pieces of the latest move from where they stood, through every square they touched, to where they
 * landed, so the other side's move is seen and not only found. Each path is board squares, a8 = 0; the move made
 * before the board opened stays still.
 */
export function useSlide(grid: RefObject<HTMLElement | null>, ply: number, paths: number[][], flip: boolean) {
  const seen = useRef(ply);
  const flying = useRef<Animation[]>([]);
  useLayoutEffect(() => {
    if (seen.current === ply) return;
    seen.current = ply;
    flying.current.forEach((a) => a.finish());
    flying.current = [];
    const el = grid.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const spot = (sq: number) => {
      const r = Math.floor(sq / 8);
      const c = sq % 8;
      return flip ? [7 - c, 7 - r] : [c, r];
    };
    for (const path of paths) {
      const to = path.at(-1)!;
      const cell = el.querySelector<HTMLElement>(`[data-sq="${to}"]`);
      const piece = cell?.querySelector<SVGElement>(".piece, .man");
      if (!cell || !piece || path.length < 2) continue;
      const size = cell.offsetWidth;
      const [tx, ty] = spot(to);
      const frames = path.map((sq) => {
        const [x, y] = spot(sq);
        return { transform: `translate(${(x - tx) * size}px, ${(y - ty) * size}px)` };
      });
      piece.style.zIndex = "3";
      const a = piece.animate(frames, { duration: 120 + 130 * (path.length - 1), easing: "ease-out" });
      a.onfinish = a.oncancel = () => piece.style.removeProperty("z-index");
      flying.current.push(a);
    }
  }, [grid, ply, paths, flip]);
}
