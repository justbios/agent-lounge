"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";
import { useTr } from "@/lib/i18n";

export interface MenuItem {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  badge?: number;
}

/** The scene's tools behind one button: chat, games, agents, the log. The scene itself opens most of them too. */
export default function SceneMenu({ items }: { items: MenuItem[] }) {
  const t = useTr();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const badge = items.reduce((n, it) => n + (it.badge ?? 0), 0);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (!items.length) return null;
  return (
    <div className="alerts scene-menu" ref={box}>
      <button
        className={`btn btn-ic btn-dot ${open ? "on" : ""}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title={t("меню кафе", "café menu")}
      >
        <Menu size={14} />
        {badge > 0 && <b>{badge}</b>}
      </button>
      {open && (
        <div className="alerts-pop scene-menu-pop" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              className="scene-menu-row"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
            >
              {it.icon}
              <span>{it.label}</span>
              {!!it.badge && <b>{it.badge}</b>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
