import type { Kind } from "@/lib/live/chess";

/*
 * Pixel art for the boards, one string per row: "#" is the outline, "w" the lit side, "s" the shaded side, "." is
 * see-through. The chess pieces are 16 by 16 and stand on the bottom row.
 */

export const PIECES: Record<Kind, readonly string[]> = {
  k: [
    "......####......",
    "....###ww###....",
    "....#wwwwss#....",
    "....###ws###....",
    "......#ws#......",
    "..###.#ws#.###..",
    "..#ww##ws##ss#..",
    "..#wwwwwwwwss#..",
    "..#wwwwwwwwss#..",
    "...#wwwwwwss#...",
    "....########....",
    ".....#wwss#.....",
    "....#wwwwss#....",
    "..############..",
    "..#wwwwwwwwss#..",
    "..############..",
  ],
  q: [
    "................",
    "................",
    ".......##.......",
    "..#...#ww#...#..",
    "..##..#ws#..##..",
    "..#w#.#ws#.#s#..",
    "..#ww##ww##ss#..",
    "..#wwwwwwwwss#..",
    "...#wwwwwwss#...",
    "....########....",
    ".....#wwss#.....",
    ".....#wwss#.....",
    "....#wwwwss#....",
    "..############..",
    "..#wwwwwwwwss#..",
    "..############..",
  ],
  r: [
    "................",
    "................",
    "................",
    "..###.####.###..",
    "..#w###ww###s#..",
    "..#wwwwwwwwss#..",
    "..############..",
    "....#wwwwws#....",
    "....#wwwwws#....",
    "....#wwwwss#....",
    "....#wwwwss#....",
    "....#wwwwss#....",
    "...#wwwwwwss#...",
    "..############..",
    "..#wwwwwwwwss#..",
    "..############..",
  ],
  b: [
    "................",
    ".......##.......",
    "......#ww#......",
    ".......##.......",
    "......#ww#......",
    ".....#wwws#.....",
    "....#ww#wss#....",
    "....#w#wwss#....",
    "....#wwwwss#....",
    ".....#wwss#.....",
    "....########....",
    "......#ws#......",
    ".....#wwss#.....",
    "..############..",
    "..#wwwwwwwwss#..",
    "..############..",
  ],
  n: [
    "................",
    ".......#.#......",
    "......#w#w#.....",
    ".....#wwwwws#...",
    "....#ww#wwwss#..",
    "...#wwwwwwwsss#.",
    "..#wwwwwwwwwss#.",
    "..#ww#####wwss#.",
    "..###....#wwss#.",
    ".......#wwwss#..",
    "......#wwwwss#..",
    ".....#wwwwwss#..",
    "....#wwwwwwss#..",
    "..############..",
    "..#wwwwwwwwss#..",
    "..############..",
  ],
  p: [
    "................",
    "................",
    "................",
    "................",
    "......####......",
    ".....#wwww#.....",
    ".....#wwws#.....",
    ".....#wwss#.....",
    "......####......",
    ".....#wwws#.....",
    "......#ws#......",
    "......#ws#......",
    ".....#wwss#.....",
    "....#wwwwss#....",
    "...#wwwwwwss#...",
    "...##########...",
  ],
};

/** Noughts and crosses, 9 by 9: "w" is the mark's colour, "s" its shade. */
export const MARKS = {
  x: [
    "ww.....ws",
    "www...wws",
    ".www.wws.",
    "..wwwws..",
    "...wws...",
    "..wwwss..",
    ".wws.wss.",
    "wws...wss",
    "ws.....ss",
  ],
  o: [
    "..wwwww..",
    ".wwwwwss.",
    "www...sss",
    "ww.....ss",
    "ww.....ss",
    "ww.....ss",
    "wws...sss",
    ".wssssss.",
    "..sssss..",
  ],
} as const;

export const WHITE = { "#": "#07050d", w: "#f6f1e4", s: "#c2b69c" };
export const BLACK = { "#": "#07050d", w: "#463c62", s: "#2a2340" };
/** A disc for four in a row: lit at the top left, in shadow at the bottom right; coloured like the noughts and crosses. */
export const DISC = [
  "...wwww...",
  ".wwhhwwww.",
  ".whhwwwwws",
  "wwhwwwwwws",
  "whwwwwwwws",
  "wwwwwwwwss",
  "wwwwwwwwss",
  ".wwwwwwss.",
  ".swwwssss.",
  "...ssss...",
];

export const MARK_COLORS = {
  x: { w: "#ffb07a", s: "#e0743c" },
  o: { w: "#7cc0f2", s: "#3f86c4" },
} as const;

export const DISC_COLORS = {
  x: { ...MARK_COLORS.x, h: "#ffe2c4" },
  o: { ...MARK_COLORS.o, h: "#d6eeff" },
} as const;
