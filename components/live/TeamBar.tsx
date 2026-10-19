"use client";

import { Users } from "lucide-react";
import { useUi, tr } from "@/lib/i18n";
import { LiveSession } from "@/lib/live/liveModel";
import { memberName, memberOf } from "@/lib/live/teamModel";

const ACTIVE_MS = 90 * 1000;

export default function TeamBar({
  members,
  colors,
  focus,
  me,
  sessions,
  now,
  onFocus,
}: {
  members: string[];
  colors: string[];
  focus: string | null;
  me: string | null;
  sessions: LiveSession[];
  now: number;
  onFocus: (member: string | null) => void;
}) {
  const ui = useUi();
  return (
    <nav className="team-bar" aria-label={tr(ui, "команда", "team")}>
      <button className={`team-pill ${focus == null ? "on" : ""}`} onClick={() => onFocus(null)}>
        <Users size={13} /> {tr(ui, "уся команда", "the whole team")} <span className="team-n">{members.length}</span>
      </button>
      {members.map((m, i) => {
        const chats = sessions.filter((s) => memberOf(s) === m);
        const asking = chats.some((s) => s.attn?.kind === "ask");
        const busy = chats.some((s) => now - s.last < ACTIVE_MS);
        return (
          <button
            key={m || "—"}
            className={`team-pill ${focus === m ? "on" : ""}`}
            style={{ ["--c" as string]: colors[i] } as React.CSSProperties}
            onClick={() => onFocus(m)}
          >
            <span className={`team-dot ${busy ? "busy" : ""}`} />
            {memberName(m, ui)}
            {me && m === me && <span className="team-me">{tr(ui, "ти", "you")}</span>}
            {asking && <span className="chat-flag flag-ask">!</span>}
          </button>
        );
      })}
    </nav>
  );
}
