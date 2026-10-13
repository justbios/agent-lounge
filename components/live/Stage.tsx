"use client";

import { ReactNode, useEffect, useEffectEvent, useState } from "react";
import { Building2, Gamepad2, Maximize2, MessageCircle, Minimize2, ScrollText, Users, X } from "lucide-react";
import { CafeModel } from "@/lib/cafe/model";
import { ItemId, Placed, itemOf } from "@/lib/live/interior";
import { Guest } from "@/lib/live/social";
import { trackInfo } from "@/lib/live/tracks";
import { CafeState } from "@/lib/live/useCafe";
import { CafeSound } from "@/lib/live/useCafeSound";
import { ScenePop } from "../cafe/AgentCard";
import CafeScene, { Anchor, FixturePick, Placing, SceneAlert } from "../cafe/CafeScene";
import { SeatReaction } from "../cafe/SceneSocial";
import { THEMES, THEME_IDS, themeOf } from "../cafe/theme";
import DoorInvite from "./DoorInvite";
import { JukeboxList } from "./Jukebox";
import Presence from "./Presence";
import SceneMenu, { MenuItem } from "./SceneMenu";

type Pop =
  | { kind: "door"; anchor: Anchor }
  | { kind: "furniture"; anchor: Anchor; pid: string; item: ItemId }
  | { kind: "machine"; anchor: Anchor; pid: string; item: ItemId }
  | { kind: "note"; anchor: Anchor; text: string; id: number };

const TOP: Anchor = { x: 0.5, y: 0.08, below: true };
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

