"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { Ui, tr, useTr, useUi } from "@/lib/i18n";
import { Cart, dropCart, keepCart, listCarts } from "@/lib/live/cartShelf";

/** The games this browser loaded from disk, kept between visits. */
export function useCartShelf() {
  const [carts, setCarts] = useState<Cart[]>([]);
  const reload = useCallback(() => listCarts().then(setCarts), []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const keep = useCallback(
    async (title: string, file: File) => {
      const r = await keepCart(title, file);
      if (r === "ok") await reload();
      return r;
    },
    [reload],
  );

  const drop = useCallback(
    async (id: string) => {
      await dropCart(id);
      await reload();
    },
    [reload],
  );

  return { carts, keep, drop };
}

const size = (n: number, ui: Ui) =>
  n < 1024 * 1024
    ? tr(ui, `${Math.round(n / 1024)} КБ`, `${Math.round(n / 1024)} KB`)
    : tr(ui, `${(n / 1024 / 1024).toFixed(1)} МБ`, `${(n / 1024 / 1024).toFixed(1)} MB`);

export function CartShelf({
  carts,
  busy,
  onPlay,
  onDrop,
}: {
  carts: Cart[];
  busy: string | null;
  onPlay: (c: Cart) => void;
  onDrop: (id: string) => void;
}) {
  const ui = useUi();
  const t = useTr();
  if (!carts.length) return null;
  return (
    <section className="dendy-shelf" aria-label={t("мої картриджі", "my cartridges")}>
      <p className="dendy-shelf-ttl">
        <b>{t("мої картриджі", "my cartridges")}</b> <small>{t("лише в цьому браузері", "in this browser only")}</small>
      </p>
      <ul className="dendy-games">
        {carts.map((c) => (
          <li key={c.id} className="dendy-cart">
            <button className="btn" onClick={() => onPlay(c)} disabled={busy != null} title={c.title}>
              <span className="dendy-cart-ttl">{busy === c.id ? t("вантажу…", "loading…") : c.title}</span>
              <small>{size(c.size, ui)}</small>
            </button>
            <button
              className="btn btn-ic"
              onClick={() => onDrop(c.id)}
              title={t("прибрати з полиці", "take off the shelf")}
              aria-label={t(`прибрати «${c.title}» з полиці`, `take “${c.title}” off the shelf`)}
            >
              <X size={12} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
