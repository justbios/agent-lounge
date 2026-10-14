import { LiveEvent } from "./types";

export interface CallNode {
  /** the event that made the node: a tool call, a failure, a handoff, a notice or the answer */
  e: LiveEvent;
  /** how long until the same agent did its next thing, or until the subagent stopped */
  ms: number | null;
  /** handoffs only: the subagent that took the work, once it started */
  agent?: string;
  agentType?: string;
  /** handoffs only: what the subagent did */
  calls?: CallNode[];
  /** handoffs only: the subagent has stopped */
  done?: boolean;
}

export interface Turn {
  /** the question that began it; absent for what came before the first one in the log */
  prompt: LiveEvent | null;
  calls: CallNode[];
  /** Claude answered and the turn is over */
  answered: boolean;
}

const SHOWN: LiveEvent["kind"][] = ["tool", "fail", "dispatch", "notify", "stop"];

/**
 * One chat's log as a tree: each question, what Claude did for it, every handoff with what its subagent did in turn,
 * nested as deep as subagents hand work on. A subagent is matched to the oldest handoff of its type still unclaimed.
 */
export function callTree(events: LiveEvent[]): Turn[] {
  const turns: Turn[] = [];
  const nodeOf = new Map<string, CallNode>();
  const open: CallNode[] = [];
  const last = new Map<string, CallNode>();
  let turn: Turn | null = null;

  const here = (): Turn => {
    if (!turn) {
      turn = { prompt: null, calls: [], answered: false };
      turns.push(turn);
    }
    return turn;
  };
  const listOf = (agent: string | undefined, agentType: string | undefined): CallNode[] => {
    if (!agent) return here().calls;
    let n = nodeOf.get(agent);
    if (!n) {
      const e: LiveEvent = { seq: -1, at: 0, session: "", kind: "dispatch", target: agentType };
      n = { e, ms: null, agent, agentType, calls: [] };
      nodeOf.set(agent, n);
      here().calls.push(n);
    }
    return n.calls!;
  };
  const settle = (who: string, at: number) => {
    const prev = last.get(who);
    if (prev && prev.ms == null && !prev.calls) prev.ms = at - prev.e.at;
  };

  for (const e of events) {
    const who = e.agent ?? "";
    if (e.kind === "prompt") {
      settle("", e.at);
      turn = { prompt: e, calls: [], answered: false };
      turns.push(turn);
      continue;
    }
    if (e.kind === "sub_start" && e.agent) {
      const i = open.findIndex((d) => d.e.target === e.agentType);
      const d = i >= 0 ? open.splice(i, 1)[0] : null;
      if (d) {
        d.agent = e.agent;
        d.agentType = e.agentType;
        d.ms = null;
        nodeOf.set(e.agent, d);
      } else {
        listOf(e.agent, e.agentType);
      }
      continue;
    }
    if (e.kind === "sub_stop" && e.agent) {
      settle(e.agent, e.at);
      const n = nodeOf.get(e.agent);
      if (n) {
        n.done = true;
        n.ms = e.at - n.e.at;
      }
      continue;
    }
    if (!SHOWN.includes(e.kind)) continue;
    settle(who, e.at);
    const node: CallNode = { e, ms: null };
    if (e.kind === "dispatch") {
      node.calls = [];
      open.push(node);
    }
    listOf(e.agent, e.agentType).push(node);
    last.set(who, node);
    if (e.kind === "stop" && !e.agent) {
      here().answered = true;
      last.delete("");
    }
  }
  return turns;
}

/** Every tool call and handoff under a node, its subagents' included; notices and answers are not actions. */
export const countCalls = (calls: CallNode[]): number =>
  calls.reduce((s, c) => {
    if (c.calls) return s + 1 + countCalls(c.calls);
    return s + (c.e.kind === "tool" || c.e.kind === "fail" ? 1 : 0);
  }, 0);
