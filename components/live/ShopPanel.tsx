"use client";

import { FormEvent, useState } from "react";
import { Two, Ui, useTr, useUi } from "@/lib/i18n";
import { BRAND, ItemId, TITLE_MAX } from "@/lib/live/interior";
import { CafeState } from "@/lib/live/useCafe";
import { RoomKind } from "@/lib/live/cafeRoom";
import type { AgentDef } from "@/lib/types";
import AgentLooks from "./AgentLooks";
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
  const t = useTr();
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
          {note === "busy" ? t("зберігаю…", "saving…") : t("зберегти", "save")}
        </button>
      </div>
      {note === "ok" && <span className="alerts-hint">{done}</span>}
      {note === "bad" && (
        <span className="key-paste-bad">{t("Не вдалося зберегти, спробуй ще раз.", "Couldn't save, try again.")}</span>
      )}
    </form>
  );
}

const PETS: { id: "cat" | "dog"; name: Two; hint: Two }[] = [
  {
    id: "cat",
    name: { uk: "🐈 кіт", en: "🐈 cat" },
    hint: { uk: "рудий, муркоче, спить на лежаку", en: "ginger, purrs, naps on its bed" },
  },
  {
    id: "dog",
    name: { uk: "🐕 песик", en: "🐕 dog" },
    hint: { uk: "кремовий, вуха висячі, виляє хвостом", en: "cream-coloured, floppy ears, wags its tail" },
  },
];

function PetPicker({ cafe }: { cafe: CafeState }) {
  const ui = useUi();
  const t = useTr();
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
      <span className="theme-pick-ttl">{t("Улюбленець кафе", "Café pet")}</span>
      <div className="theme-grid pet-grid" role="radiogroup" aria-label={t("улюбленець кафе", "café pet")}>
        {PETS.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={p.id === current}
            className={`theme-opt ${p.id === current ? "on" : ""}`}
            disabled={busy}
            onClick={() => pick(p.id)}
          >
            <b>{p.name[ui]}</b>
            <span className="ach-hint">{p.hint[ui]}</span>
          </button>
        ))}
      </div>
      {bad && (
        <span className="key-paste-bad">{t("Не вдалося змінити, спробуй ще раз.", "Couldn't change it, try again.")}</span>
      )}
    </div>
  );
}

const OWN: Record<RoomKind, (whose: string | null, ui: Ui) => string> = {
  cafe: (_, ui) => (ui === "en" ? "Your café" : "Твоє кафе"),
  lobby: (_, ui) => (ui === "en" ? "The lobby" : "Спільна зала"),
  mine: (_, ui) => (ui === "en" ? "Your room" : "Твоя кімната"),
  theirs: (whose, ui) => (ui === "en" ? `${whose}'s room` : `Кімната: ${whose}`),
};

/** Furniture for coffee beans, and the room's own look: the view, the café's name, the pet, its name and the agents. */
export default function ShopPanel({
  cafe,
  agents,
  seed,
  onClose,
  onPlace,
}: {
  cafe: CafeState;
  /** the agents of the chat on screen, to name and dress */
  agents: AgentDef[];
  seed: number;
  onClose: () => void;
  onPlace: (item: ItemId) => void;
}) {
  const ui = useUi();
  const t = useTr();
  const b = cafe.beans;
  const dog = cafe.interior.pet === "dog";
  return (
    <Sheet
      label={t("кав'ярня", "coffee shop")}
      title={t("Кав'ярня", "Coffee shop")}
      sub={
        cafe.progress ? (
          <span
            className="shop-beans"
            title={t(
              `зароблено ${beans(b.earned, ui)}, витрачено ${beans(b.spent, ui)}`,
              `earned ${beans(b.earned, ui)}, spent ${beans(b.spent, ui)}`,
            )}
          >
            ☕ {beans(Math.max(0, b.left), ui)}
          </span>
        ) : (
          t("рахую…", "counting…")
        )
      }
      onClose={onClose}
    >
      {cafe.kind === "theirs" && (
        <p className="alerts-hint">
          {t(
            `Це кімната, яку обставляє ${cafe.whose}, за свої зерна. Дивитися можна, змінювати ні.`,
            `${cafe.whose} furnishes this room with their own beans. You can look, but not change it.`,
          )}
        </p>
      )}
      {cafe.kind === "lobby" && (
        <p className="alerts-hint">
          {t(
            "Спільну залу обставляє вся команда: зерна на неї заробляють усі разом.",
            "The whole team furnishes the lobby: everyone earns its beans together.",
          )}
        </p>
      )}
      {cafe.error && (
        <p className="key-paste-bad">
          {t(
            "Не вдалося дістати зерна, спробую ще раз за хвилину.",
            "Couldn't fetch the beans, I'll try again in a minute.",
          )}
        </p>
      )}
      {cafe.progress && <Shop cafe={cafe} onPlace={onPlace} />}
      <section className="shop-own">
        <div className="share-ttl">{OWN[cafe.kind](cafe.whose, ui)}</div>
        <ThemePicker cafe={cafe} />
        {cafe.editable && (cafe.kind === "cafe" || cafe.kind === "lobby") && (
          <NameForm
            id="cafe-title"
            label={t("Назва кафе", "Café name")}
            value={cafe.interior.title ?? ""}
            max={TITLE_MAX}
            placeholder={t(`${BRAND}, або назва команди`, `${BRAND}, or your team's name`)}
            done={t("Готово, назва вже на вивісці й на даху.", "Done, the name is on the sign and the roof now.")}
            onSave={(v) => cafe.setNames({ title: v || undefined })}
          />
        )}
        {cafe.editable && <PetPicker cafe={cafe} />}
        {cafe.editable && (
          <NameForm
            id="cat-name"
            label={dog ? t("Ім'я песика", "Dog's name") : t("Ім'я кота", "Cat's name")}
            value={cafe.settings.cat_name ?? ""}
            max={24}
            placeholder={dog ? t("песик без імені", "nameless dog") : t("рудий кіт без імені", "nameless ginger cat")}
            done={t(
              `Готово, ім'я вже над ${dog ? "песиком" : "котом"}.`,
              `Done, the name is above the ${dog ? "dog" : "cat"} now.`,
            )}
            onSave={(v) => cafe.save({ cat_name: v || null })}
          />
        )}
        {cafe.editable && agents.length > 0 && <AgentLooks cafe={cafe} agents={agents} seed={seed} />}
      </section>
    </Sheet>
  );
}
