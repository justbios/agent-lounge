import { Job, pickMove } from "./board";

/*
 * The agents think here, off the page's own thread, so a deep search never freezes a board. One message in, one out:
 * { id, job } and { id, move }; a job that throws answers with no move and the page plays a simpler one itself.
 */

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<{ id: number; job: Job }>) => void) | null;
  postMessage: (m: unknown) => void;
};

scope.onmessage = (e) => {
  const { id, job } = e.data;
  let move: ReturnType<typeof pickMove> = null;
  try {
    move = pickMove(job);
  } catch {
    // answered with no move
  }
  scope.postMessage({ id, move });
};
