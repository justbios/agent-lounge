"use client";

import { FormEvent, useState } from "react";
import { BRAND, ItemId, TITLE_MAX } from "@/lib/live/interior";
import { CafeState } from "@/lib/live/useCafe";
import Sheet from "./Sheet";
import Shop, { beans } from "./Shop";
import ThemePicker from "./ThemePicker";

function NameForm({
  id,
  label,
  value,
  max,
  placeholder,
  done,
  onSave,
}: {
  id: string;
  label: string;
  value: string;
  max: number;
  placeholder: string;
  done: string;
  onSave: (v: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(value);
  const [note, setNote] = useState<"" | "ok" | "bad" | "busy">("");
  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setNote("busy");
    setNote((await onSave(name.trim())) ? "ok" : "bad");
  };
  return (
    <form className="cat-name" onSubmit={submit}>
      <label htmlFor={id}>{label}</label>
      <div className="key-paste-row">
        <input
          id={id}
          value={name}
          maxLength={max}
          placeholder={placeholder}
          onChange={(e) => {
            setName(e.target.value);
            setNote("");
          }}
        />
        <button className="btn" disabled={note === "busy"}>
          {note === "busy" ? "зберігаю…" : "зберегти"}
        </button>
      </div>
      {note === "ok" && <span className="alerts-hint">{done}</span>}
      {note === "bad" && <span className="key-paste-bad">Не вдалося зберегти, спробуй ще раз.</span>}
    </form>
  );
}

/** Furniture for coffee beans, and the café's own look: the view, its name, the cat's name. */
export default function ShopPanel({
  cafe,
  onClose,
  onPlace,
}: {
  cafe: CafeState;
  onClose: () => void;
  onPlace: (item: ItemId) => void;
}) {
  const b = cafe.beans;
  return (
    <Sheet
      label="магазин"
      title="Магазин"
      sub={
        cafe.progress ? (
          <span className="shop-beans" title={`зароблено ${beans(b.earned)}, витрачено ${beans(b.spent)}`}>
            ☕ {beans(Math.max(0, b.left))}
          </span>
        ) : (
          "рахую…"
        )
      }
      onClose={onClose}
    >
      {cafe.error && <p className="key-paste-bad">Не вдалося дістати зерна, спробую ще раз за хвилину.</p>}
      {cafe.progress && <Shop cafe={cafe} onPlace={onPlace} />}
      <section className="shop-own">
        <div className="share-ttl">Твоє кафе</div>
        <ThemePicker cafe={cafe} />
        {cafe.editable && (
          <NameForm
            id="cafe-title"
            label="Назва кафе"
            value={cafe.interior.title ?? ""}
            max={TITLE_MAX}
            placeholder={`${BRAND}, або назва команди`}
            done="Готово, назва вже на вивісці й на даху."
            onSave={(v) => cafe.setNames({ title: v || undefined })}
          />
        )}
        {cafe.editable && (
          <NameForm
            id="cat-name"
            label="Ім'я кота"
            value={cafe.settings.cat_name ?? ""}
            max={24}
            placeholder="рудий кіт без імені"
            done="Готово, ім'я вже над котом."
            onSave={(v) => cafe.save({ cat_name: v || null })}
          />
        )}
      </section>
    </Sheet>
  );
}
