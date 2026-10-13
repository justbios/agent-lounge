"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { Earned } from "@/lib/live/achievements";

const SHOW_MS = 9000;

export default function AchToast({ fresh, onOpen, onDismiss }: { fresh: Earned[]; onOpen: () => void; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, SHOW_MS);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const first = fresh[0];
  const decor = fresh.map((e) => e.def.decorName).filter(Boolean);
  return (
    <div className="ach-toast" role="status">
      <span className="ach-icon" aria-hidden>
        {first.def.icon}
      </span>
      <button className="ach-toast-body" onClick={onOpen}>
        <span className="ach-toast-k">{fresh.length > 1 ? `нові досягнення: ${fresh.length}` : "нове досягнення"}</span>
        <b>
          {first.def.title}
          {fresh.length > 1 && ` і ще ${fresh.length - 1}`}
        </b>
        {decor.length > 0 && <span className="ach-hint">у кафе з&apos;явилось: {decor.join(", ")}</span>}
      </button>
      <button className="btn recap-x" onClick={onDismiss} aria-label="закрити">
        <X size={14} />
      </button>
    </div>
  );
}
