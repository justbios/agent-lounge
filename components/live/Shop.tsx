"use client";

import { useEffect, useRef, useState } from "react";
import { BEAN_RULES, ITEMS, ItemDef, ItemId, inStock } from "@/lib/live/interior";
import { CafeState } from "@/lib/live/useCafe";
import { drawItem } from "../cafe/furniture";
import { plural } from "./format";

const PAD = 2;

function Preview({ it }: { it: ItemDef }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    drawItem(ctx, it.id, it.w, PAD + it.w / 2, PAD + it.h, 0.4);
  }, [it]);
  return <canvas ref={ref} width={it.w + PAD * 2} height={it.h + PAD * 2} aria-hidden />;
}

const beans = (n: number) => `${n.toLocaleString("uk-UA")} ${plural(n, "зернина", "зернини", "зерен")}`;

/** Furniture for coffee beans: buy a piece, then put it down in the café. */
export default function Shop({ cafe, onPlace }: { cafe: CafeState; onPlace: (item: ItemId) => void }) {
  const [busy, setBusy] = useState<ItemId | null>(null);
  const [bad, setBad] = useState(false);
  const stock = inStock(cafe.interior);
  const r = BEAN_RULES;
  const buy = async (id: ItemId) => {
    setBusy(id);
    setBad(false);
    const ok = await cafe.buy(id);
    setBusy(null);
    setBad(!ok);
  };

  return (
    <section className="shop">
      <div className="shop-hd">
        <div className="share-ttl">Магазин</div>
        <span className="shop-beans" title={`зароблено ${beans(cafe.beans.earned)}, витрачено ${beans(cafe.beans.spent)}`}>
          ☕ {beans(Math.max(0, cafe.beans.left))}
        </span>
      </div>
      <p className="alerts-hint">
        Кавові зерна дає робота Claude: питання {r.prompt}, доручення агенту {r.dispatch}, відповідь {r.answer}, хвилина в
        роботі {r.minute}, кожні {r.toolsPerBean} дії інструментами ще одна, досягнення {r.achievement}.
        {cafe.editable ? " Поставлену річ можна перемістити чи прибрати: клацни її в кафе." : " Купує й ставить власник кафе."}
      </p>
      {bad && <p className="key-paste-bad">Не вдалося купити, спробуй ще раз.</p>}
      <ul className="shop-grid">
        {ITEMS.map((it) => {
          const have = stock.get(it.id) ?? 0;
          const short = cafe.beans.left < it.price;
          return (
            <li key={it.id} className="shop-item">
              <Preview it={it} />
              <div className="shop-body">
                <b>{it.name}</b>
                <span className="muted-sm">
                  {it.place === "sill" ? "на підвіконня" : "на підлогу"} · ☕ {it.price}
                </span>
                {cafe.editable && (
                  <div className="shop-acts">
                    <button className="btn" disabled={short || busy != null} onClick={() => void buy(it.id)}>
                      {busy === it.id ? "купую…" : "купити"}
                    </button>
                    {have > 0 && (
                      <button className="btn" onClick={() => onPlace(it.id)}>
                        поставити{have > 1 ? ` (${have})` : ""}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
