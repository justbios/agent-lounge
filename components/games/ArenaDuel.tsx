"use client";

import dynamic from "next/dynamic";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { Swords } from "lucide-react";
import { NET_LEVEL, type NetGame, netGame, replay, seatOf, squadFor } from "@/lib/arena/net";
import type { Battle, Team } from "@/lib/arena/types";
import { useTr } from "@/lib/i18n";
import type { HourRow } from "@/lib/live/recap";
import { useHalloween } from "@/lib/live/season";
import type { ArenaNet } from "@/lib/live/useArenaNet";
import type { AgentDef } from "@/lib/types";
import { useSquad } from "./Arena";
import { placeFor } from "./arena/scenery";

const ArenaView = dynamic(() => import("./arena/ArenaView"), {
  ssr: false,
  loading: () => <div className="arena-loading">…</div>,
});

/**
 * The agents' battle with another person in the café: this side's squad goes out as soon as the match starts, and
 * once the other's has come both screens set up the same battle. Closed and opened again, the battle picks up where
 * it stands.
 */
export default function ArenaDuel({
  net,
  self,
  agents,
  roster,
  rows,
  note,
  onLeave,
}: {
  net: ArenaNet;
  self: string;
  agents: AgentDef[];
  roster: string[];
  rows: HourRow[] | null;
  /** why the match stopped, when it did */
  note: string | null;
  onLeave: () => void;
}) {
  const t = useTr();
  const m = net.match!;
  const squad = useSquad(agents, roster, rows);
  const joinEv = useEffectEvent(() => net.join(squadFor(m.kind, squad)));
  useEffect(() => joinEv(), [m.id]);
  const [open, setOpen] = useState(true);
  const host = m.x.id === self;
  const peer = host ? m.o : m.x;
  const xs = host ? net.mine : net.theirs;
  const os = host ? net.theirs : net.mine;
  const g = useMemo(() => (xs && os ? netGame(m.kind, m.id, xs, os) : null), [m.kind, m.id, xs, os]);

  if (!g) {
    return (
      <div className="arena-net">
        <Swords size={18} />
        <p>
          {note ??
            t(`Чекаю на загін від ${peer.name}…`, `Waiting for ${peer.name}'s squad…`)}
        </p>
      </div>
    );
  }
  if (!open) {
    return (
      <div className="arena-net">
        <Swords size={18} />
        <p>
          {note ??
            (m.over
              ? t(`Бій з ${peer.name} закінчено.`, `The battle with ${peer.name} is over.`)
              : t(`Бій з ${peer.name} триває.`, `The battle with ${peer.name} goes on.`))}
        </p>
        <button className="btn ask-yes" onClick={() => setOpen(true)}>
          <Swords size={13} /> {m.over ? t("подивитися ще раз", "look again") : t("до бою", "back to battle")}
        </button>
      </div>
    );
  }
  return (
    <NetBattle
      g={g}
      net={net}
      mine={host ? "x" : "o"}
      peer={peer.name}
      sides={
        g.kind === "raid"
          ? [`${m.x.name} + ${m.o.name}`, t("Моноліт", "The monolith")]
          : [m.x.name, m.o.name]
      }
      onExit={() => (m.over || m.gone ? setOpen(false) : onLeave())}
    />
  );
}

function NetBattle({
  g,
  net,
  mine,
  peer,
  sides,
  onExit,
}: {
  g: NetGame;
  net: ArenaNet;
  mine: "x" | "o";
  peer: string;
  sides: [string, string];
  onExit: () => void;
}) {
  const spooky = useHalloween().on;
  // a battle that began before this screen opened goes on from where it stands
  const [resume] = useState(() => (net.moves.length ? replay(g, net.moves) : null));
  const [place] = useState(() => placeFor(g.setup.id, spooky, g.kind === "raid" ? "monolith" : undefined));
  const gone = !!net.match?.gone;
  const team: Team = g.kind === "raid" || mine === "x" ? 0 : 1;
  const who = (b: Battle, id: number) => {
    const seat = seatOf(g, b, id);
    return seat === "bot" ? "bot" : seat === mine ? "me" : gone ? "bot" : "peer";
  };
  return (
    <ArenaView
      key={g.setup.id}
      setup={g.setup}
      people={[team]}
      level={NET_LEVEL}
      sides={sides}
      place={place}
      net={{ who, moves: net.moves, send: net.play, peer, gone, ...(resume ? { resume } : {}) }}
      onEnd={(o) => net.end(o.winner === team)}
      onExit={onExit}
    />
  );
}
