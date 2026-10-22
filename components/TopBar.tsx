"use client";

import Link from "next/link";
import { Plug } from "lucide-react";
import { useTr } from "@/lib/i18n";
import { FeedStatus } from "@/lib/live/useLiveFeed";
import BrandCup from "./BrandCup";
import SharePanel from "./live/SharePanel";
import SpeechPick from "./live/SpeechPick";

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
  const t = useTr();
  return (
    <header className="header">
      <div className="brand">
        <span className="brand-badge">
          <BrandCup />
        </span>
        <div>
          <div className="brand-name">Agent Lounge</div>
          <div className="brand-sub">{t("живий конвеєр агентів", "your agents, live")}</div>
        </div>
      </div>
      <div className="header-r">
        <SpeechPick />
        <SharePanel />
        {connected ? (
          <Link
            className="btn conn-on"
            href="/connect"
            title={t(
              "Claude підключено. Ще один комп'ютер чи оновлення: тут",
              "Claude is connected. Another computer or an update: here",
            )}
          >
            <span className="conn-dot" aria-hidden />
            <Plug size={14} />
            <span className="conn-txt">{t("підключено", "connected")}</span>
          </Link>
        ) : (
          <Link className="btn" href="/connect">
            <Plug size={14} /> {t("підключити Claude", "connect Claude")}
          </Link>
        )}
        <div className="viewseg modeseg">
          <button className={mode === "demo" ? "on" : ""} onClick={() => onMode("demo")}>
            {t("демо", "demo")}
          </button>
          <button className={mode === "live" ? "on" : ""} onClick={() => onMode("live")}>
            <span className={`feed-dot feed-${status}`} />
            {t("наживо", "live")}
          </button>
        </div>
      </div>
    </header>
  );
}
