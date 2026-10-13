"use client";

import { ReactNode } from "react";
import { Activity, Hash, Users } from "lucide-react";

const ICON = { display: "inline", verticalAlign: "-1px", marginRight: 4 } as const;

export default function StatBar({
  status,
  pill,
  seats,
  seatsLabel,
  working,
  events,
  children,
}: {
  status: string;
  pill: string;
  seats: number;
  seatsLabel: string;
  working: number;
  events: number;
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
      <div className="bar-r">{children}</div>
    </div>
  );
}
