"use client";

import { ReactNode, useEffect, useEffectEvent, useState } from "react";
import {
  Building2,
  Gamepad2,
  LayoutGrid,
  Maximize2,
  MessageCircle,
  Minimize2,
  ScrollText,
  Users,
  X,
} from "lucide-react";
import { CafeModel } from "@/lib/cafe/model";
import { useTr, useUi } from "@/lib/i18n";
import { openTracks } from "@/lib/live/achievements";
import { ItemId, Placed, itemName, itemOf } from "@/lib/live/interior";
import { Guest } from "@/lib/live/social";
import { Gain } from "@/lib/live/useBeanGains";
import { CafeState } from "@/lib/live/useCafe";
import { CafeSound } from "@/lib/live/useCafeSound";
import { ScenePop } from "../cafe/AgentCard";
import CafeScene, { Anchor, FixturePick, Placing, SceneAlert } from "../cafe/CafeScene";
import { SeatReaction } from "../cafe/SceneSocial";
import { THEMES, THEME_IDS, themeOf, themeText } from "../cafe/theme";
import DoorInvite from "./DoorInvite";
import { JukeboxList, playingName } from "./Jukebox";
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
  const t = useTr();
  return (
    <aside className={`drawer drawer-${side} ${open ? "on" : ""}`} aria-label={title} aria-hidden={!open} inert={!open}>
      <div className="drawer-hd">
        <span className="card-ttl">{title}</span>
        <button className="btn recap-x" onClick={onClose} aria-label={t("закрити", "close")}>
          <X size={15} />
        </button>
      </div>
      <div className="drawer-body">{children}</div>
    </aside>
  );
}

