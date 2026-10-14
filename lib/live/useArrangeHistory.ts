"use client";

import { useState } from "react";
import { Arrangement, arrangementKey } from "./plan";

const KEEP = 30;

interface History {
  room: string;
  key: string;
  now: Arrangement;
  past: Arrangement[];
  future: Arrangement[];
  /** the arrangement an undo or redo is putting back, so its arrival is not taken for a new change */
  expect: string | null;
}

export interface ArrangeHistory {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

/**
 * Every change to where the pieces stand and how the agents look, wherever it was made — the plan, the scene or an
 * agent's card — so it can be stepped back and forth. A different room starts a fresh history.
 */
export function useArrangeHistory(
  room: string,
  now: Arrangement,
  arrange: (a: Arrangement) => Promise<boolean>,
): ArrangeHistory {
  const key = arrangementKey(now);
  const [h, setH] = useState<History>({ room, key, now, past: [], future: [], expect: null });

  if (h.room !== room) {
    setH({ room, key, now, past: [], future: [], expect: null });
  } else if (h.key !== key) {
    const mine = h.expect === key;
    setH({
      ...h,
      key,
      now,
      past: mine ? h.past : [...h.past, h.now].slice(-KEEP),
      future: mine ? h.future : [],
      expect: null,
    });
  }

  const step = async (back: boolean) => {
    const from = back ? h.past : h.future;
    const to = from.at(-1);
    if (!to) return;
    const before = h;
    setH({
      ...h,
      past: back ? h.past.slice(0, -1) : [...h.past, h.now],
      future: back ? [...h.future, h.now] : h.future.slice(0, -1),
      expect: arrangementKey(to),
    });
    if (!(await arrange(to))) setH(before);
  };

  return {
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
    undo: () => step(true),
    redo: () => step(false),
  };
}
