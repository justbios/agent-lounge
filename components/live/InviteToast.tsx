"use client";

import { Gamepad2 } from "lucide-react";
import { Ttt } from "@/lib/live/useTicTacToe";

/** Someone in the café wants a game of noughts and crosses; shows over everything until answered. */
export default function InviteToast({ ttt, onPlay }: { ttt: Ttt; onPlay: () => void }) {
  const i = ttt.invites.at(-1);
  if (!i || ttt.game) return null;
  return (
    <div className="invite-toast" role="alert">
      <Gamepad2 size={15} />
      <span>
        <b>{i.from.name}</b> кличе в хрестики-нулики
      </span>
      <button
        className="btn"
        onClick={() => {
          ttt.accept(i);
          onPlay();
        }}
      >
        грати
      </button>
      <button className="btn" onClick={() => ttt.decline(i)}>
        ні
      </button>
    </div>
  );
}
