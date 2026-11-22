/*
 * The beats every match keeps, so that the game on the board and the frame around it never talk over each other:
 * who is on stage when a match opens, and when it ends.
 */

/** A match opens with its two sides shown against each other for this long; a game holds its own opening till then. */
export const INTRO_MS = 1400;

/** A real-time game serves for the first time this long after the match opens: the intro first, then its own ready-go. */
export const KICKOFF_MS = 3000;

/** When a game ends, it has this long for its own last moment on the board before the result card comes in. */
export const FINAL_MS = 1500;

/** Games that open and close in their own way: no intro and no result card is put around them. */
export const OWN_STAGE: readonly string[] = ["arena", "raid", "cables"];
