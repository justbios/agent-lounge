import { CSSProperties } from "react";
import { REACT_MS } from "@/lib/live/social";
import { GuestSeat, guestTag } from "./guests";
import type { Standing } from "./placement";

/** A reaction already matched to a desk in the scene on screen. */
export interface SeatReaction {
  id: string;
  seat: number;
  emoji: string;
  from: string;
}

type Pos = (x: number, y: number) => CSSProperties;

export function GuestTags({ seats, more, pos }: { seats: GuestSeat[]; more: number; pos: Pos }) {
  return (
    <>
      {seats.map((s) => (
        <span key={s.id} className={`cafe-guest ${s.me ? "me" : ""}`} style={pos(s.x, s.y - 13)}>
          {guestTag(s)}
        </span>
      ))}
      {more > 0 && (
        <span className="cafe-guest" style={pos(23, 127)}>
          +{more}
        </span>
      )}
    </>
  );
}

/** New messages in the café's chat, floating over the counter until someone opens it. */
export function ChatTag({ unread, pos }: { unread: number; pos: Pos }) {
  if (!unread) return null;
  return (
    <span className="cafe-chat" style={pos(33, 54)}>
      💬 {unread}
    </span>
  );
}

/** The record playing on this page, floating over the jukebox. */
export function JukeTag({ playing, at, pos }: { playing?: string | null; at?: Standing; pos: Pos }) {
  if (!playing || !at) return null;
  return (
    <span className="cafe-juke" style={pos(at.cx, at.bottom - at.h - 1)}>
      ♪ {playing}
    </span>
  );
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
