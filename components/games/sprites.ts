import type { Kind } from "@/lib/live/chess";

/*
 * Pixel art for the boards, one string per row: "#" is the outline, "w" the lit side, "s" the shaded side, "h" the
 * glint where the light catches it, "." is see-through. The chess pieces are 16 by 16 and stand on the bottom row.
 */

/** The light comes from the top left: the first lit pixel inside the outline of each row catches it. */
function lit(rows: readonly string[]): readonly string[] {
  return rows.map((row, y) => (y >= rows.length - 3 ? row : row.replace(/#w/, "#h")));
}

const DRAWN: Record<Kind, readonly string[]> = {
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

export const PIECES = Object.fromEntries(Object.entries(DRAWN).map(([k, rows]) => [k, lit(rows)])) as Record<
  Kind,
  readonly string[]
>;

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

export const WHITE = { "#": "#07050d", h: "#ffffff", w: "#f3ecda", s: "#bfae8c" };
export const BLACK = { "#": "#07050d", h: "#7d71a8", w: "#4a3f6a", s: "#2a2340" };

/*
 * A draughts man seen a little from the side, 15 by 12: its top face ("w", the glint "h", the shade "v" and a groove
 * "g" round the middle) and below it the edge of the disc ("s"). A king wears a crown on the face ("c", shaded "k").
 */
export const MAN = [
  "....#######....",
  "..##wwwwwww##..",
  ".#hwwgggggwwv#.",
  ".#hggwwwwwggv#.",
  ".#hgwwwwwwwgv#.",
  ".#wggwwwwwggv#.",
  ".#wwwgggggwwv#.",
  ".###wwwwwww###.",
  ".#ss#######ss#.",
  ".#sssssssssss#.",
  "..##sssssss##..",
  "....#######....",
] as const;
export const MAN_KING = [
  "....#######....",
  "..##wwwwwww##..",
  ".#hwwgggggwwv#.",
  ".#hgcwwcwwcgv#.",
  ".#hgccwcwccgv#.",
  ".#wgckkkkkcgv#.",
  ".#wwcccccccwv#.",
  ".###wwwwwww###.",
  ".#ss#######ss#.",
  ".#sssssssssss#.",
  "..##sssssss##..",
  "....#######....",
] as const;
const CROWN = { "#": "#07050d", c: "#f2b632", k: "#b7791f" };
export const MAN_WHITE = { ...CROWN, h: "#ffffff", w: "#f3ecda", v: "#ddd0b2", g: "#cbbb98", s: "#9c8865" };
export const MAN_BLACK = { ...CROWN, h: "#7d71a8", w: "#4a3f6a", v: "#40365e", g: "#342a4f", s: "#1f1930" };
export const MARK_COLORS = {
  x: { w: "#ffb07a", s: "#e0743c" },
  o: { w: "#7cc0f2", s: "#3f86c4" },
} as const;
