"use client";

import Link from "next/link";
import { Radio, Plug } from "lucide-react";
import { FeedStatus } from "@/lib/live/useLiveFeed";
import SharePanel from "./live/SharePanel";

export type Mode = "demo" | "live";

export default function TopBar({
  mode,
  onMode,
  status,
  connected,
}: {
  mode: Mode;
  onMode: (m: Mode) => void;
  status: FeedStatus;
  /** Claude Code already reports here: the connect link shrinks to an icon */
  connected: boolean;
}) {
  return (
    <header className="header">
      <div className="brand">
        <span className="brand-badge">
          <Radio size={20} />
        </span>
        <div>
          <div className="brand-name">Agent Lounge</div>
          <div className="brand-sub">живий конвеєр агентів</div>
        </div>
      </div>
      <div className="header-r">
        <SharePanel />
        {connected ? (
          <Link className="btn btn-ic" href="/connect" title="Claude підключено. Ще один комп'ютер чи оновлення: тут">
            <Plug size={14} />
          </Link>
        ) : (
          <Link className="btn" href="/connect">
            <Plug size={14} /> підключити Claude
          </Link>
        )}
        <div className="viewseg modeseg">
          <button className={mode === "demo" ? "on" : ""} onClick={() => onMode("demo")}>
            демо
          </button>
          <button className={mode === "live" ? "on" : ""} onClick={() => onMode("live")}>
            <span className={`feed-dot feed-${status}`} />
            наживо
          </button>
        </div>
      </div>
    </header>
  );
}
