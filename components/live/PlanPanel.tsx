"use client";

import { useState } from "react";
import { Redo2, Undo2 } from "lucide-react";
import { pickedLook } from "@/components/cafe/people";
import { Placed, inStock, itemOf, newPid } from "@/lib/live/interior";
import { PACKS, Pack, fitPlan, planCode, readPlan, undress, wearPack } from "@/lib/live/plan";
import { ArrangeHistory } from "@/lib/live/useArrangeHistory";
import { CafeState } from "@/lib/live/useCafe";
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

function Pieces({ cafe, onMove }: { cafe: CafeState; onMove: (p: Placed) => void }) {
  const stock = [...inStock(cafe.interior)].filter(([, n]) => n > 0);
  if (!cafe.interior.placed.length && !stock.length) {
    return <p className="alerts-hint">У кімнаті ще немає речей з магазину.</p>;
  }
  return (
    <ul className="plan-list">
      {cafe.interior.placed.map((p) => (
        <li key={p.pid}>
          <span>{itemOf(p.item)?.name ?? p.item}</span>
          <button className="btn" onClick={() => onMove(p)}>
            перемістити
          </button>
          <button className="btn" onClick={() => void cafe.stow(p.pid)}>
            {itemOf(p.item)?.decor ? "на своє місце" : "прибрати"}
          </button>
        </li>
      ))}
      {stock.map(([item, n]) => (
        <li key={item}>
          <span>
            {itemOf(item)?.name ?? item} <span className="muted-sm">· у запасі {n}</span>
          </span>
          <button className="btn" onClick={() => onMove({ pid: newPid(), item, x: 0, y: 0 })}>
            поставити
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
  agents: string[];
  history: ArrangeHistory;
  onMove: (p: Placed) => void;
  onClose: () => void;
}) {
  const [paste, setPaste] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const { placed, looks } = cafe.interior;
  const dress = (next: typeof looks) => void cafe.arrange({ placed, looks: next });

  const apply = async () => {
    const plan = readPlan(paste);
    if (!plan) return setNote("Це не код плану Agent Lounge: він починається з relay-plan:1:");
    const { next, missing } = fitPlan(cafe.interior, plan);
    const ok = await cafe.arrange({ placed: next.placed, looks: next.looks });
    if (!ok) return setNote("Не вдалося зберегти план, спробуй ще раз.");
    setPaste("");
    const left = `Не стали ${missing.length}: ${missing.join(", ")}. Їх немає в цій кімнаті, вони є в магазині.`;
    setNote(missing.length ? `Готово. ${left}` : "Готово: план застосовано.");
  };

  return (
    <Sheet label="план кафе" title="План кафе" sub="розстановка, вбрання агентів і код плану" onClose={onClose}>
      <div className="plan-undo">
        <button className="btn" disabled={!history.canUndo} onClick={() => void history.undo()}>
          <Undo2 size={14} /> назад
        </button>
        <button className="btn" disabled={!history.canRedo} onClick={() => void history.redo()}>
          <Redo2 size={14} /> вперед
        </button>
        <span className="muted-sm">
          Крок назад скасовує будь-яку зміну розстановки чи вбрання, навіть зроблену на сцені.
        </span>
      </div>

      <div className="share-ttl">Речі</div>
      <Pieces cafe={cafe} onMove={onMove} />

      <div className="share-ttl">Паки персонажів</div>
      <p className="alerts-hint">
        Пак одягає всіх агентів цієї кімнати по черзі. Колір шкіри й імена на табличках лишаються їхні.
      </p>
      <div className="plan-packs">
        {PACKS.map((p) => (
          <div key={p.id} className="plan-pack">
            <Swatches pack={p} />
            <b>{p.name}</b>
            <span className="muted-sm">{p.hint}</span>
            <button className="btn" disabled={!agents.length} onClick={() => dress(wearPack(looks, agents, p))}>
              одягнути
            </button>
          </div>
        ))}
      </div>
      <button className="btn" disabled={!agents.length} onClick={() => dress(undress(looks, agents))}>
        зняти вбрання
      </button>

      <div className="share-ttl">Код плану</div>
      <p className="alerts-hint">
        Уся розстановка й вбрання одним рядком. Встав його в іншому кафе чи збережи, щоб повернути цей вигляд пізніше.
        Стануть лише ті речі, які там уже куплені.
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
          aria-label="код плану"
        />
        <button className="btn" disabled={!paste.trim()} onClick={() => void apply()}>
          застосувати
        </button>
      </div>
      {note && <p className="alerts-hint">{note}</p>}
    </Sheet>
  );
}
