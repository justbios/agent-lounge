"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CLAUDE_COLOR } from "@/lib/live/liveModel";
import { memberName } from "@/lib/live/teamModel";
import { useSpeech } from "@/lib/live/speech";
import { LiveEvent } from "@/lib/live/types";
import { AgentDef } from "@/lib/types";
import CallTree from "./CallTree";
import { clockTime, logText } from "./format";

const LOG_ROWS = 120;
const NO_EVENTS: LiveEvent[] = [];

export default function EventLog({
  events,
  session,
  agents,
  seatOf,
  team,
}: {
  events: LiveEvent[];
  session: string | null;
  agents: AgentDef[];
  seatOf?: Record<string, number>;
  /** whole-team view: every teammate's events, named by teammate */
  team?: Record<string, string>;
}) {
  const log = useMemo(() => {
    if (session) return events.filter((e) => e.session === session && e.kind !== "roster").slice(-LOG_ROWS);
    return team ? events.filter((e) => e.kind !== "roster").slice(-LOG_ROWS) : NO_EVENTS;
  }, [events, session, team]);
  const sp = useSpeech();
  const ref = useRef<HTMLDivElement>(null);
  const [tree, setTree] = useState(false);
  const asTree = tree && !!session;
  const chat = useMemo(
    () => (asTree ? events.filter((e) => e.session === session) : NO_EVENTS),
    [asTree, events, session],
  );
  useEffect(() => {
    const el = ref.current;
    if (el && !asTree) el.scrollTop = el.scrollHeight;
  }, [log.length, asTree]);

  const colorOf = (agent?: string) => (agent ? (agents[seatOf?.[agent] ?? -1]?.color ?? "#9a94b8") : CLAUDE_COLOR);
  const nameOf = (e: LiveEvent) => {
    if (team) {
      const m = e.member ?? "";
      return { name: e.agent ? `${memberName(m)} · ${e.agentType ?? "агент"}` : memberName(m), color: team[m] ?? CLAUDE_COLOR };
    }
    if (!e.agent) return { name: "Claude", color: CLAUDE_COLOR };
    const a = agents[seatOf?.[e.agent] ?? -1];
    return { name: a?.name ?? e.agentType ?? "агент", color: a?.color ?? "#9a94b8" };
  };

  return (
    <div className="card">
      <div className="card-hd">
        <span className="card-ttl">{asTree ? "дерево дій" : "потік подій"}</span>
        {session ? (
          <div className="viewseg" role="radiogroup" aria-label="як показати">
            {(["потік", "дерево"] as const).map((v, i) => (
              <button
                key={v}
                role="radio"
                aria-checked={tree === !!i}
                className={tree === !!i ? "on" : ""}
                onClick={() => setTree(!!i)}
              >
                {v}
              </button>
            ))}
          </div>
        ) : (
          <span className="muted-sm">{log.length ? `останні ${log.length}` : "порожньо"}</span>
        )}
      </div>
      <div className="log" ref={ref}>
        {asTree && <CallTree events={chat} sp={sp} colorOf={colorOf} />}
        {!asTree && log.map((e) => {
          const who = nameOf(e);
          return (
            <div className="log-row" key={e.seq}>
              <span className="log-time">{clockTime(e.at)}</span>
              <span className="log-dot" style={{ background: who.color }} />
              <span className="log-nm" style={{ color: who.color }}>
                {who.name}
              </span>
              <span className="log-msg">{logText(e, sp)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
