"use client";

import { Inbox, Search, ClipboardCheck, Network, Code, Eye, FlaskConical, Rocket, Bot, Cpu } from "lucide-react";
import { Ui, tr, useUi } from "@/lib/i18n";
import { IconKey } from "@/lib/types";
import { MockRun } from "@/lib/mockRun";
import { getStageState, NodeState } from "@/lib/stage";

const ICONS: Record<IconKey, React.ComponentType<{ size?: number }>> = {
  inbox: Inbox,
  search: Search,
  clipboard: ClipboardCheck,
  network: Network,
  code: Code,
  eye: Eye,
  flask: FlaskConical,
  rocket: Rocket,
  bot: Bot,
  cpu: Cpu,
};

function badge(state: NodeState, ui: Ui) {
  if (state === "active") return { cls: "rr-active", text: tr(ui, "працює", "working") };
  if (state === "incoming") return { cls: "rr-active", text: tr(ui, "приймає", "receiving") };
  if (state === "done") return { cls: "rr-done", text: tr(ui, "готово", "done") };
  return { cls: "rr-idle", text: tr(ui, "очікує", "waiting") };
}

export default function AgentRoster({ run, clock }: { run: MockRun; clock: number }) {
  const ui = useUi();
  const st = getStageState(clock, run);
  return (
    <div className="card">
      <div className="card-hd">
        <span className="card-ttl">{tr(ui, "агенти", "agents")}</span>
        <span className="muted-sm">{tr(ui, `${run.agents.length} у пайплайні`, `${run.agents.length} in the pipeline`)}</span>
      </div>
      <div className="roster">
        {run.agents.map((a, i) => {
          const Icon = ICONS[a.icon] ?? Bot;
          const b = badge(st.nodeStates[i], ui);
          return (
            <div className="rr" key={a.id} style={{ ["--c" as string]: a.color } as React.CSSProperties}>
              <span className="rr-ic">
                <Icon size={15} />
              </span>
              <div className="rr-main">
                <div className="rr-nm">{a.name}</div>
                <div className="rr-rl">{a.role}</div>
              </div>
              <span className={`rr-badge ${b.cls}`}>{b.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
