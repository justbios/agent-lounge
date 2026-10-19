"use client";

import { ReactNode } from "react";
import { Activity, Coins, Users } from "lucide-react";
import { useTr, useUi } from "@/lib/i18n";
import { fmtTokens } from "./tokens";

const ICON = { display: "inline", verticalAlign: "-1px", marginRight: 4 } as const;

export default function StatBar({
  status,
  pill,
  seats,
  seatsLabel,
  working,
  tokens,
  limits,
  children,
}: {
  status: string;
  pill: string;
  seats: number;
  seatsLabel: string;
  working: number;
  tokens: number;
  limits?: ReactNode;
  children: ReactNode;
}) {
  const t = useTr();
  const ui = useUi();
  return (
    <div className="statbar live-bar">
      {status !== "open" && (
        <>
          <span className={`live-pill ${status === "offline" ? "off" : ""}`}>
            <span className={`feed-dot feed-${status}`} />
            {pill}
          </span>
          <span className="stat-sep" />
        </>
      )}
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
          {t("зараз працюють", "working now")}
        </span>
        <span className="stat-v">{working}</span>
      </div>
      <div
        className="stat"
        title={t(
          "токени, які хук порахував за останню добу в цьому чаті чи команді",
          "tokens the hook counted over the last day in this chat or team",
        )}
      >
        <span className="stat-k">
          <Coins size={11} style={ICON} />
          {t("токенів", "tokens")}
        </span>
        <span className="stat-v">{tokens > 0 ? fmtTokens(tokens, ui) : "—"}</span>
      </div>
      {limits}
      <div className="bar-r">{children}</div>
    </div>
  );
}
