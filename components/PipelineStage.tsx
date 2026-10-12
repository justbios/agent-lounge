"use client";

import { useEffect, useRef, useState } from "react";
import { Inbox, Search, ClipboardCheck, Network, Code, Eye, FlaskConical, Rocket, Bot, Cpu, Package } from "lucide-react";
import { IconKey } from "@/lib/types";
import { MockRun } from "@/lib/mockRun";
import { STAGE_W, diagramLayout, getStageState, NodeState } from "@/lib/stage";
import { pathThrough } from "@/lib/layout";

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

function statusText(s: NodeState): string {
  if (s === "active") return "працює…";
  if (s === "incoming") return "приймає…";
  if (s === "done") return "готово";
  return "очікує";
}

export default function PipelineStage({ run, clock }: { run: MockRun; clock: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const layout = diagramLayout(run.agents.length);
  const stageH = layout.height;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setScale(entries[0].contentRect.width / STAGE_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const st = getStageState(clock, run);
  const progress = Math.min(clock / run.totalMs, 1);
  const colorIdx = st.travelFrom != null ? st.travelFrom : st.activeIndex >= 0 ? st.activeIndex : 0;
  const activeColor = run.agents[colorIdx].color;
  const trackD = pathThrough(layout.points);

  return (
    <div className="stage-wrap" ref={wrapRef} style={{ height: stageH * scale }}>
      <div className="stage" style={{ width: STAGE_W, height: stageH, transform: `scale(${scale})` }}>
        <svg className="track" width={STAGE_W} height={stageH} viewBox={`0 0 ${STAGE_W} ${stageH}`}>
          <path d={trackD} className="track-base" />
          <path d={trackD} className="track-flow" />
          <path
            d={trackD}
            className="track-prog"
            pathLength={1000}
            style={{ color: activeColor, stroke: activeColor, strokeDashoffset: 1000 * (1 - progress) }}
          />
        </svg>

        {run.agents.map((a, i) => {
          const Icon = ICONS[a.icon] ?? Bot;
          const state = st.nodeStates[i];
          const p = layout.points[i];
          return (
            <div
              key={a.id}
              className={`node ${state}`}
              style={{ left: p.x, top: p.y, ["--c" as string]: a.color } as React.CSSProperties}
            >
              <div className="node-top">
                <span className="node-ic">
                  <Icon size={17} />
                </span>
                <span className="node-nm">{a.name}</span>
              </div>
              <div className="node-rl">{a.role}</div>
              <div className="node-st">{statusText(state)}</div>
            </div>
          );
        })}

        <div
          className="packet"
          style={{ left: st.packet.x, top: st.packet.y, ["--c" as string]: activeColor } as React.CSSProperties}
        >
          <div className="packet-core">
            <Package size={19} />
          </div>
        </div>
      </div>
    </div>
  );
}
