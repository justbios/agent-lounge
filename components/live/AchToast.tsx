"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { Earned, achText } from "@/lib/live/achievements";
import { useTr, useUi } from "@/lib/i18n";

const SHOW_MS = 9000;

export default function AchToast({ fresh, onOpen, onDismiss }: { fresh: Earned[]; onOpen: () => void; onDismiss: () => void }) {
  const ui = useUi();
  const t = useTr();
  useEffect(() => {
    const timer = setTimeout(onDismiss, SHOW_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const first = fresh[0];
  const decor = fresh.map((e) => achText(e.def, ui).decorName).filter(Boolean);
  return (
    <div className="ach-toast" role="status">
      <span className="ach-icon" aria-hidden>
        {first.def.icon}
      </span>
      <button className="ach-toast-body" onClick={onOpen}>
        <span className="ach-toast-k">
          {fresh.length > 1
            ? t(`нові досягнення: ${fresh.length}`, `new achievements: ${fresh.length}`)
            : t("нове досягнення", "new achievement")}
        </span>
        <b>
          {achText(first.def, ui).title}
          {fresh.length > 1 && t(` і ще ${fresh.length - 1}`, ` and ${fresh.length - 1} more`)}
        </b>
        {decor.length > 0 && (
          <span className="ach-hint">
            {t(`у кафе з'явилось: ${decor.join(", ")}`, `new in the café: ${decor.join(", ")}`)}
          </span>
        )}
      </button>
      <button className="btn recap-x" onClick={onDismiss} aria-label={t("закрити", "close")}>
        <X size={14} />
      </button>
    </div>
  );
}
