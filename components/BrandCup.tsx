/** The cup from the app's icons, on the same 16×16 grid, for the badge beside the name. */
const ROWS = [
  "................",
  ".....s..s..s....",
  "....s..s..s.....",
  ".....s..s..s....",
  "....s..s..s.....",
  "................",
  "...lllllllll....",
  "...lcccccccl##..",
  "...#l#######..#.",
  "...#l#######..#.",
  "...#l#########..",
  "...d#######d....",
  "....ddddddd.....",
  "..ppppppppppp...",
];

const FILL: Record<string, string> = {
  s: "#7ef0ff",
  l: "#b9a8ff",
  c: "#784828",
  "#": "#7c5cff",
  d: "#4a36aa",
  p: "#302856",
};

export default function BrandCup({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 1 16 13" shapeRendering="crispEdges" aria-hidden>
      {ROWS.flatMap((row, y) =>
        [...row].map((ch, x) =>
          FILL[ch] ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={FILL[ch]} /> : null,
        ),
      )}
    </svg>
  );
}
