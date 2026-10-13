"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { BEAN_RULES, ItemDef, ItemId, ItemPlace, SHOP, SIGN_MAX, inStock } from "@/lib/live/interior";
import { CafeState } from "@/lib/live/useCafe";
import { drawItem } from "../cafe/furniture";
import { plural } from "./format";

const PAD = 2;

const WHERE: Record<ItemPlace, string> = {
  sill: "на підвіконня",
  wall: "на стіну",
  floor: "на підлогу",
  rug: "на підлогу, під ноги",
  perk: "один на кафе",
};

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

function NameField({
  label,
  value,
  max,
  placeholder,
  onSave,
}: {
  label: string;
  value: string;
  max: number;
  placeholder: string;
  onSave: (v: string) => Promise<boolean>;
}) {
  const [v, setV] = useState(value);
  const [note, setNote] = useState<"" | "busy" | "ok" | "bad">("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setNote("busy");
    setNote((await onSave(v)) ? "ok" : "bad");
  };
  return (
    <form className="shop-name" onSubmit={submit}>
      <input
        aria-label={label}
        value={v}
        maxLength={max}
        placeholder={placeholder}
        onChange={(e) => {
          setV(e.target.value);
          setNote("");
        }}
      />
      <button className="btn" disabled={note === "busy"}>
        {note === "ok" ? "готово" : "зберегти"}
      </button>
      {note === "bad" && <span className="key-paste-bad">не вдалося</span>}
    </form>
  );
}

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
        {cafe.editable
          ? " Поставлене, і зароблений декор теж, можна перетягнути або клацнути, щоб перемістити чи прибрати."
          : " Купує й ставить власник кафе."}
      </p>
      {bad && <p className="key-paste-bad">Не вдалося купити, спробуй ще раз.</p>}
      <ul className="shop-grid">
        {SHOP.map((it) => {
          const have = stock.get(it.id) ?? 0;
          const perk = it.place === "perk";
          const got = perk && have > 0;
          return (
            <li key={it.id} className="shop-item">
              <Preview it={it} />
              <div className="shop-body">
                <b>{it.name}</b>
                <span className="muted-sm">
                  {WHERE[it.place]} · ☕ {it.price}
                </span>
                {cafe.editable && !got && (
                  <div className="shop-acts">
                    <button className="btn" disabled={cafe.beans.left < it.price || busy != null} onClick={() => void buy(it.id)}>
                      {busy === it.id ? "купую…" : "купити"}
                    </button>
                    {!perk && have > 0 && (
                      <button className="btn" onClick={() => onPlace(it.id)}>
                        поставити{have > 1 ? ` (${have})` : ""}
                      </button>
                    )}
                  </div>
                )}
                {cafe.editable && got && it.id === "neon" && (
                  <NameField
                    label="напис на вивісці"
                    value={cafe.interior.sign ?? ""}
                    max={SIGN_MAX}
                    placeholder="інтернет-кафе"
                    onSave={(sign) => cafe.setNames({ sign })}
                  />
                )}
                {cafe.editable && got && it.id === "cat2" && (
                  <NameField
                    label="ім'я другого кота"
                    value={cafe.interior.cat2Name ?? ""}
                    max={24}
                    placeholder="сірий кіт без імені"
                    onSave={(cat2Name) => cafe.setNames({ cat2Name })}
                  />
                )}
                {!cafe.editable && got && <span className="muted-sm">уже в кафе</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
