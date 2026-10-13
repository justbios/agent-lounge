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

const PETS = [
  { id: "cat", name: "🐈 кіт", hint: "рудий, муркоче, спить на лежаку" },
  { id: "dog", name: "🐕 песик", hint: "кремовий, вуха висячі, виляє хвостом" },
] as const;

function PetPicker({ cafe }: { cafe: CafeState }) {
  const current = cafe.interior.pet ?? "cat";
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState(false);
  const pick = async (id: (typeof PETS)[number]["id"]) => {
    if (id === current || busy) return;
    setBusy(true);
    setBad(false);
    const ok = await cafe.setNames({ pet: id === "dog" ? "dog" : undefined });
    setBusy(false);
    setBad(!ok);
  };
  return (
    <div className="theme-pick">
      <span className="theme-pick-ttl">Улюбленець кафе</span>
      <div className="theme-grid pet-grid" role="radiogroup" aria-label="улюбленець кафе">
        {PETS.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={p.id === current}
            className={`theme-opt ${p.id === current ? "on" : ""}`}
            disabled={busy}
            onClick={() => pick(p.id)}
          >
            <b>{p.name}</b>
            <span className="ach-hint">{p.hint}</span>
          </button>
        ))}
      </div>
      {bad && <span className="key-paste-bad">Не вдалося змінити, спробуй ще раз.</span>}
    </div>
  );
}

/** Furniture for coffee beans, and the café's own look: the view, its name, the pet and its name. */
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
  const dog = cafe.interior.pet === "dog";
  return (
    <Sheet
      label="кав'ярня"
      title="Кав'ярня"
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
        {cafe.editable && <PetPicker cafe={cafe} />}
        {cafe.editable && (
          <NameForm
            id="cat-name"
            label={dog ? "Ім'я песика" : "Ім'я кота"}
            value={cafe.settings.cat_name ?? ""}
            max={24}
            placeholder={dog ? "песик без імені" : "рудий кіт без імені"}
            done={`Готово, ім'я вже над ${dog ? "песиком" : "котом"}.`}
            onSave={(v) => cafe.save({ cat_name: v || null })}
          />
        )}
      </section>
    </Sheet>
  );
}
