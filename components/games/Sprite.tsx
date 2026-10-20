import type { Kind } from "@/lib/live/chess";
import { BLACK, PIECES, WHITE } from "./sprites";

interface Run {
  x: number;
  y: number;
  w: number;
  ch: string;
}

const runs = new Map<readonly string[], Run[]>();

/** A sprite's rows as runs of one colour, worked out once per sprite. */
function runsOf(rows: readonly string[]): Run[] {
  let out = runs.get(rows);
  if (out) return out;
  out = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      let end = x + 1;
      while (end < row.length && row[end] === row[x]) end++;
      if (row[x] !== ".") out!.push({ x, y, w: end - x, ch: row[x] });
      x = end;
    }
  });
  runs.set(rows, out);
  return out;
}

/** Pixel art from rows of characters, each one a colour from `palette`; "." is see-through. */
export function Sprite({
  rows,
  palette,
  className,
}: {
  rows: readonly string[];
  palette: Record<string, string>;
  className?: string;
}) {
  return (
    <svg className={className} viewBox={`0 0 ${rows[0].length} ${rows.length}`} shapeRendering="crispEdges" aria-hidden>
      {runsOf(rows).map((r) => (
        <rect key={`${r.x}.${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={palette[r.ch]} />
      ))}
    </svg>
  );
}

export function ChessPiece({ kind, white, className = "piece" }: { kind: Kind; white: boolean; className?: string }) {
  return <Sprite rows={PIECES[kind]} palette={white ? WHITE : BLACK} className={className} />;
}
