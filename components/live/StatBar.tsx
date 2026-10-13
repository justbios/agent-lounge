"use client";

import { ReactNode } from "react";
import { Activity, Coins, Hash, Users } from "lucide-react";
import { fmtTokens } from "./tokens";

const ICON = { display: "inline", verticalAlign: "-1px", marginRight: 4 } as const;

export default function StatBar({
  status,
  pill,
  seats,
  seatsLabel,
  working,
  events,
  tokens,
  limits,
  children,
}: {
  status: string;
  pill: string;
  seats: number;
  seatsLabel: string;
  working: number;
  events: number;
  tokens: number;
  limits?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="statbar live-bar">
      <span className={`live-pill ${status === "open" ? "on" : status === "offline" ? "off" : ""}`}>
        <span className={`feed-dot feed-${status}`} />
        {pill}
      </span>
      <span className="stat-sep" />
      <div className="stat">
        <span className="stat-k">
          <Users size={11} style={ICON} />
          {seatsLabel}
        </span>
        <span className="stat-v">{seats}</span>
      </div>
      <div className="stat">
        <span className="stat-k">
          <Activity size={11} style={ICON} />
          зараз працюють
        </span>
        <span className="stat-v">{working}</span>
      </div>
      <div className="stat">
        <span className="stat-k">
          <Hash size={11} style={ICON} />
          подій
        </span>
        <span className="stat-v">{events}</span>
      </div>
      <div className="stat" title="токени, які хук порахував за останню добу в цьому чаті чи команді">
        <span className="stat-k">
          <Coins size={11} style={ICON} />
          токенів
        </span>
        <span className="stat-v">{tokens > 0 ? fmtTokens(tokens) : "—"}</span>
      </div>
      {limits}
      <div className="bar-r">{children}</div>
    </div>
  );
}
