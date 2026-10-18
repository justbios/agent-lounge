"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { CalendarDays, Gamepad2, MessageCircle, ShoppingBag, Trophy, X } from "lucide-react";
import { cafeLayout } from "@/lib/cafe/layout";
import { CafeModel } from "@/lib/cafe/model";
import { agentView, buildTimeline } from "@/lib/cafe/timeline";
import { openTracks } from "@/lib/live/achievements";
import { hideStale, staleVersion, useStaleHidden } from "@/lib/live/hookHealth";
import { LOBBY, houseFloors, useHouseScenes } from "@/lib/live/house";
import { CLAUDE_COLOR, LiveSession, buildLiveModel, listSessions, sessionRoster } from "@/lib/live/liveModel";
import { leaveView, useViewRoom } from "@/lib/live/relayKey";
import { setFocus, setMe, useTeamView } from "@/lib/live/team";
import { buildTeamModel, memberOf, teamAlert } from "@/lib/live/teamModel";
import { Replay, makeReplay, replayAt } from "@/lib/live/replay";
import { useAlerts } from "@/lib/live/useAlerts";
import { useAsks } from "@/lib/live/useAsks";
import { useAccess } from "@/lib/live/access";
import { settledAsks } from "@/lib/live/asks";
import { awayEmpty, awaySummary, dismissAway, useAway } from "@/lib/live/away";
import { useBeanGains } from "@/lib/live/useBeanGains";
import { useArrangeHistory } from "@/lib/live/useArrangeHistory";
import { useCafe } from "@/lib/live/useCafe";
import { useCafeSound } from "@/lib/live/useCafeSound";
import { useChat } from "@/lib/live/useChat";
import { LiveFeed } from "@/lib/live/useLiveFeed";
import { usePush } from "@/lib/live/usePush";
import { useRecap } from "@/lib/live/useRecap";
import { newPid } from "@/lib/live/interior";
import { REACT_MS } from "@/lib/live/social";
import { useGames } from "@/lib/live/useGames";
import { useSocial } from "@/lib/live/useSocial";
import { latestLimits, tokenRate } from "@/lib/live/usage";
import { Placing, SceneAlert } from "./cafe/CafeScene";
import { themeOf } from "./cafe/theme";
import AchToast from "./live/AchToast";
import AlertsMenu from "./live/AlertsMenu";
import AchPanel from "./live/AchPanel";
import ChatPanel from "./live/ChatPanel";
import JukeboxMenu from "./live/Jukebox";
import TunePlayer from "./live/TunePlayer";
import ShopPanel from "./live/ShopPanel";
import PlanPanel from "./live/PlanPanel";
import AgentList from "./live/AgentList";
import EventLog from "./live/EventLog";
import BetStrip from "./live/BetStrip";
import EmptyCafe from "./live/EmptyCafe";
import AskCard from "./live/AskCard";
import AwayCard from "./live/AwayCard";
import GamesPanel from "./live/GamesPanel";
import House, { ACTIVE_MS } from "./live/House";
import InviteToast from "./live/InviteToast";
import { LimitsMini } from "./live/Limits";
import Presence from "./live/Presence";
import SceneMenu from "./live/SceneMenu";
import RecapPanel from "./live/RecapPanel";
import ReplayBar from "./live/ReplayBar";
import SpeechPick from "./live/SpeechPick";
import Stage from "./live/Stage";
import StatBar from "./live/StatBar";
import TeamBar from "./live/TeamBar";
import { ago } from "./live/format";

const PICK_KEY = "relay.session";
const VIEW_KEY = "relay.view";
const RECENT_MS = 6 * 60 * 60 * 1000;
/** a chat quiet this long has finished its work and leaves the house; one still asking the user stays */
const QUIET_MS = 20 * 60 * 1000;
/** a café whose every chat has been quiet this long is closed for the night; one that never woke up is just waiting */
const ASLEEP_MS = 60 * 60 * 1000;
const NONE: string[] = [];

