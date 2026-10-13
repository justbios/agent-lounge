"use client";

import { Gamepad2 } from "lucide-react";
import { DUEL_NAMES } from "@/lib/live/duel";
import { Duels } from "@/lib/live/useDuels";

/** Someone in the café wants a game with you; shows over everything until answered. */
export default function InviteToast({ duels, onPlay }: { duels: Duels; onPlay: () => void }) {
  const i = duels.invites.at(-1);
  if (!i || duels.match) return null;
  return (
    <div className="invite-toast" role="alert">
      <Gamepad2 size={15} />
      <span>
        <b>{i.from.name}</b> кличе в {DUEL_NAMES[i.kind]}
      </span>
      <button
        className="btn"
        onClick={() => {
          duels.accept(i);
          onPlay();
        }}
      >
        грати
      </button>
      <button className="btn" onClick={() => duels.decline(i)}>
        ні
      </button>
    </div>
  );
}
