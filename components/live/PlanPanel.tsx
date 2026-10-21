"use client";

import { useState } from "react";
import { Redo2, Undo2 } from "lucide-react";
import { pickedLook } from "@/components/cafe/people";
import { Ui, useTr, useUi } from "@/lib/i18n";
import { Placed, inStock, itemName, itemOf, newPid } from "@/lib/live/interior";
import { PACKS, Pack, fitPlan, planCode, readPlan, undress, wearPack } from "@/lib/live/plan";
import { ArrangeHistory } from "@/lib/live/useArrangeHistory";
import { CafeState } from "@/lib/live/useCafe";
import type { AgentDef } from "@/lib/types";
import Code from "../connect/Code";
import Sheet from "./Sheet";

function Swatches({ pack }: { pack: Pack }) {
  return (
    <span className="plan-swatches" aria-hidden>
      {pack.looks.map((l, i) => (
        <span key={i} style={{ background: pickedLook({ shirt: l.shirt, hair: l.hair }).shirt }} />
      ))}
    </span>
  );
}

/** A shop piece by its name, or by its id when the shop no longer sells it. */
function pieceName(item: string, ui: Ui): string {
  const it = itemOf(item);
  return it ? itemName(it, ui) : item;
}

function Pieces({ cafe, onMove }: { cafe: CafeState; onMove: (p: Placed) => void }) {
  const ui = useUi();
  const t = useTr();
  const stock = [...inStock(cafe.interior)].filter(([, n]) => n > 0);
  if (!cafe.interior.placed.length && !stock.length) {
    return <p className="alerts-hint">{t("У кімнаті ще немає речей з магазину.", "No shop items in the room yet.")}</p>;
  }
  return (
    <ul className="plan-list">
      {cafe.interior.placed.map((p) => (
        <li key={p.pid}>
          <span>{pieceName(p.item, ui)}</span>
          <button className="btn" onClick={() => onMove(p)}>
            {t("перемістити", "move")}
          </button>
          <button className="btn" onClick={() => void cafe.stow(p.pid)}>
            {itemOf(p.item)?.decor ? t("на своє місце", "put back") : t("прибрати", "put away")}
          </button>
        </li>
      ))}
      {stock.map(([item, n]) => (
        <li key={item}>
          <span>
            {pieceName(item, ui)} <span className="muted-sm">· {t(`у запасі ${n}`, `${n} in stock`)}</span>
          </span>
          <button className="btn" onClick={() => onMove({ pid: newPid(), item, x: 0, y: 0 })}>
            {t("поставити", "place")}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The keeper's plan of the room: every piece to move or put away, packs that dress all the agents at once, and the
 * whole plan as a line of text to take to another café or keep for later; every change can be stepped back.
 */
export default function PlanPanel({
  cafe,
  agents,
  history,
  onMove,
  onClose,
}: {
  cafe: CafeState;
  agents: Pick<AgentDef, "id" | "key">[];
  history: ArrangeHistory;
  onMove: (p: Placed) => void;
  onClose: () => void;
}) {
  const ui = useUi();
  const t = useTr();
  const [paste, setPaste] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const { placed, looks } = cafe.interior;
  const dress = (next: typeof looks) => void cafe.arrange({ placed, looks: next });

  const apply = async () => {
    const plan = readPlan(paste);
    if (!plan) {
      return setNote(
        t(
          "Це не код плану Agent Lounge: він починається з relay-plan:1:",
          "That's not an Agent Lounge plan code: it starts with relay-plan:1:",
        ),
      );
    }
    const { next, missing } = fitPlan(cafe.interior, plan);
    const ok = await cafe.arrange({ placed: next.placed, looks: next.looks });
    if (!ok) return setNote(t("Не вдалося зберегти план, спробуй ще раз.", "Couldn't save the plan, try again."));
    setPaste("");
    const names = missing.map((item) => pieceName(item, ui)).join(", ");
    const left = t(
      `Не стали ${missing.length}: ${names}. Їх немає в цій кімнаті, вони є в магазині.`,
      `${missing.length} not placed: ${names}. This room doesn't have them; they're in the shop.`,
    );
    setNote(
      missing.length ? t(`Готово. ${left}`, `Done. ${left}`) : t("Готово: план застосовано.", "Done: plan applied."),
    );
  };

  return (
    <Sheet
      label={t("план кафе", "café plan")}
      title={t("План кафе", "Café plan")}
      sub={t("розстановка, вбрання агентів і код плану", "layout, agents' outfits and the plan code")}
      onClose={onClose}
    >
      <div className="plan-undo">
        <button className="btn" disabled={!history.canUndo} onClick={() => void history.undo()}>
          <Undo2 size={14} /> {t("назад", "undo")}
        </button>
        <button className="btn" disabled={!history.canRedo} onClick={() => void history.redo()}>
          <Redo2 size={14} /> {t("вперед", "redo")}
        </button>
        <span className="muted-sm">
          {t(
            "Крок назад скасовує будь-яку зміну розстановки чи вбрання, навіть зроблену на сцені.",
            "Undo reverts any change to the layout or outfits, even one made right in the café.",
          )}
        </span>
      </div>

      <div className="share-ttl">{t("Речі", "Items")}</div>
      <Pieces cafe={cafe} onMove={onMove} />

      <div className="share-ttl">{t("Паки персонажів", "Character packs")}</div>
      <p className="alerts-hint">
        {t(
          "Пак одягає всіх агентів цієї кімнати по черзі. Колір шкіри й імена на табличках лишаються їхні.",
          "A pack dresses every agent in this room in turn. Skin tones and the names on their desk plates stay their own.",
        )}
      </p>
      <div className="plan-packs">
        {PACKS.map((p) => (
          <div key={p.id} className="plan-pack">
            <Swatches pack={p} />
            <b>{p.name[ui]}</b>
            <span className="muted-sm">{p.hint[ui]}</span>
            <button className="btn" disabled={!agents.length} onClick={() => dress(wearPack(looks, agents, p))}>
              {t("одягнути", "dress up")}
            </button>
          </div>
        ))}
      </div>
      <button className="btn" disabled={!agents.length} onClick={() => dress(undress(looks, agents))}>
        {t("зняти вбрання", "take off outfits")}
      </button>

      <div className="share-ttl">{t("Код плану", "Plan code")}</div>
      <p className="alerts-hint">
        {t(
          "Уся розстановка й вбрання одним рядком. Встав його в іншому кафе чи збережи, щоб повернути цей вигляд пізніше. Стануть лише ті речі, які там уже куплені.",
          "The whole layout and outfits in one line. Paste it into another café, or keep it to bring this look back later. Only items already bought there get placed.",
        )}
      </p>
      <Code text={planCode({ placed, looks })} wrap />
      <div className="plan-paste">
        <textarea
          value={paste}
          onChange={(e) => {
            setPaste(e.target.value);
            setNote(null);
          }}
          placeholder="relay-plan:1:…"
          rows={2}
          aria-label={t("код плану", "plan code")}
        />
        <button className="btn" disabled={!paste.trim()} onClick={() => void apply()}>
          {t("застосувати", "apply")}
        </button>
      </div>
      {note && <p className="alerts-hint">{note}</p>}
    </Sheet>
  );
}