const EMPTY: CafeModel = {
  agents: [{ id: "main", name: "Claude", role: "головна сесія", color: CLAUDE_COLOR, icon: "bot", look: 2 }],
  stints: [[]],
  notes: [[]],
  trips: [],
  doneHoldMs: 0,
  seed: 4242,
};

/** A tapped push opens /?chat=<session>, which wins over the chat picked last time. */
function readPick(): string | null {
  if (typeof window === "undefined") return null;
  const fromPush = new URLSearchParams(location.search).get("chat");
  if (fromPush) {
    history.replaceState(null, "", location.pathname + location.hash);
    savePick(fromPush);
    return fromPush;
  }
  try {
    return localStorage.getItem(PICK_KEY);
  } catch {
    return null;
  }
}

function savePick(id: string) {
  try {
    localStorage.setItem(PICK_KEY, id);
  } catch {}
}

type View = "house" | "hall";

/** The whole house, or one room zoomed in; a tapped push always lands in its room. */
function readView(): View {
  if (typeof window === "undefined") return "house";
  if (new URLSearchParams(location.search).get("chat")) return "hall";
  try {
    return localStorage.getItem(VIEW_KEY) === "hall" ? "hall" : "house";
  } catch {
    return "house";
  }
}

function saveView(v: View) {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {}
}

function useRoster(cwd: string | undefined): string[] {
  const [roster, setRoster] = useState<{ cwd: string; agents: string[] } | null>(null);
  useEffect(() => {
    if (!cwd) return;
    let live = true;
    fetch(`/api/roster?cwd=${encodeURIComponent(cwd)}`)
      .then((r) => (r.ok ? r.json() : { agents: [] }))
      .then((d: { agents: string[] }) => live && setRoster({ cwd, agents: d.agents ?? [] }))
      .catch(() => live && setRoster({ cwd, agents: [] }));
    return () => {
      live = false;
    };
  }, [cwd]);
  return roster && roster.cwd === cwd ? roster.agents : NONE;
}

const STALE_OLD =
  "Підключення Claude Code в тебе старої версії: Agent Lounge не бачить лімітів підписки, заповнення контексту " +
  "і не всі назви чатів.";
const STALE_ASKS =
  "Підключення Claude Code в тебе старої версії: кафе більше не відповідає йому на запити дозволу, питання й " +
  "плани. Нове приймає лише відповіді, підписані твоїм телефоном, спареним з комп'ютером.";

function useNow(): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return now;
}

