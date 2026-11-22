/*
 * The lab's window into a real-time game on screen (see docs/lab.md). A solo game says how its state can be read;
 * the lab page hands that to Playwright as `window.__lab.state()`. Nothing in the café itself reads it.
 */

let peek: (() => unknown) | null = null;

/** A solo real-time game tells the lab how to read its state, and null when it is gone. */
export function labWatch(read: (() => unknown) | null) {
  peek = read;
}

/** The state of the real-time game on screen right now, or null with none. */
export const labState = (): unknown => peek?.() ?? null;
