import { CSSProperties } from "react";
import { REACT_MS } from "@/lib/live/social";
import { GuestSeat } from "./guests";
import { STOOL_TOP } from "./room";

/** A reaction already matched to a desk in the scene on screen. */
export interface SeatReaction {
  id: string;
  seat: number;
  emoji: string;
  from: string;
}

type Pos = (x: number, y: number) => CSSProperties;

export function GuestTags({ seats, pos }: { seats: GuestSeat[]; pos: Pos }) {
  return seats.map((s) => (
    <span key={s.id} className="cafe-guest" style={pos(s.x, STOOL_TOP - 13)}>
      {s.name}
    </span>
  ));
}

export function ReactionLayer({
  list,
  anchor,
  pos,
}: {
  list: SeatReaction[];
  anchor: (seat: number) => { x: number; y: number };
  pos: Pos;
}) {
  return list.map((r, k) => {
    const p = anchor(r.seat);
    const style = { ...pos(p.x + ((k % 3) - 1) * 7, p.y), animationDuration: `${REACT_MS}ms` };
    const prev = list.slice(0, k).findLast((x) => x.seat === r.seat);
    return (
      <span key={r.id} className="cafe-react" style={style}>
        <span className="cr-e">{r.emoji}</span>
        {prev?.from !== r.from && <small>{r.from}</small>}
      </span>
    );
  });
}
