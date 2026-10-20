import { CafeModel } from "@/lib/cafe/model";
import { AgentView } from "@/lib/cafe/timeline";
import { useTr, useUi } from "@/lib/i18n";
import { Eta, etaText } from "@/lib/live/eta";
import { line, said, useSpeech } from "@/lib/live/speech";
import { SceneAlert } from "../cafe/CafeScene";
import { badge } from "./format";

export default function AgentList({
  model,
  views,
  clock,
  alert,
  etas,
  rosterCount,
  title,
  askText,
}: {
  model: CafeModel;
  views: AgentView[];
  clock: number;
  alert?: SceneAlert;
  /** per desk: the guess of the time its job has left */
  etas?: (Eta | null)[];
  rosterCount: number;
  title?: string;
  askText?: string;
}) {
  const sp = useSpeech();
  const t = useTr();
  const ui = useUi();
  return (
    <div className="card">
      <div className="card-hd">
        <span className="card-ttl">{title ?? t("агенти", "agents")}</span>
        <span className="muted-sm">
          {model.agents.length} {t("за столами", "at desks")}
          {rosterCount ? ` · ${rosterCount} ${t("з .claude/agents", "in .claude/agents")}` : ""}
        </span>
      </div>
      <div className="roster">
        {model.agents.map((a, i) => {
          const v = views[i];
          const b =
            alert?.kind === "ask" && alert.agent === i
              ? { cls: "rr-ask", text: askText ?? said("b_ask", sp, t("чекає на тебе", "waiting for you")) }
              : badge(v, !!v.walker?.carrying || (v.walker?.give ?? -1) >= 0, sp);
          let last = "";
          for (const n of model.notes[i]) {
            if (n.ts > clock) break;
            last = line(n, sp);
          }
          const left = etas?.[i] ? etaText(etas[i], ui) : "";
          return (
            <div className="rr" key={a.id} style={{ ["--c" as string]: a.color } as React.CSSProperties}>
              <span className="rr-ic" style={{ fontSize: 12, fontWeight: 600 }}>
                {a.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="rr-main">
                <div className="rr-nm">
                  {a.name}
                  {left && <span className="rr-eta">{left}</span>}
                </div>
                <div className="rr-note">{last || a.role}</div>
              </div>
              <span className={`rr-badge ${b.cls}`}>{b.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
