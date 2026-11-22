import { BoardMove, Job, pickMove } from "./board";

/*
 * Asks for an agent's move without holding the page up: the search runs in a Web Worker, started on the first move
 * anyone asks for. Where a worker cannot start, or one stops answering, the move is found on the page at the easy
 * level, which takes no time worth noticing; a game against an agent never stalls on its search.
 */

/** a search that has not answered by now is given up on */
const PATIENCE_MS = 6000;

let worker: Worker | null | undefined;
let asked = 0;
const waiting = new Map<number, (m: BoardMove | null) => void>();

function boot(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; move: BoardMove | null }>) => {
      const done = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      done?.(e.data.move);
    };
    worker.onerror = () => {
      worker?.terminate();
      worker = null;
      const all = [...waiting.values()];
      waiting.clear();
      all.forEach((done) => done(null));
    };
  } catch {
    worker = null;
  }
  return worker;
}

/** A move found here on the page, quickly: what an agent plays when its search is not there to ask. */
export function quickMove(job: Job): BoardMove | null {
  try {
    return pickMove({ ...job, level: "easy" });
  } catch {
    return null;
  }
}

/** The agent's move for this job; it settles with null only when there is no move to make. */
export function think(job: Job): Promise<BoardMove | null> {
  const w = boot();
  if (!w) return Promise.resolve(quickMove(job));
  return new Promise((resolve) => {
    const id = ++asked;
    const timer = setTimeout(() => {
      if (!waiting.delete(id)) return;
      resolve(quickMove(job));
    }, PATIENCE_MS);
    waiting.set(id, (move) => {
      clearTimeout(timer);
      resolve(move ?? quickMove(job));
    });
    w.postMessage({ id, job });
  });
}
