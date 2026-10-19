"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Two, Ui, enPlural, tr, useTr, useUi } from "@/lib/i18n";
import {
  BEANS_FROM,
  BEAN_RULES,
  ItemDef,
  ItemId,
  ItemPlace,
  SHOP,
  SIGN_MAX,
  inStock,
  itemName,
} from "@/lib/live/interior";
import { CafeState } from "@/lib/live/useCafe";
import { drawItem } from "../cafe/furniture";
import { plural } from "./format";
import { fmtTokens } from "./tokens";

const PAD = 2;

const WHERE: Record<ItemPlace, Two> = {
  sill: { uk: "на підвіконня", en: "for the windowsill" },
  wall: { uk: "на стіну", en: "for the wall" },
  floor: { uk: "на підлогу", en: "for the floor" },
  rug: { uk: "на підлогу, під ноги", en: "for the floor, underfoot" },
  perk: { uk: "один на кафе", en: "one per café" },
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

const locale = (ui: Ui) => (ui === "en" ? "en-GB" : "uk-UA");

export const beans = (n: number, ui: Ui) =>
  tr(
    ui,
    `${n.toLocaleString("uk-UA")} ${plural(n, "зернина", "зернини", "зерен")}`,
    `${n.toLocaleString("en-GB")} ${enPlural(n, "bean", "beans")}`,
  );

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
  const t = useTr();
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
        {note === "ok" ? t("готово", "done") : t("зберегти", "save")}
      </button>
      {note === "bad" && <span className="key-paste-bad">{t("не вдалося", "failed")}</span>}
    </form>
  );
}

/** Furniture for coffee beans: buy a piece, then put it down in the café. */
export default function Shop({ cafe, onPlace }: { cafe: CafeState; onPlace: (item: ItemId) => void }) {
  const ui = useUi();
  const t = useTr();
  const [busy, setBusy] = useState<ItemId | null>(null);
  const [bad, setBad] = useState(false);
  const stock = inStock(cafe.interior);
  const room = cafe.kind === "mine" || cafe.kind === "theirs";
  const per = room ? t("кімнату", "room") : t("кафе", "café");
  const here = room ? t("кімнаті", "the room") : t("кафе", "the café");
  const keeper =
    cafe.kind === "theirs"
      ? cafe.whose
      : cafe.kind === "lobby"
        ? t("команда", "The team")
        : t("власник кафе", "The café owner");
  const r = BEAN_RULES;
  const since = new Date(BEANS_FROM).toLocaleString(locale(ui), {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  const buy = async (id: ItemId) => {
    setBusy(id);
    setBad(false);
    const ok = await cafe.buy(id);
    setBusy(null);
    setBad(!ok);
  };

  const row = (it: ItemDef) => {
    const have = stock.get(it.id) ?? 0;
    const perk = it.place === "perk";
    const got = (perk || !!it.rare) && cafe.interior.owned.includes(it.id);
    const where = perk ? t(`один на ${per}`, `one per ${per}`) : WHERE[it.place][ui];
    return (
      <li key={it.id} className={`shop-item ${it.rare ? "rare" : ""}`}>
        <Preview it={it} />
        <div className="shop-body">
          <b>{itemName(it, ui)}</b>
          <span className="muted-sm">
            {where} · ☕ {it.price.toLocaleString(locale(ui))}
          </span>
          {cafe.editable && (!got || (!perk && have > 0)) && (
            <div className="shop-acts">
              {!got && (
                <button
                  className="btn"
                  disabled={cafe.beans.left < it.price || busy != null}
                  onClick={() => void buy(it.id)}
                >
                  {busy === it.id ? t("купую…", "buying…") : t("купити", "buy")}
                </button>
              )}
              {!perk && have > 0 && (
                <button className="btn" onClick={() => onPlace(it.id)}>
                  {t("поставити", "place")}
                  {have > 1 ? ` (${have})` : ""}
                </button>
              )}
            </div>
          )}
          {cafe.editable && got && it.id === "neon" && (
            <NameField
              label={t("напис на вивісці", "sign text")}
              value={cafe.interior.sign ?? ""}
              max={SIGN_MAX}
              placeholder={t("інтернет-кафе", "internet café")}
              onSave={(sign) => cafe.setNames({ sign })}
            />
          )}
          {cafe.editable && got && it.id === "cat2" && (
            <NameField
              label={t("ім'я другого кота", "second cat's name")}
              value={cafe.interior.cat2Name ?? ""}
              max={24}
              placeholder={t("сірий кіт без імені", "nameless grey cat")}
              onSave={(cat2Name) => cafe.setNames({ cat2Name })}
            />
          )}
          {got && (!cafe.editable || (!perk && have === 0)) && (
            <span className="muted-sm">{t(`уже в ${here}`, `already in ${here}`)}</span>
          )}
        </div>
      </li>
    );
  };

  return (
    <section className="shop">
      {ui === "en" ? (
        <p className="alerts-hint">
          The bean count started over on {since}: only work since then earns beans, and anything bought before stays in
          the café. Claude&apos;s work earns coffee beans: a bean for every {r.outPerBean.toLocaleString("en-GB")}{" "}
          tokens Claude and the agents write, {r.dispatch} per handoff to an agent, {r.crowdedHour} for an hour when at
          least {r.crowd} different agents worked, {r.firstOfDay} for the first question of the day, and every
          achievement pays another 50 to 300. Achievements unlock themes and records.
          {cafe.editable
            ? " Anything placed, earned decor included, can be dragged or clicked to move it or put it away."
            : ` ${keeper} buys and places things here.`}
        </p>
      ) : (
        <p className="alerts-hint">
          Рахунок зерен почався заново {since}: їх дає лише робота відтоді, а куплене раніше лишилось у кафе. Кавові
          зерна дає робота Claude: зернина за кожні {fmtTokens(r.outPerBean)} токенів, які написали Claude й
          агенти, {r.dispatch} за доручення агенту, {r.crowdedHour} за годину, коли працювали щонайменше {r.crowd}{" "}
          різні агенти, {r.firstOfDay} за перше питання дня, а кожне досягнення ще від 50 до 300. Теми й платівки
          відкривають досягнення.
          {cafe.editable
            ? " Поставлене, і зароблений декор теж, можна перетягнути або клацнути, щоб перемістити чи прибрати."
            : ` Купує й ставить ${keeper}.`}
        </p>
      )}
      {bad && <p className="key-paste-bad">{t("Не вдалося купити, спробуй ще раз.", "Couldn't buy it, try again.")}</p>}
      <ul className="shop-grid">{SHOP.filter((it) => !it.rare).map(row)}</ul>
      <h3 className="shop-rare-hd">{t(`✦ Рідкісне: по одному на ${per}`, `✦ Rare: one per ${per}`)}</h3>
      <ul className="shop-grid">{SHOP.filter((it) => it.rare).map(row)}</ul>
    </section>
  );
}
