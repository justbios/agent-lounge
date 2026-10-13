"use client";

import { CSSProperties, ReactNode, useState } from "react";
import { flushSync } from "react-dom";
import { Floor, LOBBY } from "@/lib/live/house";
import { Interior } from "@/lib/live/interior";
import { LiveScene, LiveSession } from "@/lib/live/liveModel";
import { DecorSet } from "../cafe/decor";
import MiniCafe from "../cafe/MiniCafe";
import { Theme } from "../cafe/theme";
import { ago, plural } from "./format";

export const ACTIVE_MS = 90 * 1000;
export const ZOOM_NAME = "hall-zoom";

interface Look {
  theme: Theme;
  decor?: DecorSet;
  interior: Interior;
}

const FLAG_ERR = (err: string) => (err === "rate_limit" ? "! ліміт" : "! помилка");

function Hall({
  id,
  scene,
  title,
  sub,
  ask,
  flag,
  err,
  alert,
  busy,
  on,
  named,
  look,
  onOpen,
}: {
  id: string;
  scene: LiveScene;
  title: ReactNode;
  sub: string;
  ask?: string;
  flag?: "ask" | "done";
  /** the turn broke off instead of finishing */
  err?: string;
  alert?: { agent: number; kind: "ask" | "done" } | null;
  busy: boolean;
  on: boolean;
  named: boolean;
  look: Look;
  onOpen: (id: string) => void;
}) {
  return (
    <button className={`hall ${on ? "on" : ""} ${flag ? `attn-${flag}` : ""}`} onClick={() => onOpen(id)}>
      <span className="hall-pic" style={named ? ({ viewTransitionName: ZOOM_NAME } as CSSProperties) : undefined}>
        <MiniCafe model={scene.model} origin={scene.origin} alert={alert} {...look} />
        {flag && (
          <span className={`chat-flag flag-${flag}`}>{flag === "ask" ? "! чекає" : err ? FLAG_ERR(err) : "✓ відповів"}</span>
        )}
      </span>
      <span className="hall-hd">
        <span className={`chat-dot ${busy ? "busy" : ""}`} />
        <span className="hall-nm">{title}</span>
        <span className="hall-ago">{sub}</span>
      </span>
      {ask && <span className="hall-ask">{ask}</span>}
    </button>
  );
}

const alertOf = (s: LiveSession, scene: LiveScene, waiting: Set<string>) =>
  s.attn && waiting.has(s.id) ? { agent: s.attn.agent ? (scene.seatOf[s.attn.agent] ?? 0) : 0, kind: s.attn.kind } : null;

/** The café as a house in cross-section: every chat a room, all of them live at once; a click zooms into one. */
export default function House({
  floors,
  scenes,
  lobby,
  lobbyAlert,
  current,
  waiting,
  now,
  look,
  tools,
  onOpen,
}: {
  floors: Floor[];
  /** each chat's café by session id, and the whole team under {@link LOBBY} */
  scenes: Map<string, LiveScene>;
  lobby: boolean;
  lobbyAlert?: { agent: number; kind: "ask" | "done" } | null;
  /** the room the page zoomed out of: it is the one that shrinks back into place */
  current: string | null;
  waiting: Set<string>;
  now: number;
  look: Look;
  tools?: ReactNode;
  onOpen: (id: string) => void;
}) {
  const [target, setTarget] = useState<string | null>(null);
  const named = target ?? current;
  const open = (id: string) => {
    flushSync(() => setTarget(id));
    onOpen(id);
  };
  const rooms = floors.reduce((n, f) => n + f.chats.length, 0) + (lobby ? 1 : 0);
  const team = scenes.get(LOBBY);

  return (
    <section className="card house-card">
      <div className="card-hd">
        <span className="card-ttl">інтернет-кафе</span>
        <div className="stage-tools">
          <span className="muted-sm">
            {rooms} {plural(rooms, "зала", "зали", "зал")}
            <span className="house-hint"> · клікни, щоб наблизити</span>
          </span>
          {tools}
        </div>
      </div>
      <div className="house">
        <div className="house-roof" aria-hidden>
          <span className="house-sign">RELAY</span>
        </div>
        {floors.map((f) => (
          <div key={f.key} className="house-floor" style={{ "--c": f.color } as CSSProperties}>
            <span className="house-plate">{f.label}</span>
            <div className="house-halls">
              {f.chats.map((s) => {
                const scene = scenes.get(s.id);
                if (!scene) return null;
                const w = waiting.has(s.id) ? s.attn : null;
                return (
                  <Hall
                    key={s.id}
                    id={s.id}
                    scene={scene}
                    title={s.label}
                    sub={ago(now - s.last)}
                    ask={w?.kind === "ask" ? w.text : s.ask}
                    flag={w?.kind}
                    err={w?.err}
                    alert={alertOf(s, scene, waiting)}
                    busy={now - s.last < ACTIVE_MS}
                    on={s.id === current}
                    named={s.id === named}
                    look={look}
                    onOpen={open}
                  />
                );
              })}
            </div>
          </div>
        ))}
        {lobby && team && (
          <div className="house-floor lobby">
            <span className="house-plate">лобі</span>
            <div className="house-halls">
              <Hall
                id={LOBBY}
                scene={team}
                title="уся команда"
                sub={`${team.model.agents.length} ${plural(team.model.agents.length, "стіл", "столи", "столів")}`}
                flag={lobbyAlert?.kind}
                alert={lobbyAlert}
                busy={false}
                on={current === LOBBY}
                named={named === LOBBY}
                look={look}
                onOpen={open}
              />
            </div>
          </div>
        )}
        <div className="house-street" aria-hidden />
      </div>
    </section>
  );
}
