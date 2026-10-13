import { CafeModel } from "@/lib/cafe/model";
import { AgentView } from "@/lib/cafe/timeline";
import { SceneAlert } from "../cafe/CafeScene";
import { badge } from "./format";

export default function AgentList({
  model,
  views,
  clock,
  alert,
  rosterCount,
  title = "агенти",
  askText = "чекає на тебе",
}: {
  model: CafeModel;
  views: AgentView[];
  clock: number;
  alert?: SceneAlert;
  rosterCount: number;
  title?: string;
  askText?: string;
}) {
  return (
    <div className="card">
      <div className="card-hd">
        <span className="card-ttl">{title}</span>
        <span className="muted-sm">
          {model.agents.length} за столами{rosterCount ? ` · ${rosterCount} з .claude/agents` : ""}
        </span>
      </div>
      <div className="roster">
        {model.agents.map((a, i) => {
          const v = views[i];
          const b =
            alert?.kind === "ask" && alert.agent === i
              ? { cls: "rr-ask", text: askText }
              : badge(v, !!v.walker?.carrying || (v.walker?.give ?? -1) >= 0);
          let last = "";
          for (const n of model.notes[i]) {
            if (n.ts > clock) break;
            last = n.text;
          }
          return (
            <div className="rr" key={a.id} style={{ ["--c" as string]: a.color } as React.CSSProperties}>
              <span className="rr-ic" style={{ fontSize: 12, fontWeight: 600 }}>
                {a.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="rr-main">
                <div className="rr-nm">{a.name}</div>
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
