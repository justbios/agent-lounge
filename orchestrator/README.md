# Orchestrator → live events

The frontend renders whatever lands in the `agent_events` table. To go from the
replay demo to a live pipeline, your orchestrator emits one event per lifecycle
moment. The shape is intentionally tiny: `start`, `thinking`, `tool_call`,
`handoff`, `complete`, `error`.

## The pattern

Wrap each agent step with `emit()` from [`emit.ts`](./emit.ts). The key event is
`handoff` — that's the packet flying from one agent to the next in the UI.

```ts
import { createEmitter, startRun, finishRun } from "./emit";
import { query } from "@anthropic-ai/claude-agent-sdk"; // SDK call shape depends on version

const PIPELINE = [
  { id: "intake",    role: "збирає запит",   prompt: "..." },
  { id: "research",  role: "шукає контекст", prompt: "..." },
  { id: "planner",   role: "будує план",     prompt: "..." },
  { id: "architect", role: "проектує",       prompt: "..." },
  { id: "coder",     role: "пише код",       prompt: "..." },
  { id: "reviewer",  role: "рев’ю коду",     prompt: "..." },
  { id: "tester",    role: "тестує",         prompt: "..." },
  { id: "deployer",  role: "деплой",         prompt: "..." },
];

async function run(brief: string) {
  const runId = await startRun("Blind Date · feature X");
  const emit = createEmitter(runId);

  let baton = brief; // the payload handed down the line

  for (let i = 0; i < PIPELINE.length; i++) {
    const agent = PIPELINE[i];
    await emit({ agentId: agent.id, agentRole: agent.role, type: "start" });

    // Stream the SDK run and forward interesting moments to the UI.
    let tokens = 0;
    for await (const msg of query({ prompt: `${agent.prompt}\n\n${baton}` })) {
      if (msg.type === "tool_use") {
        await emit({ agentId: agent.id, type: "tool_call", payload: { tool: msg.name } });
      }
      if (msg.type === "assistant") tokens += msg.usage?.output_tokens ?? 0;
      if (msg.type === "result") baton = msg.result;
    }

    await emit({ agentId: agent.id, type: "complete", payload: { tokens } });

    // Hand the packet to the next agent.
    const next = PIPELINE[i + 1];
    if (next) {
      await emit({
        agentId: agent.id,
        type: "handoff",
        fromAgent: agent.id,
        toAgent: next.id,
        payload: { label: `передає результат` },
      });
    }
  }

  await finishRun(runId, "done");
}
```

## Notes

- The exact Agent SDK call (`query` / streaming message types) depends on the SDK
  version — treat the loop above as the integration shape, not a frozen API. The
  only contract that matters for the UI is the `emit()` calls.
- If you already run agents through **Claude Code subagents**, you can emit the
  same events from hooks (`PreToolUse`, `SubagentStop`, …) instead of the SDK —
  the table and the frontend don't care where events come from.
- `handoff` events are what animate the packet. Emit one whenever control passes
  between agents (even fan-out: emit several handoffs from one source).
- Keep `seq` monotonic per run (the emitter does this for you) so replay ordering
  is stable.
