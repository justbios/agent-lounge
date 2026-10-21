"use client";

import { LookRow } from "@/components/cafe/AgentCard";
import AgentSprite from "@/components/cafe/AgentSprite";
import { propIndex } from "@/components/cafe/desk";
import { lookFor, pickedLook } from "@/components/cafe/people";
import { useTr } from "@/lib/i18n";
import { agentName, lookKey, lookOf } from "@/lib/live/interior";
import { CafeState } from "@/lib/live/useCafe";
import type { AgentDef } from "@/lib/types";

/**
 * Every agent of the chat on screen, to name and dress in one place. The name and look stay with the agent's type, so
 * a bug-fixer looks the same at any desk and in every chat; a second one working at once wears the same, with a 2.
 */
export default function AgentLooks({ cafe, agents, seed }: { cafe: CafeState; agents: AgentDef[]; seed: number }) {
  const t = useTr();
  const looks = cafe.interior.looks;
  const seen = new Set<string>();
  const rows = agents.flatMap((a, i) => {
    const k = lookKey(a);
    if (seen.has(k)) return [];
    seen.add(k);
    return [{ a, i, pick: lookOf(looks, a) }];
  });
  return (
    <div className="agent-looks">
      <span className="theme-pick-ttl">{t("Агенти", "Agents")}</span>
      <span className="alerts-hint">
        {t(
          "Ім'я на табличці й вигляд тримаються самого агента, хоч за яким він столом і в якому чаті.",
          "The name on the desk plate and the look stay with the agent itself, whatever desk or chat it's in.",
        )}
      </span>
      {rows.map(({ a, i, pick }) => {
        const base = a.look ?? i;
        const name = agentName(a, pick);
        return (
          <div key={lookKey(a)} className="agent-look">
            <AgentSprite look={lookFor(base, a.color, pickedLook(pick, base))} label={name} />
            <div className="agent-look-main">
              <span className="agent-look-name">
                <b style={{ color: a.color }}>{name}</b>
                {pick?.name && <span className="muted-sm">{a.name}</span>}
              </span>
              <LookRow
                base={base}
                desk={propIndex(seed, i)}
                color={a.color}
                pick={pick}
                onLook={(p) => void cafe.setLook(a, p)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