function PlacingBar({ placing, onCancel }: { placing: Placing; onCancel: () => void }) {
  const ui = useUi();
  const t = useTr();
  const it = itemOf(placing.item);
  const name = it ? itemName(it, ui) : "";
  const sill = it?.place === "sill";
  const cancel = useEffectEvent(onCancel);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && cancel();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, []);
  return (
    <div className="placing-bar" role="status">
      <span>
        {ui === "en" ? (
          <>
            Place “{name}”: {sill ? "click on the windowsill" : "click a free spot on the floor"}
          </>
        ) : (
          <>
            {sill ? "Постав" : "Став"} «{name}»: {sill ? "клацни на підвіконні" : "клацни на вільному місці підлоги"}
          </>
        )}
      </span>
      <button className="btn" onClick={onCancel}>
        {t("скасувати", "cancel")}
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
  onPlan,
  onGames,
  placing,
  onPlacing,
  onHouse,
  asleep,
  gains,
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
  /** the room's plan: pieces, character packs and the plan code; the keeper's alone */
  onPlan: () => void;
  onGames: () => void;
  placing: Placing | null;
  onPlacing: (p: Placing | null) => void;
  /** zooms back out to the whole house, when the café has more than one room */
  onHouse?: () => void;
  /** the whole café has been quiet for an hour */
  asleep?: boolean;
  /** what the latest work earned, floating up from the bean sack */
  gains?: Gain[];
}) {
  const ui = useUi();
  const t = useTr();
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
    const keeper = cafe.kind === "theirs" ? cafe.whose : t("власник кафе", "the café owner");
    if (!cafe.editable) return note(anchor, t(`вид за вікном змінює ${keeper}`, `${keeper} picks the view outside`));
    const next = THEME_IDS[(THEME_IDS.indexOf(theme.id) + 1) % THEME_IDS.length];
    note(anchor, `${t("за вікном", "outside")}: ${themeText(THEMES[next], ui).name.toLowerCase()}`);
    if (!(await cafe.save({ theme: next }))) {
      note(anchor, t("не вдалося змінити, спробуй ще раз", "couldn't change it, try again"));
    }
  };
  const pick = (p: FixturePick | null) => {
    if (!p) return setPop(null);
    if (p.kind === "board") return onRecap();
    if (p.kind === "vending" || p.kind === "beans") return onShop();
    if (p.kind === "window") return nextTheme(p.anchor);
    if (p.kind === "bar") {
      return onChat ? onChat() : note(p.anchor, t("груповий чат є в хмарному кафе", "the group chat lives in the hosted café"));
    }
    setPop(pop?.kind === "door" ? null : { kind: "door", anchor: p.anchor });
  };
  const flip = (s: Side) => setDrawer(drawer === s ? null : s);
  const menu: MenuItem[] = [
    ...(onChat
      ? [{ icon: <MessageCircle size={14} />, label: t("чат кафе", "café chat"), onClick: onChat, badge: chatUnread }]
      : []),
    { icon: <Gamepad2 size={14} />, label: t("ігри", "games"), onClick: onGames },
    { icon: <Users size={14} />, label: t("агенти", "agents"), onClick: () => flip("agents") },
    { icon: <ScrollText size={14} />, label: t("журнал подій", "event log"), onClick: () => flip("log") },
    ...(cafe.editable ? [{ icon: <LayoutGrid size={14} />, label: t("план кафе", "café plan"), onClick: onPlan }] : []),
  ];
  const place = async (p: Placed) => {
    onPlacing(null);
    if (!(await cafe.place(p))) note(TOP, t("не вдалося поставити, спробуй ще раз", "couldn't place it, try again"));
  };
  const furn = pop?.kind === "furniture" ? pop : undefined;
  const furnDef = furn && itemOf(furn.item);
  const furnName = furnDef ? itemName(furnDef, ui) : "";
  const moved = !!furn && cafe.interior.placed.some((p) => p.pid === furn.pid);

  const pops =
    furn && furnDef ? (
      <ScenePop anchor={furn.anchor} label={furnName} onClose={() => setPop(null)}>
        <div className="furn-pop">
          <b>{furnName}</b>
          <div>
            <button
              className="btn"
              onClick={() => {
                setPop(null);
                onPlacing({ item: furn.item, pid: furn.pid });
              }}
            >
              {t("перемістити", "move")}
            </button>
            {(!furnDef.decor || moved) && (
              <button
                className="btn"
                onClick={() => {
                  setPop(null);
                  void cafe.stow(furn.pid);
                }}
              >
                {furnDef.decor ? t("на звичне місце", "back to its spot") : t("прибрати", "put away")}
              </button>
            )}
          </div>
        </div>
      </ScenePop>
    ) : pop?.kind === "machine" ? (
      <ScenePop
        anchor={pop.anchor}
        label={pop.item === "arcade" ? t("ігровий автомат", "arcade machine") : t("музичний автомат", "jukebox")}
        onClose={() => setPop(null)}
      >
        <div className="juke-pop">
          {pop.item === "arcade" ? (
            <>
              <b>{t("Ігровий автомат", "Arcade machine")}</b>
              <button
                className="btn"
                onClick={() => {
                  setPop(null);
                  onGames();
                }}
              >
                <Gamepad2 size={14} /> {t("грати", "play")}
              </button>
            </>
          ) : (
            <>
              <b>{t("Музичний автомат", "Jukebox")}</b>
              <JukeboxList sound={sound} open={openTracks(cafe.earned)} />
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
                {t("перемістити", "move")}
              </button>
              <button
                className="btn"
                onClick={() => {
                  setPop(null);
                  void cafe.stow(pop.pid);
                }}
              >
                {t("прибрати", "put away")}
              </button>
            </div>
          )}
        </div>
      </ScenePop>
    ) : pop?.kind === "door" ? (
      <ScenePop anchor={pop.anchor} label={t("запросити команду", "invite the team")} onClose={() => setPop(null)}>
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
          <button
            className="btn btn-ic house-back"
            onClick={onHouse}
            title={t("до всього будинку", "back to the whole house")}
          >
            <Building2 size={14} />
          </button>
        )}
        <span className="card-ttl">{title}</span>
        <div className="stage-tools">
          {sub}
          <Presence guests={guests} />
          <SceneMenu items={menu} />
          <button
            className="btn btn-ic"
            onClick={toggleFull}
            title={full ? t("вийти з повного екрана", "exit full screen") : t("на весь екран", "full screen")}
          >
            {full ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>
      <div className="stage-pad stage-rel">
        <CafeScene
          model={model}
          clock={clock}
          alert={alert}
          asleep={asleep}
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
          name={cafe.title}
          onLook={cafe.editable ? (id, look) => void cafe.setLook(id, look) : undefined}
          placing={placing}
          onPlacing={cafe.editable ? onPlacing : undefined}
          onPlace={place}
          onFurniture={cafe.editable ? (f, anchor) => setPop({ kind: "furniture", ...f, anchor }) : undefined}
          onMachine={(f, anchor) =>
            f.item === "arcade" && !cafe.editable ? onGames() : setPop({ kind: "machine", ...f, anchor })
          }
          playing={sound.on ? playingName(sound, ui) : null}
          beans={cafe.beans.left}
          gains={gains}
          pops={pops}
          visitors
        />
        {placing && <PlacingBar placing={placing} onCancel={() => onPlacing(null)} />}
        {empty}
        {below}
      </div>
      <Drawer side="left" title={t("агенти", "agents")} open={drawer === "agents"} onClose={() => setDrawer(null)}>
        {agents}
      </Drawer>
      <Drawer
        side="right"
        title={t("журнал подій", "event log")}
        open={drawer === "log"}
        onClose={() => setDrawer(null)}
      >
        {log}
      </Drawer>
    </section>
  );
}
