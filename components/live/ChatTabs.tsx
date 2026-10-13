"use client";

import { LiveSession } from "@/lib/live/liveModel";
import { ago } from "./format";

const ACTIVE_MS = 90 * 1000;

export default function ChatTabs({
  tabs,
  current,
  waiting,
  now,
  onPick,
}: {
  tabs: LiveSession[];
  current: LiveSession | null;
  waiting: Set<string>;
  now: number;
  onPick: (id: string) => void;
}) {
  return (
    <nav className="chat-tabs" aria-label="чати Claude Code">
      {tabs.map((s) => {
        const w = waiting.has(s.id) ? s.attn : null;
        return (
          <button
            key={s.id}
            className={`chat-tab ${s === current ? "on" : ""} ${w ? `attn-${w.kind}` : ""}`}
            onClick={() => onPick(s.id)}
            title={s.cwd}
          >
            <span className="chat-tab-hd">
              <span className={`chat-dot ${now - s.last < ACTIVE_MS ? "busy" : ""}`} />
              <span className="chat-tab-nm">{s.label}</span>
              {w ? (
                <span className={`chat-flag flag-${w.kind}`}>{w.kind === "ask" ? "! чекає" : "✓ відповів"}</span>
              ) : (
                <span className="chat-tab-ago">{ago(now - s.last)}</span>
              )}
            </span>
            <span className="chat-tab-ask">{w?.kind === "ask" ? w.text : (s.ask ?? "питань ще не було")}</span>
          </button>
        );
      })}
    </nav>
  );
}
