"use client";

import { Gamepad2 } from "lucide-react";
import { duelName } from "@/lib/live/duel";
import { unlockSfx } from "@/lib/live/sfx";
import { Duels } from "@/lib/live/useDuels";
import { useTr, useUi } from "@/lib/i18n";

/**
 * Someone in the café wants a game with you; shows over everything until answered. A rematch of a finished game whose
 * board is open is asked on the board instead.
 */
export default function InviteToast({ duels, open, onPlay }: { duels: Duels; open: boolean; onPlay: () => void }) {
  const ui = useUi();
  const t = useTr();
  const i = duels.invites.at(-1);
  const m = duels.match;
  if (!i || (m && !m.over && !m.gone) || (open && i === duels.again)) return null;
  return (
    <div className="invite-toast" role="alert">
      <Gamepad2 size={15} />
      <span>
        <b>{i.from.name}</b>{" "}
        {i.again
          ? t(`хоче ще раз у ${duelName(i.kind, ui)}`, `wants another game of ${duelName(i.kind, ui)}`)
          : t(`кличе в ${duelName(i.kind, ui)}`, `wants to play ${duelName(i.kind, ui)}`)}
        {i.clock ? t(`, по ${i.clock / 60} хв на кожного`, `, ${i.clock / 60} min each`) : ""}
      </span>
      <button
        className="btn"
        onClick={() => {
          unlockSfx();
          duels.accept(i);
          onPlay();
        }}
      >
        {t("грати", "play")}
      </button>
      <button className="btn" onClick={() => duels.decline(i)}>
        {t("ні", "no")}
      </button>
    </div>
  );
}
