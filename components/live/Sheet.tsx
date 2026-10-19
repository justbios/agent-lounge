"use client";

import { ReactNode, useEffect } from "react";
import { X } from "lucide-react";
import { useTr } from "@/lib/i18n";

/** A centred panel over a dimmed page: closes on Esc, on the cross and on a click outside. */
export default function Sheet({
  label,
  title,
  sub,
  onClose,
  children,
}: {
  label: string;
  title: string;
  sub: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useTr();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="recap-backdrop" onClick={onClose}>
      <div className="recap" role="dialog" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <div className="recap-hd">
          <div>
            <div className="recap-ttl">{title}</div>
            <div className="muted-sm">{sub}</div>
          </div>
          <button className="btn recap-x" onClick={onClose} aria-label={t("закрити", "close")}>
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
