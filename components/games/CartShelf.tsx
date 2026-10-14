"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
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

const size = (n: number) => (n < 1024 * 1024 ? `${Math.round(n / 1024)} КБ` : `${(n / 1024 / 1024).toFixed(1)} МБ`);

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
  if (!carts.length) return null;
  return (
    <section className="dendy-shelf" aria-label="мої картриджі">
      <p className="dendy-shelf-ttl">
        <b>мої картриджі</b> <small>лише в цьому браузері</small>
      </p>
      <ul className="dendy-games">
        {carts.map((c) => (
          <li key={c.id} className="dendy-cart">
            <button className="btn" onClick={() => onPlay(c)} disabled={busy != null} title={c.title}>
              <span className="dendy-cart-ttl">{busy === c.id ? "вантажу…" : c.title}</span>
              <small>{size(c.size)}</small>
            </button>
            <button
              className="btn btn-ic"
              onClick={() => onDrop(c.id)}
              title="прибрати з полиці"
              aria-label={`прибрати «${c.title}» з полиці`}
            >
              <X size={12} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
