"use client";

import { Inbox, Search, ClipboardCheck, Network, Code, Eye, FlaskConical, Rocket, Bot, Cpu } from "lucide-react";
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

function badge(state: NodeState) {
  if (state === "active" || state === "incoming") return { cls: "rr-active", text: state === "active" ? "працює" : "приймає" };
  if (state === "done") return { cls: "rr-done", text: "готово" };
  return { cls: "rr-idle", text: "очікує" };
}

export default function AgentRoster({ run, clock }: { run: MockRun; clock: number }) {
  const st = getStageState(clock, run);
  return (
    <div className="card">
      <div className="card-hd">
        <span className="card-ttl">агенти</span>
        <span className="muted-sm">{run.agents.length} у пайплайні</span>
      </div>
      <div className="roster">
        {run.agents.map((a, i) => {
          const Icon = ICONS[a.icon] ?? Bot;
          const b = badge(st.nodeStates[i]);
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
