import { createClient } from "@supabase/supabase-js";

/**
 * Server-side event emitter. The orchestrator calls emit() at each point in an
 * agent's lifecycle; the frontend renders whatever lands in agent_events.
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (never expose the service role
 * key to the browser).
 */
const supabase = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
);

export type EmitType = "start" | "thinking" | "tool_call" | "handoff" | "complete" | "error";

export interface EmitInput {
  agentId: string;
  agentRole?: string;
  type: EmitType;
  fromAgent?: string;
  toAgent?: string;
  payload?: { label?: string; summary?: string; tool?: string; tokens?: number };
}

/** Returns a bound emitter with a monotonic seq counter for one run. */
export function createEmitter(runId: string) {
  let seq = 0;
  return async function emit(e: EmitInput): Promise<void> {
    await supabase.from("agent_events").insert({
      run_id: runId,
      seq: seq++,
      agent_id: e.agentId,
      agent_role: e.agentRole,
      type: e.type,
      from_agent: e.fromAgent,
      to_agent: e.toAgent,
      payload: e.payload ?? {},
    });
  };
}

export async function startRun(label: string): Promise<string> {
  const { data, error } = await supabase
    .from("agent_runs")
    .insert({ label, status: "running" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function finishRun(runId: string, status: "done" | "error" = "done"): Promise<void> {
  await supabase.from("agent_runs").update({ status, finished_at: new Date().toISOString() }).eq("id", runId);
}