function PlacingBar({ placing, onCancel }: { placing: Placing; onCancel: () => void }) {
  const it = itemOf(placing.item);
  const cancel = useEffectEvent(onCancel);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && cancel();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, []);
  return (
    <div className="placing-bar" role="status">
      <span>
        {it?.place === "sill" ? "Постав" : "Став"} «{it?.name}»:{" "}
        {it?.place === "sill" ? "клацни на підвіконні" : "клацни на вільному місці підлоги"}
      </span>
      <button className="btn" onClick={onCancel}>
        скасувати
      </button>
    </div>
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
  bar,
  chatUnread,
  onChat,
  reactions,
  onReact,
  cafe,
  sound,
  empty,
  below,
  agents,
  log,
  cloud,
  roomKey,
  viewing,
  onRecap,
  onShop,
  onGames,
  placing,
  onPlacing,
  onHouse,
}: {
  title: string;
  sub: ReactNode;
  model: CafeModel;
  clock: number;
  alert?: SceneAlert;
  /** tokens a minute over the last quarter hour, for the meter on the wall */
  rate: number;
  guests: Guest[];
  /** everyone at the bar, this tab included */
  bar: Guest[];
  chatUnread: number;
  /** a click on the bar; without it the bar only says the chat lives in the hosted café */
  onChat?: () => void;
  reactions: SeatReaction[];
  onReact: (agent: number, emoji: string) => void;
  cafe: CafeState;
  sound: CafeSound;
  empty?: ReactNode;
  /** under the scene: the open bets */
  below?: ReactNode;
  agents: ReactNode;
  log: ReactNode;
  cloud: boolean;
  roomKey: string | null;
  viewing: boolean;
  onRecap: () => void;
  onShop: () => void;
  onGames: () => void;
  placing: Placing | null;
  onPlacing: (p: Placing | null) => void;
  /** zooms back out to the whole house, when the café has more than one room */
  onHouse?: () => void;
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
    if (p.kind === "vending" || p.kind === "beans") return onShop();
    if (p.kind === "window") return nextTheme(p.anchor);
    if (p.kind === "bar") return onChat ? onChat() : note(p.anchor, "груповий чат є в хмарному кафе");
    setPop(pop?.kind === "door" ? null : { kind: "door", anchor: p.anchor });
  };
  const flip = (s: Side) => setDrawer(drawer === s ? null : s);
  const menu: MenuItem[] = [
    ...(onChat ? [{ icon: <MessageCircle size={14} />, label: "чат кафе", onClick: onChat, badge: chatUnread }] : []),
    { icon: <Gamepad2 size={14} />, label: "ігри", onClick: onGames },
    { icon: <Users size={14} />, label: "агенти", onClick: () => flip("agents") },
    { icon: <ScrollText size={14} />, label: "журнал подій", onClick: () => flip("log") },
  ];
  const place = async (p: Placed) => {
    onPlacing(null);
    if (!(await cafe.place(p))) note(TOP, "не вдалося поставити, спробуй ще раз");
  };
  const furn = pop?.kind === "furniture" ? pop : undefined;
  const furnDef = furn && itemOf(furn.item);
  const moved = !!furn && cafe.interior.placed.some((p) => p.pid === furn.pid);

  const pops =
    furn && furnDef ? (
      <ScenePop anchor={furn.anchor} label={furnDef.name} onClose={() => setPop(null)}>
        <div className="furn-pop">
          <b>{furnDef.name}</b>
          <div>
            <button
              className="btn"
              onClick={() => {
                setPop(null);
                onPlacing({ item: furn.item, pid: furn.pid });
              }}
            >
              перемістити
            </button>
            {(!furnDef.decor || moved) && (
              <button
                className="btn"
                onClick={() => {
                  setPop(null);
                  void cafe.stow(furn.pid);
                }}
              >
                {furnDef.decor ? "на звичне місце" : "прибрати"}
              </button>
            )}
          </div>
        </div>
      </ScenePop>
    ) : pop?.kind === "machine" ? (
      <ScenePop
        anchor={pop.anchor}
        label={pop.item === "arcade" ? "ігровий автомат" : "музичний автомат"}
        onClose={() => setPop(null)}
      >
        <div className="juke-pop">
          {pop.item === "arcade" ? (
            <>
              <b>Ігровий автомат</b>
              <button
                className="btn"
                onClick={() => {
                  setPop(null);
                  onGames();
                }}
              >
                <Gamepad2 size={14} /> грати
              </button>
            </>
          ) : (
            <>
              <b>Музичний автомат</b>
              <JukeboxList sound={sound} />
            </>
          )}
          {cafe.editable && (
            <div className="juke-own">
              <button
                className="btn"
                onClick={() => {
                  setPop(null);
                  onPlacing({ item: pop.item, pid: pop.pid });
                }}
              >
                перемістити
              </button>
              <button
                className="btn"
                onClick={() => {
                  setPop(null);
                  void cafe.stow(pop.pid);
                }}
              >
                прибрати
              </button>
            </div>
          )}
        </div>
      </ScenePop>
    ) : pop?.kind === "door" ? (
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
    ) : null;

  return (
    <section className={`card stage-card ${full ? "stage-full" : ""} ${onHouse ? "zoomed" : ""}`}>
      <div className="card-hd">
        {onHouse && (
          <button className="btn btn-ic house-back" onClick={onHouse} title="до всього будинку">
            <Building2 size={14} />
          </button>
        )}
        <span className="card-ttl">{title}</span>
        <div className="stage-tools">
          {sub}
          <Presence guests={guests} />
          <SceneMenu items={menu} />
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
          guests={bar}
          chatUnread={chatUnread}
          reactions={reactions}
          onReact={onReact}
          decor={cafe.decor}
          catName={cafe.settings.cat_name}
          theme={theme}
          onPick={pick}
          interior={cafe.interior}
          onLook={cafe.editable ? (id, look) => void cafe.setLook(id, look) : undefined}
          placing={placing}
          onPlacing={cafe.editable ? onPlacing : undefined}
          onPlace={place}
          onFurniture={cafe.editable ? (f, anchor) => setPop({ kind: "furniture", ...f, anchor }) : undefined}
          onMachine={(f, anchor) =>
            f.item === "arcade" && !cafe.editable ? onGames() : setPop({ kind: "machine", ...f, anchor })
          }
          playing={sound.on ? trackInfo(sound.track).name : null}
          beans={cafe.beans.left}
          pops={pops}
        />
        {placing && <PlacingBar placing={placing} onCancel={() => onPlacing(null)} />}
        {empty}
        {below}
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
