"use client";

import { MouseEvent, PointerEvent, RefObject, useEffect, useEffectEvent, useRef } from "react";
import { calm } from "./motion";

/** the pointer has to travel this far with the button down before a press becomes a drag, px */
const SLOP = 5;

export interface DragRules {
  /** the board answers the pointer at all */
  live: boolean;
  flip: boolean;
  /** this square holds a piece the player may pick up */
  grabs: (sq: number) => boolean;
  /** the piece left its square in the hand */
  lift: (sq: number) => void;
  /** the square under the hand changed; null off the board */
  over: (sq: number | null) => void;
  /**
   * It was let go over `to` (null off the board), its middle `at` px from the middle of that square. True when the
   * board took the move: the piece then stays where it was dropped until the board draws it there. Otherwise it
   * glides home.
   */
  drop: (from: number, to: number | null, at: { dx: number; dy: number }) => boolean;
}

interface Held {
  id: number;
  sq: number;
  x: number;
  y: number;
  piece: SVGElement;
  moved: boolean;
  over: number | null;
}

/**
 * Dragging a piece with the mouse or a pen, beside the tap-tap that the squares' own clicks give. A finger only
 * taps: a board that swallowed every swipe could not be scrolled past on a phone. A press that never moves is left
 * alone, so it reaches the square as a click.
 */
export function useDrag(grid: RefObject<HTMLElement | null>, rules: DragRules) {
  const held = useRef<Held | null>(null);
  const skipClick = useRef(false);
  const squareAt = (x: number, y: number): { sq: number; cx: number; cy: number } | null => {
    const el = grid.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const size = r.width / 8;
    const c = Math.floor((x - r.left) / size);
    const row = Math.floor((y - r.top) / size);
    if (c < 0 || c > 7 || row < 0 || row > 7) return null;
    const sq = rules.flip ? 63 - (row * 8 + c) : row * 8 + c;
    return { sq, cx: r.left + (c + 0.5) * size, cy: r.top + (row + 0.5) * size };
  };

  const home = (h: Held, glide: boolean) => {
    const p = h.piece;
    const from = p.style.translate;
    for (const prop of ["translate", "scale", "z-index", "filter", "transition", "animation"]) p.style.removeProperty(prop);
    grid.current?.removeAttribute("data-drag");
    if (glide && from && !calm()) {
      p.animate([{ translate: from, scale: "1.16" }, { translate: "0px 0px", scale: "1" }], {
        duration: 170,
        easing: "cubic-bezier(0.2, 0.8, 0.3, 1)",
      });
    }
  };

  // a board that stops being the player's mid-drag lets the piece go
  const letGo = useEffectEvent(() => {
    const h = held.current;
    held.current = null;
    if (!h?.moved) return;
    home(h, false);
    rules.over(null);
  });
  const live = rules.live;
  useEffect(() => {
    if (!live) letGo();
  }, [live]);

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (!rules.live || e.button !== 0 || e.pointerType === "touch" || held.current) return;
    const cell = (e.target as Element).closest<HTMLElement>("[data-sq]");
    const sq = Number(cell?.dataset.sq ?? -1);
    const piece = cell?.querySelector<SVGElement>(":scope > .piece, :scope > .man");
    if (!cell || !piece || !rules.grabs(sq)) return;
    held.current = { id: e.pointerId, sq, x: e.clientX, y: e.clientY, piece, moved: false, over: sq };
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const h = held.current;
    if (!h || h.id !== e.pointerId) return;
    const dx = e.clientX - h.x;
    const dy = e.clientY - h.y;
    if (!h.moved) {
      if (Math.hypot(dx, dy) < SLOP) return;
      h.moved = true;
      grid.current?.setPointerCapture(e.pointerId);
      grid.current?.setAttribute("data-drag", "");
      h.piece.style.transition = "none";
      h.piece.style.animation = "none";
      h.piece.style.zIndex = "6";
      h.piece.style.scale = "1.16";
      h.piece.style.filter = "drop-shadow(5px 9px 0 rgba(7, 5, 13, 0.26))";
      rules.lift(h.sq);
    }
    h.piece.style.translate = `${dx}px ${dy}px`;
    const now = squareAt(e.clientX, e.clientY)?.sq ?? null;
    if (now !== h.over) {
      h.over = now;
      rules.over(now);
    }
  };

  const end = (e: PointerEvent<HTMLElement>, cancelled: boolean) => {
    const h = held.current;
    if (!h || h.id !== e.pointerId) return;
    held.current = null;
    if (!h.moved) return;
    // the click that follows a drag let go over the square it began on is not a tap
    skipClick.current = true;
    setTimeout(() => (skipClick.current = false), 0);
    if (grid.current?.hasPointerCapture(e.pointerId)) grid.current.releasePointerCapture(e.pointerId);
    rules.over(null);
    const to = cancelled ? null : squareAt(e.clientX, e.clientY);
    const start = squareAt(h.x, h.y);
    const at = to && start ? { dx: start.cx + (e.clientX - h.x) - to.cx, dy: start.cy + (e.clientY - h.y) - to.cy } : { dx: 0, dy: 0 };
    if (rules.drop(h.sq, to?.sq ?? null, at)) {
      grid.current?.removeAttribute("data-drag");
      // the board redraws the piece on its new square; should it not, the piece is not left hanging in the air
      setTimeout(() => {
        if (h.piece.isConnected && h.piece.style.translate) home(h, true);
      }, 400);
    } else home(h, true);
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: (e: PointerEvent<HTMLElement>) => end(e, false),
    onPointerCancel: (e: PointerEvent<HTMLElement>) => end(e, true),
    onClickCapture: (e: MouseEvent<HTMLElement>) => {
      if (!skipClick.current) return;
      skipClick.current = false;
      e.stopPropagation();
      e.preventDefault();
    },
  };
}
