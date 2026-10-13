"use client";

import { ReactNode, useEffect, useEffectEvent, useState } from "react";
import { Maximize2, Minimize2, ScrollText, Users, X } from "lucide-react";
import { CafeModel } from "@/lib/cafe/model";
import { Guest } from "@/lib/live/social";
import { CafeState } from "@/lib/live/useCafe";
import { ScenePop } from "../cafe/AgentCard";
import CafeScene, { Anchor, FixturePick, SceneAlert } from "../cafe/CafeScene";
import { SeatReaction } from "../cafe/SceneSocial";
import { THEMES, THEME_IDS, themeOf } from "../cafe/theme";
import DoorInvite from "./DoorInvite";
import Presence from "./Presence";

type Pop = { kind: "door"; anchor: Anchor } | { kind: "note"; anchor: Anchor; text: string; id: number };
type Side = "agents" | "log";

function Drawer({
  side,
  title,
  open,
  onClose,
  children,
}: {
  side: "left" | "right";
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <aside className={`drawer drawer-${side} ${open ? "on" : ""}`} aria-label={title} aria-hidden={!open} inert={!open}>
      <div className="drawer-hd">
        <span className="card-ttl">{title}</span>
        <button className="btn recap-x" onClick={onClose} aria-label="закрити">
          <X size={15} />
        </button>
      </div>
      <div className="drawer-body">{children}</div>
    </aside>
  );
}

/** Full screen for a second monitor or a TV: the page goes full screen where the browser allows, the stage fills it. */
function useFullscreen(): [boolean, () => void] {
  const [full, setFull] = useState(false);
  const leave = () => {
    setFull(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
  const exit = useEffectEvent(leave);
  useEffect(() => {
    if (!full) return;
    const change = () => !document.fullscreenElement && setFull(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !document.fullscreenElement && exit();
    document.addEventListener("fullscreenchange", change);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("fullscreenchange", change);
      document.removeEventListener("keydown", esc);
    };
  }, [full]);
  const toggle = () => {
    if (full) return leave();
    setFull(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  };
  return [full, toggle];
}

export default function Stage({
  title,
  sub,
  model,
  clock,
  alert,
  rate,
  guests,
  reactions,
  onReact,
  cafe,
  empty,
  agents,
  log,
  cloud,
  roomKey,
  viewing,
  onRecap,
  onCafe,
}: {
  title: string;
  sub: ReactNode;
  model: CafeModel;
  clock: number;
  alert?: SceneAlert;
  /** tokens a minute over the last quarter hour, for the meter on the wall */
  rate: number;
  guests: Guest[];
  reactions: SeatReaction[];
  onReact: (agent: number, emoji: string) => void;
  cafe: CafeState;
  empty?: ReactNode;
  agents: ReactNode;
  log: ReactNode;
  cloud: boolean;
  roomKey: string | null;
  viewing: boolean;
  onRecap: () => void;
  onCafe: () => void;
}) {
  const [pop, setPop] = useState<Pop | null>(null);
  const [drawer, setDrawer] = useState<Side | null>(null);
  const [full, toggleFull] = useFullscreen();
  const theme = themeOf(cafe.settings.theme);

  const note = (anchor: Anchor, text: string) => {
    const id = Date.now();
    setPop({ kind: "note", anchor, text, id });
    setTimeout(() => setPop((p) => (p?.kind === "note" && p.id === id ? null : p)), 2400);
  };
  const nextTheme = async (anchor: Anchor) => {
    if (!cafe.editable) return note(anchor, "вид за вікном змінює власник кафе");
    const next = THEME_IDS[(THEME_IDS.indexOf(theme.id) + 1) % THEME_IDS.length];
    note(anchor, `за вікном: ${THEMES[next].name.toLowerCase()}`);
    if (!(await cafe.save({ theme: next }))) note(anchor, "не вдалося змінити, спробуй ще раз");
  };
  const pick = (p: FixturePick | null) => {
    if (!p) return setPop(null);
    if (p.kind === "board") return onRecap();
    if (p.kind === "vending") return onCafe();
    if (p.kind === "window") return nextTheme(p.anchor);
    setPop(pop?.kind === "door" ? null : { kind: "door", anchor: p.anchor });
  };
  const flip = (s: Side) => setDrawer(drawer === s ? null : s);

  return (
    <section className={`card stage-card ${full ? "stage-full" : ""}`}>
      <div className="card-hd">
        <span className="card-ttl">{title}</span>
        <div className="stage-tools">
          {sub}
          <Presence guests={guests} />
          <button className={`btn btn-ic ${drawer === "agents" ? "on" : ""}`} onClick={() => flip("agents")} title="агенти">
            <Users size={14} />
          </button>
          <button className={`btn btn-ic ${drawer === "log" ? "on" : ""}`} onClick={() => flip("log")} title="журнал подій">
            <ScrollText size={14} />
          </button>
          <button className="btn btn-ic" onClick={toggleFull} title={full ? "вийти з повного екрана" : "на весь екран"}>
            {full ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>
      <div className="stage-pad stage-rel">
        <CafeScene
          model={model}
          clock={clock}
          alert={alert}
          rate={rate}
          guests={guests}
          reactions={reactions}
          onReact={onReact}
          decor={cafe.decor}
          catName={cafe.settings.cat_name}
          theme={theme}
          onPick={pick}
          pops={
            pop?.kind === "door" ? (
              <ScenePop anchor={pop.anchor} label="запросити команду" onClose={() => setPop(null)}>
                <DoorInvite cloud={cloud} roomKey={roomKey} viewing={viewing} />
              </ScenePop>
            ) : pop?.kind === "note" ? (
              <div
                className={`scene-note ${pop.anchor.below ? "below" : "above"}`}
                style={{ left: `${pop.anchor.x * 100}%`, top: `${pop.anchor.y * 100}%` }}
              >
                {pop.text}
              </div>
            ) : null
          }
        />
        {empty}
      </div>
      <Drawer side="left" title="агенти" open={drawer === "agents"} onClose={() => setDrawer(null)}>
        {agents}
      </Drawer>
      <Drawer side="right" title="журнал подій" open={drawer === "log"} onClose={() => setDrawer(null)}>
        {log}
      </Drawer>
    </section>
  );
}
