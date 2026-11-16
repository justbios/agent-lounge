"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MoreHorizontal, Plug } from "lucide-react";
import { useTr } from "@/lib/i18n";
import { FeedStatus } from "@/lib/live/useLiveFeed";
import BrandCup from "./BrandCup";
import SharePanel from "./live/SharePanel";
import SpeechPick from "./live/SpeechPick";

export type Mode = "demo" | "live";

export interface TopProps {
  mode: Mode;
  onMode: (m: Mode) => void;
  status: FeedStatus;
  /** Claude Code already reports here: the connect link shrinks to an icon */
  connected: boolean;
}

/** In the live café: what goes into the settings menu on a phone only (the jukebox, which a computer has below). */
type Phone = { phone?: ReactNode };

function ConnectLink({ connected }: { connected: boolean }) {
  const t = useTr();
  return connected ? (
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
  );
}

function ModeSwitch({ mode, onMode, status }: Pick<TopProps, "mode" | "onMode" | "status">) {
  const t = useTr();
  return (
    <div className="viewseg modeseg">
      <button className={mode === "demo" ? "on" : ""} onClick={() => onMode("demo")}>
        {t("демо", "demo")}
      </button>
      <button className={mode === "live" ? "on" : ""} onClick={() => onMode("live")}>
        <span className={`feed-dot feed-${status}`} />
        {t("наживо", "live")}
      </button>
    </div>
  );
}

/** What is set once and rarely touched: the language, sharing, connecting Claude, the demo. */
function More({ connected, phone, ...mode }: TopProps & Phone) {
  const t = useTr();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // the share panel opens its own pop-up inside this one, so only a click outside both closes it
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="alerts top-more" ref={box}>
      <button
        className={`btn btn-ic ${open ? "on" : ""}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={t("ще: мова, поділитися, підключення", "more: language, share, connection")}
        title={t("мова, поділитися, підключення", "language, share, connection")}
      >
        <MoreHorizontal size={16} />
        {connected && <span className="conn-dot top-more-dot" aria-hidden />}
      </button>
      {open && (
        <div className="alerts-pop top-more-pop">
          <SpeechPick />
          <SharePanel />
          <ConnectLink connected={connected} />
          <ModeSwitch {...mode} />
          {phone && <div className="phone-only">{phone}</div>}
        </div>
      )}
    </div>
  );
}

/**
 * The bar on top. On the demo it is the brand and the settings; in the live café it is a thin game-like HUD: the
 * brand, then the café's own counters (`children`), and the rarely used settings folded into one menu.
 */
export default function TopBar({ children, phone, ...top }: TopProps & Phone & { children?: ReactNode }) {
  const t = useTr();
  const hud = children != null;
  return (
    <header className={`header ${hud ? "hud" : ""}`}>
      <div className="brand">
        <span className="brand-badge">
          <BrandCup />
        </span>
        <div>
          <div className="brand-name">Agent Lounge</div>
          {!hud && <div className="brand-sub">{t("живий конвеєр агентів", "your agents, live")}</div>}
        </div>
      </div>
      {hud ? (
        <div className="header-r hud-r">
          {children}
          <More {...top} phone={phone} />
        </div>
      ) : (
        <div className="header-r">
          <SpeechPick />
          <SharePanel />
          <ConnectLink connected={top.connected} />
          <ModeSwitch {...top} />
        </div>
      )}
    </header>
  );
}
