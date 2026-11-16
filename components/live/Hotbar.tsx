"use client";

import { ReactNode, useEffect, useEffectEvent } from "react";

export interface HotItem {
  id: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  /** in the corner: a number waiting, or a word such as «new» */
  badge?: number | string;
  /** the colour it lights up in: games are pink, the coffee shop amber */
  tone?: "play" | "ask" | "live";
  on?: boolean;
}

/** Typing in a field or holding a modifier is not a press of the bar's keys. */
function typing(e: KeyboardEvent): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return true;
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

/**
 * The bar along the bottom, as in a game: every place of the café one press away, with keys 1–6 on a computer. What
 * used to hide behind menus (games, the coffee shop, achievements, the recap) lives here.
 */
export default function Hotbar({ items, extra }: { items: HotItem[]; extra?: ReactNode }) {
  const press = useEffectEvent((n: number) => items[n]?.onClick());
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (typing(e) || document.querySelector("[role=dialog]:not([hidden])")) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 9) press(n - 1);
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);
  return (
    <nav className="hotbar" aria-label="Agent Lounge">
      <div className="hotbar-in">
        {items.map((it, i) => (
          <button
            key={it.id}
            className={`hot ${it.on ? "on" : ""} ${it.tone ? `hot-${it.tone}` : ""}`}
            onClick={it.onClick}
            aria-current={it.on ? "page" : undefined}
            aria-keyshortcuts={String(i + 1)}
          >
            <kbd className="hot-key" aria-hidden>
              {i + 1}
            </kbd>
            {it.icon}
            <span className="hot-lbl">{it.label}</span>
            {typeof it.badge === "string" ? (
              <span className="hot-new">{it.badge}</span>
            ) : it.badge ? (
              <b className="hot-n">{it.badge}</b>
            ) : null}
          </button>
        ))}
        {extra && <div className="hot-extra">{extra}</div>}
      </div>
    </nav>
  );
}
