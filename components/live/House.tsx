"use client";

import { CSSProperties, ReactNode, useState } from "react";
import { flushSync } from "react-dom";
import { Ui, enPlural, tr, useUi } from "@/lib/i18n";
import { attentionText } from "@/lib/live/attention";
import { Floor, LOBBY } from "@/lib/live/house";
import { BRAND, Interior } from "@/lib/live/interior";
import { LiveScene, LiveSession } from "@/lib/live/liveModel";
import { memberOf } from "@/lib/live/teamModel";
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
  /** the costumes, kept in the lobby, and the teammate whose chat this is */
  dress?: Interior["dress"];
  member?: string;
}

const FLAG_ERR = (err: string, ui: Ui) =>
  err === "rate_limit" ? tr(ui, "! ліміт", "! limit") : tr(ui, "! помилка", "! error");

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
  asleep,
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
  asleep: boolean;
  onOpen: (id: string) => void;
}) {
  const ui = useUi();
  // a turn that broke off is no «your turn»: it gets its own red flag
  const tone = flag === "done" && err ? "err" : flag;
  return (
    <button className={`hall ${on ? "on" : ""} ${tone ? `attn-${tone}` : ""}`} onClick={() => onOpen(id)}>
      <span className="hall-pic" style={named ? ({ viewTransitionName: ZOOM_NAME } as CSSProperties) : undefined}>
        <MiniCafe model={scene.model} origin={scene.origin} alert={alert} asleep={asleep} {...look} />
        {flag && (
          <span className={`chat-flag flag-${tone}`}>
            {flag === "ask" ? tr(ui, "! чекає", "! waiting") : err ? FLAG_ERR(err, ui) : tr(ui, "✓ твоя черга", "✓ your turn")}
          </span>
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
  title,
  lookOf,
  asleep,
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
  /** the café's own name, on the roof */
  title?: string;
  /** a room's look: its teammate's on personal keys, null for the lobby */
  lookOf: (member: string | null) => Look;
  /** the whole café has been quiet for an hour */
  asleep: boolean;
  tools?: ReactNode;
  onOpen: (id: string) => void;
}) {
  const ui = useUi();
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
        <span className="card-ttl">{title ?? tr(ui, "інтернет-кафе", "internet café")}</span>
        <div className="stage-tools">
          <span className="muted-sm">
            {tr(ui, `${rooms} ${plural(rooms, "зала", "зали", "зал")}`, `${rooms} ${enPlural(rooms, "room", "rooms")}`)}
            <span className="house-hint"> · {tr(ui, "клікни, щоб наблизити", "click to zoom in")}</span>
          </span>
          {tools}
        </div>
      </div>
      <div className="house">
        <div className="house-roof" aria-hidden>
          <span className="house-sign">{title ?? BRAND}</span>
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
                    sub={ago(now - s.last, ui)}
                    ask={w?.kind === "ask" ? attentionText(w, ui) : s.ask}
                    flag={w?.kind}
                    err={w?.err}
                    alert={alertOf(s, scene, waiting)}
                    busy={now - s.last < ACTIVE_MS}
                    on={s.id === current}
                    named={s.id === named}
                    look={lookOf(memberOf(s) || null)}
                    asleep={asleep}
                    onOpen={open}
                  />
                );
              })}
            </div>
          </div>
        ))}
        {lobby && team && (
          <div className="house-floor lobby">
            <span className="house-plate">{tr(ui, "лобі", "lobby")}</span>
            <div className="house-halls">
              <Hall
                id={LOBBY}
                scene={team}
                title={tr(ui, "уся команда", "the whole team")}
                sub={tr(
                  ui,
                  `${team.model.agents.length} ${plural(team.model.agents.length, "стіл", "столи", "столів")}`,
                  `${team.model.agents.length} ${enPlural(team.model.agents.length, "desk", "desks")}`,
                )}
                flag={lobbyAlert?.kind}
                alert={lobbyAlert}
                busy={false}
                on={current === LOBBY}
                named={named === LOBBY}
                look={lookOf(null)}
                asleep={asleep}
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