export default function LiveDashboard({
  feed,
  cloud,
  roomKey,
  viewing,
}: {
  feed: LiveFeed;
  cloud: boolean;
  roomKey: string | null;
  viewing: boolean;
}) {
  const [view, setView] = useState<View>(readView);
  const [pick, setPick] = useState<string | null>(readPick);
  const choose = (id: string) => {
    setPick(id);
    savePick(id);
  };
  const now = useNow();
  const sessions = useMemo(() => listSessions(feed.events), [feed.events]);
  const team = useTeamView(feed.events, viewing ? null : roomKey);
  const pool = team.focus != null ? sessions.filter((s) => memberOf(s) === team.focus) : sessions;
  const session = (pick && sessions.find((s) => s.id === pick)) || pool[0] || null;
  const recent = (s: LiveSession) => s === session || (!s.ended && now - s.last < RECENT_MS);
  const mine = (s: LiveSession) => !team.me || !s.member || s.member === team.me;
  const busy = (s: LiveSession) =>
    !s.ended && (now - s.last < QUIET_MS || (s.attn?.kind === "ask" && now - s.last < RECENT_MS));
  const chats = sessions.filter(busy);
  const lastAny = sessions.reduce((t, s) => Math.max(t, s.last), 0);
  const asleep = lastAny > 0 && now - lastAny > ASLEEP_MS;
  const push = usePush(roomKey, cloud && !viewing, team.me);
  const openChat = (id: string) => {
    const s = sessions.find((x) => x.id === id);
    if (team.on && s) setFocus(memberOf(s));
    choose(id);
    setView("hall");
    saveView("hall");
  };
  const waiting = useAlerts(sessions.filter((s) => recent(s) && mine(s)), session?.id ?? null, push.state === "on", openChat);
  const flagged = new Set([...waiting, ...sessions.filter((s) => s.attn && !mine(s)).map((s) => s.id)]);
  const focusOn = (m: string | null) => {
    setFocus(m);
    const first = m == null ? null : sessions.find((s) => memberOf(s) === m);
    if (first) choose(first.id);
  };

  const onSwMessage = useEffectEvent((id: string) => openChat(id));
  useEffect(() => {
    const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
    if (!sw) return;
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { relay?: string; session?: string } | null;
      if (d?.relay === "open-chat" && d.session) onSwMessage(d.session);
    };
    sw.addEventListener("message", onMsg);
    return () => sw.removeEventListener("message", onMsg);
  }, []);
  const sent = useMemo(() => (session ? sessionRoster(feed.events, session.id) : null), [feed.events, session]);
  const disk = useRoster(cloud ? undefined : session?.cwd);
  const roster = sent ?? disk;

  const viewRoom = useViewRoom();
  const [recapOpen, setRecapOpen] = useState(false);
  const recap = useRecap({ cloud, key: roomKey, room: viewing ? viewRoom : null, events: feed.events }, recapOpen);
  const [sheet, setSheet] = useState<"ach" | "myAch" | "shop" | "plan" | null>(null);
  const [placing, setPlacing] = useState<Placing | null>(null);
  const rooms = useCafe({ cloud, key: roomKey, room: viewing ? viewRoom : null, events: feed.events, viewing });
  const [replay, setReplay] = useState<Replay | null>(null);
  const rp = replay && now ? replayAt(replay, now) : null;
  const shown = rp?.shown ?? 0;
  const playing = !!(replay && rp && !rp.over && replay.session === session?.id);
  const replayEvents = useMemo(() => (replay ? replay.events.slice(0, shown) : null), [replay, shown]);

  const whole = team.all && !playing;
  const houseOn = !playing && !!session && (chats.length > 1 || team.on);
  const inHouse = houseOn && view === "house";
  const owner = inHouse || whole || !session ? null : memberOf(session) || null;
  const cafe = inHouse ? (rooms.mine ?? rooms.common) : rooms.roomOf(owner);
  const { placed, looks } = cafe.interior;
  const arrangeHistory = useArrangeHistory(`${cafe.kind}:${cafe.whose ?? ""}`, { placed, looks }, cafe.arrange);
  const earnedCount = cafe.earned.filter((e) => e.done).length;
  const awaySince = useAway(viewing ? (viewRoom ? `v:${viewRoom}` : null) : cloud ? roomKey : "local");
  const away = useMemo(
    () => (awaySince == null ? null : awaySummary(feed.events, sessions, awaySince, team.me)),
    [awaySince, feed.events, sessions, team.me],
  );
  const own = cloud && !viewing ? roomKey : null;
  const access = useAccess(own);
  const asks = useAsks(own, !!access?.name);
  const settled = useMemo(() => settledAsks(asks.asks, feed.events), [asks.asks, feed.events]);
  const gainsFor = cafe.kind === "mine" || cafe.kind === "theirs" ? cafe.whose : null;
  const gains = useBeanGains(feed.events, gainsFor, !!cafe.progress && cafe.beans.earned > 0 && !playing);
  const cafeName = rooms.common.interior.title;
  const whoseTip = cafe.whose ? `: ${cafe.kind === "mine" ? "твої" : cafe.whose}` : "";
  const lookOf = (m: string | null) => {
    const r = rooms.roomOf(m);
    return { theme: themeOf(r.settings.theme), decor: r.decor, interior: r.interior };
  };
  const scenes = useHouseScenes(feed.events, chats.map((s) => s.id).join("|"), team.on ? team.members : null, inHouse);
  const zoom = (next: View, act?: () => void) => {
    const go = () =>
      flushSync(() => {
        act?.();
        setView(next);
        saveView(next);
      });
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (doc.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) doc.startViewTransition(go);
    else go();
  };
  const scene = useMemo(() => {
    if (playing && replay && replayEvents) return buildLiveModel(replayEvents, replay.session, roster);
    if (whole) return buildTeamModel(feed.events, team.members);
    return session ? buildLiveModel(feed.events, session.id, roster) : null;
  }, [playing, replay, replayEvents, whole, feed.events, team.members, session, roster]);
  const model = scene?.model ?? EMPTY;
  const lobbyAttn = team.on ? teamAlert(sessions, team.members) : null;
  const teamAttn = whole ? lobbyAttn : null;
  const attn = playing ? null : whole ? teamAttn?.attn : session?.attn;
  const alertSeat = whole ? teamAttn?.seat : attn ? (attn.agent ? scene?.seatOf[attn.agent] : 0) : undefined;
  const alert: SceneAlert | undefined =
    attn && alertSeat != null ? { agent: alertSeat, kind: attn.kind, text: attn.text } : undefined;
  const clock = !scene || !now ? 0 : playing && rp ? rp.vnow - scene.origin : now - scene.origin;
  const lay = useMemo(() => cafeLayout(model.agents.length, model.seed), [model]);
  const tl = useMemo(() => buildTimeline(model), [model]);
  const views = model.agents.map((_, i) => agentView(model, tl, lay, i, clock));
  const working = views.filter((v) => v.screen === "work").length;
  const spent = model.agents.reduce((sum, a) => sum + (a.tokens ?? 0), 0);
  const viewEvents = useMemo(
    () => (whole ? feed.events : session ? feed.events.filter((e) => e.session === session.id) : []),
    [whole, feed.events, session],
  );
  const rate = now ? tokenRate(viewEvents, now) : 0;
  const limits = useMemo(() => latestLimits(feed.events), [feed.events]);
  const social = useSocial({
    key: viewing ? null : roomKey,
    room: viewing ? viewRoom : null,
    name: !cloud ? "ти" : (team.me ?? (viewing ? "глядач" : "без імені")),
    viewer: viewing,
    enabled: cloud,
  });
  const busyNow = inHouse ? chats.filter((s) => now - s.last < ACTIVE_MS).length : working;
  const sound = useCafeSound(busyNow, social, !viewing);
  const [chatOpen, setChatOpen] = useState(false);
  const chat = useChat({
    cloud,
    key: viewing ? null : roomKey,
    room: viewing ? viewRoom : null,
    social,
    open: chatOpen,
  });
  const sceneId = whole ? "team" : (session?.id ?? "");
  const [gamesOpen, setGamesOpen] = useState(false);
  const games = useGames({
    social,
    cloud,
    key: viewing ? null : roomKey,
    room: viewing ? viewRoom : null,
    events: feed.events,
    scope: whole ? null : (session?.id ?? null),
    now,
    live: !playing,
    open: gamesOpen,
  });
  const reactions = social.reactions
    .filter((r) => r.scene === sceneId && now - r.at < REACT_MS)
    .map((r) => ({ ...r, seat: model.agents.findIndex((a) => a.id === r.agent) }))
    .filter((r) => r.seat >= 0);
  const myLimits = limits.find((l) => l.member === (team.me ?? "")) ?? limits[0] ?? null;
  const staleHidden = useStaleHidden();
  const stale = useMemo(() => (viewing ? null : staleVersion(feed.events, team.me)), [viewing, feed.events, team.me]);

  const offline = feed.status === "offline";
  const unplugged = cloud && !roomKey && !viewing;
  const pill = feed.status === "open" ? "на зв'язку" : unplugged ? "ще не підключено" : offline ? (cloud ? "немає зв'язку" : "сервер Agent Lounge не запущений") : "підключаюсь…";

  return (
    <>
      <StatBar
        status={feed.status}
        pill={pill}
        seats={model.agents.length}
        seatsLabel={whole ? "учасників" : "агентів"}
        working={working}
        tokens={spent}
        limits={<LimitsMini limits={myLimits} now={now} onOpen={() => setRecapOpen(true)} />}
      >
        <button className="btn" onClick={() => setRecapOpen(true)}>
          <CalendarDays size={14} /> підсумок
        </button>
        <JukeboxMenu sound={sound} tracks={openTracks(cafe.earned)} />
        <SpeechPick />
        {cafe.progress && (
          <>
            <button className="btn" onClick={() => setSheet("ach")} title={`досягнення${whoseTip}`}>
              <Trophy size={14} /> {earnedCount}/{cafe.earned.length}
            </button>
            <button
              className="btn"
              onClick={() => setSheet("shop")}
              title={`кав'ярня: меблі за кавові зерна${whoseTip}`}
            >
              <ShoppingBag size={14} /> ☕ {Math.max(0, cafe.beans.left).toLocaleString("uk-UA")}
            </button>
          </>
        )}
        {!viewing && <AlertsMenu cloud={cloud} push={push} asks={own && access ? asks : null} />}
      </StatBar>

      {stale != null && !staleHidden && (
        <div className="notice stale-hooks">
          <span>
            {stale >= 3 ? STALE_ASKS : STALE_OLD}{" "}
            Онови його тією самою фразою на сторінці <Link href="/connect">підключити Claude</Link>, це пів хвилини.
          </span>
          <button className="btn btn-ic" onClick={hideStale} aria-label="сховати">
            <X size={14} />
          </button>
        </div>
      )}

      {now > 0 && <AskCard asks={asks} now={now} settled={settled} onOpen={openChat} />}

      {away && !awayEmpty(away) && now > 0 && (
        <AwayCard
          away={away}
          now={now}
          onOpen={(id) => {
            dismissAway();
            openChat(id);
          }}
          onClose={dismissAway}
        />
      )}

      {recapOpen && (
        <RecapPanel
          rows={recap.rows}
          error={recap.error}
          now={Math.floor(now / 60000) * 60000}
          canReplay={!!session}
          limits={limits}
          team={team.on}
          onReplay={() => {
            if (session) setReplay(makeReplay(feed.events, session.id, Date.now()));
            setRecapOpen(false);
          }}
          onClose={() => setRecapOpen(false)}
        />
      )}

      {(sheet === "ach" || sheet === "myAch") && (
        <AchPanel
          cafe={sheet === "myAch" ? (rooms.mine ?? cafe) : cafe}
          week={{ days: rooms.common.progress?.days ?? [], members: rooms.teamDays }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "shop" && (
        <ShopPanel
          cafe={cafe}
          onClose={() => setSheet(null)}
          onPlace={(item) => {
            setPlacing({ item, pid: newPid() });
            setSheet(null);
          }}
        />
      )}
      {sheet === "plan" && cafe.editable && (
        <PlanPanel
          cafe={cafe}
          agents={model.agents.map((a) => a.id)}
          history={arrangeHistory}
          onClose={() => setSheet(null)}
          onMove={(p) => {
            setPlacing({ item: p.item, pid: p.pid });
            setSheet(null);
          }}
        />
      )}
      {gamesOpen && (
        <GamesPanel
          scores={games.scores}
          duels={games.duels}
          ttt={games.ttt}
          chk={games.chk}
          guests={social.guests}
          room={social.room}
          online={cloud}
          me={social.name}
          onClose={() => setGamesOpen(false)}
        />
      )}
      {chatOpen && chat.on && (
        <ChatPanel
          chat={chat}
          me={team.me}
          here={social.bar}
          colorOf={team.colorOf}
          onName={(name) => roomKey && setMe(roomKey, name)}
          onClose={() => setChatOpen(false)}
        />
      )}
      <InviteToast duels={games.duels} onPlay={() => setGamesOpen(true)} />
      {rooms.fresh.length > 0 && sheet !== "ach" && sheet !== "myAch" && (
        <AchToast
          fresh={rooms.fresh}
          onOpen={() => {
            rooms.dismiss();
            setSheet("myAch");
          }}
          onDismiss={rooms.dismiss}
        />
      )}

      {viewing && (
        <div className="view-banner">
          <span>
            <b>Лише перегляд.</b> Це чуже кафе за посиланням: бачиш, що роблять агенти, але нічого не можеш змінити.
          </span>
          <button className="btn" onClick={leaveView}>
            до свого кафе
          </button>
        </div>
      )}

      {team.on && !inHouse && (
        <TeamBar
          members={team.members}
          colors={team.colors}
          focus={team.focus}
          me={team.me}
          sessions={sessions}
          now={now}
          onFocus={focusOn}
        />
      )}
      {inHouse ? (
        <House
          floors={houseFloors(chats, team)}
          scenes={scenes}
          lobby={team.on}
          lobbyAlert={lobbyAttn && { agent: lobbyAttn.seat, kind: lobbyAttn.attn.kind }}
          current={whole ? LOBBY : (session?.id ?? null)}
          waiting={flagged}
          now={now}
          title={cafeName}
          lookOf={lookOf}
          asleep={asleep}
          tools={
            <>
              <Presence guests={social.guests} />
              <SceneMenu
                items={[
                  ...(chat.on
                    ? [
                        {
                          icon: <MessageCircle size={14} />,
                          label: "чат кафе",
                          onClick: () => setChatOpen(true),
                          badge: chat.unread,
                        },
                      ]
                    : []),
                  { icon: <Gamepad2 size={14} />, label: "ігри", onClick: () => setGamesOpen(true) },
                ]}
              />
            </>
          }
          onOpen={(id) => zoom("hall", () => (id === LOBBY ? setFocus(null) : openChat(id)))}
        />
      ) : (
        <Stage
          title={whole ? "уся команда" : session ? session.label : (cafeName ?? "інтернет-кафе")}
          sub={
            replay && replay.session === session?.id ? (
              <ReplayBar
                replay={replay}
                playing={playing}
                shown={shown}
                onStop={() => setReplay(null)}
                onAgain={() => setReplay({ ...replay, startedAt: Date.now() })}
              />
            ) : (
              <span className="muted-sm">
                {whole ? `${team.members.length} за столами` : session ? `остання дія ${ago(now - session.last)}` : "чекаю на події"}
              </span>
            )
          }
          model={model}
          clock={clock}
          alert={alert}
          rate={rate}
          guests={social.guests}
          bar={social.bar}
          chatUnread={chat.unread}
          onChat={chat.on ? () => setChatOpen(true) : undefined}
          reactions={reactions}
          onReact={(i, emoji) => social.react(sceneId, model.agents[i].id, emoji)}
          cafe={cafe}
          sound={sound}
          empty={!session && <EmptyCafe viewing={viewing} unplugged={unplugged} offline={offline} cloud={cloud} pill={pill} />}
          below={
            <BetStrip
              rounds={games.bets.rounds}
              self={social.self}
              now={now}
              onPick={games.bets.place}
            />
          }
          cloud={cloud}
          roomKey={roomKey}
          viewing={viewing}
          onRecap={() => setRecapOpen(true)}
          onShop={() => setSheet("shop")}
          onPlan={() => setSheet("plan")}
          onGames={() => setGamesOpen(true)}
          placing={placing}
          onPlacing={setPlacing}
          onHouse={houseOn ? () => zoom("house") : undefined}
          gains={gains}
          asleep={asleep}
          agents={
            <AgentList
              model={model}
              views={views}
              clock={clock}
              alert={alert}
              rosterCount={whole ? 0 : roster.length}
              title={whole ? "команда" : "агенти"}
              askText={whole && teamAttn && team.members[teamAttn.seat] !== team.me ? "чекає" : undefined}
            />
          }
          log={
            <EventLog
              events={feed.events}
              session={whole ? null : (session?.id ?? null)}
              agents={model.agents}
              seatOf={scene?.seatOf}
              team={whole ? team.colorOf : undefined}
            />
          }
        />
      )}
      <TunePlayer sound={sound} />
    </>
  );
}
