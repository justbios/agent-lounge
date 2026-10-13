"use client";

import { FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";
import { Earned } from "@/lib/live/achievements";
import { BRAND, ItemId, TITLE_MAX } from "@/lib/live/interior";
import { CafeState } from "@/lib/live/useCafe";
import Shop from "./Shop";
import ThemePicker from "./ThemePicker";
import { fmtTokens } from "./tokens";

const num = (n: number) => (n >= 1e6 ? fmtTokens(n) : n.toLocaleString("uk-UA"));
const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("uk-UA", { day: "numeric", month: "long" });

function Card({ e }: { e: Earned }) {
  const { def } = e;
  return (
    <div className={`ach ${e.done ? "done" : ""}`}>
      <span className="ach-icon" aria-hidden>
        {def.icon}
      </span>
      <div className="ach-body">
        <b>{def.title}</b>
        <span className="ach-hint">{def.hint}</span>
        {e.done ? (
          <span className="ach-when">{e.day ? `отримано ${dayLabel(e.day)}` : "отримано"}</span>
        ) : def.goal > 1 ? (
          <span className="ach-meter" title={`${num(e.value)} з ${num(def.goal)}`}>
            <span className="recap-bar-track">
              <span style={{ width: `${Math.min(100, (e.value / def.goal) * 100)}%` }} />
            </span>
            <span className="ach-n">
              {num(Math.min(e.value, def.goal))}/{num(def.goal)}
            </span>
          </span>
        ) : (
          <span className="ach-when">ще ні</span>
        )}
        {def.decorName && <span className="ach-decor">{e.done ? `у кафе: ${def.decorName}` : `відкриє: ${def.decorName}`}</span>}
      </div>
    </div>
  );
}

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

export default function CafePanel({
  cafe,
  onClose,
  onPlace,
}: {
  cafe: CafeState;
  onClose: () => void;
  onPlace: (item: ItemId) => void;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const done = cafe.earned.filter((e) => e.done).length;
  const decor = cafe.earned.filter((e) => e.def.decor);

  return (
    <div className="recap-backdrop" onClick={onClose}>
      <div className="recap" role="dialog" aria-label="кафе росте" onClick={(e) => e.stopPropagation()}>
        <div className="recap-hd">
          <div>
            <div className="recap-ttl">Кафе росте</div>
            <div className="muted-sm">
              {cafe.progress
                ? `${done} з ${cafe.earned.length} досягнень · декору ${cafe.decor.size} з ${decor.length}`
                : "рахую…"}
            </div>
          </div>
          <button className="btn recap-x" onClick={onClose} aria-label="закрити">
            <X size={15} />
          </button>
        </div>

        <p className="alerts-hint">
          Кожне досягнення рахується з хуків за весь час. Деякі додають у кафе нову річ: гірлянду, акваріум, сову на
          підвіконні.
        </p>

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
        {cafe.error && <p className="key-paste-bad">Не вдалося дістати прогрес, спробую ще раз за хвилину.</p>}
        {cafe.progress && <Shop cafe={cafe} onPlace={onPlace} />}

        {cafe.progress && (
          <div className="ach-grid">
            {cafe.earned.map((e) => (
              <Card key={e.def.id} e={e} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
