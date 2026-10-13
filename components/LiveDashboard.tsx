"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { CalendarDays, Trophy } from "lucide-react";
import { cafeLayout } from "@/lib/cafe/layout";
import { CafeModel } from "@/lib/cafe/model";
import { agentView, buildTimeline } from "@/lib/cafe/timeline";
import { CLAUDE_COLOR, LiveSession, buildLiveModel, listSessions, sessionRoster } from "@/lib/live/liveModel";
import { leaveView, useViewRoom } from "@/lib/live/relayKey";
import { setFocus, useTeamView } from "@/lib/live/team";
import { buildTeamModel, memberOf, teamAlert } from "@/lib/live/teamModel";
import { Replay, makeReplay, replayAt } from "@/lib/live/replay";
import { useAlerts } from "@/lib/live/useAlerts";
import { useCafe } from "@/lib/live/useCafe";
import { LiveFeed } from "@/lib/live/useLiveFeed";
import { usePush } from "@/lib/live/usePush";
import { useRecap } from "@/lib/live/useRecap";
import { latestLimits, tokenRate } from "@/lib/live/usage";
import { SceneAlert } from "./cafe/CafeScene";
import AchToast from "./live/AchToast";
import AlertsMenu from "./live/AlertsMenu";
import CafePanel from "./live/CafePanel";
import ChatTabs from "./live/ChatTabs";
import AgentList from "./live/AgentList";
import EventLog from "./live/EventLog";
import EmptyCafe from "./live/EmptyCafe";
import { LimitsMini } from "./live/Limits";
import RecapPanel from "./live/RecapPanel";
import ReplayBar from "./live/ReplayBar";
import Stage from "./live/Stage";
import StatBar from "./live/StatBar";
import TeamBar from "./live/TeamBar";
import { ago } from "./live/format";

const PICK_KEY = "relay.session";
const RECENT_MS = 6 * 60 * 60 * 1000;
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
  const tabs = pool.filter(recent);
  const push = usePush(roomKey, cloud && !viewing, team.me);
  const openChat = (id: string) => {
    const s = sessions.find((x) => x.id === id);
    if (team.on && s) setFocus(memberOf(s));
    choose(id);
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
  const [cafeOpen, setCafeOpen] = useState(false);
  const cafe = useCafe({ cloud, key: roomKey, room: viewing ? viewRoom : null, events: feed.events, viewing });
  const earnedCount = cafe.earned.filter((e) => e.done).length;
  const [replay, setReplay] = useState<Replay | null>(null);
  const rp = replay && now ? replayAt(replay, now) : null;
  const shown = rp?.shown ?? 0;
  const playing = !!(replay && rp && !rp.over && replay.session === session?.id);
  const replayEvents = useMemo(() => (replay ? replay.events.slice(0, shown) : null), [replay, shown]);

  const whole = team.all && !playing;
  const scene = useMemo(() => {
    if (playing && replay && replayEvents) return buildLiveModel(replayEvents, replay.session, roster);
    if (whole) return buildTeamModel(feed.events, team.members);
    return session ? buildLiveModel(feed.events, session.id, roster) : null;
  }, [playing, replay, replayEvents, whole, feed.events, team.members, session, roster]);
  const model = scene?.model ?? EMPTY;
  const teamAttn = whole ? teamAlert(sessions, team.members) : null;
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
  const myLimits = limits.find((l) => l.member === (team.me ?? "")) ?? limits[0] ?? null;

  const offline = feed.status === "offline";
  const unplugged = cloud && !roomKey && !viewing;
  const pill = feed.status === "open" ? "на зв'язку" : unplugged ? "ще не підключено" : offline ? (cloud ? "немає зв'язку" : "Relay-сервер не запущений") : "підключаюсь…";

  return (
    <>
      <StatBar
        status={feed.status}
        pill={pill}
        seats={model.agents.length}
        seatsLabel={whole ? "учасників" : "агентів"}
        working={working}
        events={whole ? feed.events.length : (session?.count ?? 0)}
        tokens={spent}
        limits={<LimitsMini limits={myLimits} now={now} onOpen={() => setRecapOpen(true)} />}
      >
        <button className="btn" onClick={() => setRecapOpen(true)}>
          <CalendarDays size={14} /> підсумок
        </button>
        {cafe.progress && (
          <button className="btn" onClick={() => setCafeOpen(true)} title="досягнення і декор кафе">
            <Trophy size={14} /> кафе {earnedCount}/{cafe.earned.length}
          </button>
        )}
        {!viewing && <AlertsMenu cloud={cloud} push={push} />}
      </StatBar>

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

      {cafeOpen && <CafePanel cafe={cafe} onClose={() => setCafeOpen(false)} />}
      {cafe.fresh.length > 0 && !cafeOpen && (
        <AchToast
          fresh={cafe.fresh}
          onOpen={() => {
            cafe.dismiss();
            setCafeOpen(true);
          }}
          onDismiss={cafe.dismiss}
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

      {team.on && (
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
      {tabs.length > 0 && (
        <ChatTabs
          tabs={tabs}
          current={whole ? null : session}
          waiting={flagged}
          now={now}
          onPick={openChat}
          colors={team.all ? team.colorOf : undefined}
        />
      )}

      <Stage
        title={whole ? "уся команда" : session ? session.label : "інтернет-кафе"}
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
        cafe={cafe}
        empty={!session && <EmptyCafe viewing={viewing} unplugged={unplugged} offline={offline} cloud={cloud} pill={pill} />}
        cloud={cloud}
        roomKey={roomKey}
        viewing={viewing}
        onRecap={() => setRecapOpen(true)}
        onCafe={() => setCafeOpen(true)}
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

      <p className="foot">
        {cloud ? (
          <>
            Наживо: хук Claude Code шле сюди короткі описи дій під твоїм особистим ключем. Бачиш їх лише ти, зберігаються
            добу, і хук не витрачає токенів.
          </>
        ) : (
          <>
            Наживо: кожну дію твого Claude Code хук шле на локальний Relay (<code>127.0.0.1:3737</code>). Події не
            виходять з цього комп&apos;ютера, і хук не витрачає токенів.
          </>
        )}{" "}
        Головний Claude сидить за першим столом. Доручаючи задачу, він несе її субагенту, а той, закінчивши, приносить
        результат назад. Сцена клікабельна: агент покаже картку, кіт дасться погладити, дошка відкриє підсумок, автомат
        досягнення, вікно змінить вид, двері запросять команду.
      </p>
    </>
  );
}
