import { serverSupabase } from "@/lib/serverSupabase";

const TYPES = new Set(["start", "thinking", "tool_call", "handoff", "complete", "error"]);

/**
 * Ingest one agent event. Called by the user's Claude Code hook / SDK / MCP.
 *
 *   POST /api/ingest
 *   headers: { "x-relay-token": "<ingest_token>" }
 *   body: { run, agent, type, role?, name?, color?, order?, to?, label?, tool?, tokens? }
 */
export async function POST(req: Request) {
  const sb = serverSupabase();
  if (!sb) {
    return Response.json({ error: "supabase_not_configured" }, { status: 501 });
  }

  const token = req.headers.get("x-relay-token") ?? "";
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }

  const runLabel = String(body.run ?? "default");
  const agent = String(body.agent ?? "").trim();
  const type = String(body.type ?? "");
  if (!agent || !TYPES.has(type)) {
    return Response.json({ error: "agent + valid type required" }, { status: 400 });
  }

  const { data: project } = await sb
    .from("relay_projects")
    .select("id")
    .eq("ingest_token", token)
    .maybeSingle();
  if (!project) return Response.json({ error: "invalid_token" }, { status: 401 });

  // resolve (or open) the run
  let runId: string;
  const { data: existing } = await sb
    .from("agent_runs")
    .select("id")
    .eq("project_id", project.id)
    .eq("label", runLabel)
    .maybeSingle();
  if (existing) {
    runId = existing.id;
  } else {
    const { data: created, error } = await sb
      .from("agent_runs")
      .insert({ project_id: project.id, label: runLabel, status: "running" })
      .select("id")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    runId = created.id;
  }

  const { data: last } = await sb
    .from("agent_events")
    .select("seq")
    .eq("run_id", runId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  const seq = (last?.seq ?? -1) + 1;

  const { error: insErr } = await sb.from("agent_events").insert({
    project_id: project.id,
    run_id: runId,
    seq,
    agent_id: agent,
    agent_name: body.name ?? agent,
    agent_role: body.role ?? null,
    agent_color: body.color ?? null,
    agent_order: body.order ?? null,
    type,
    from_agent: type === "handoff" ? agent : null,
    to_agent: body.to ?? null,
    payload: { label: body.label ?? null, tool: body.tool ?? null, tokens: body.tokens ?? null },
  });
  if (insErr) return Response.json({ error: insErr.message }, { status: 500 });

  return Response.json({ ok: true, run_id: runId, seq }, { status: 200 });
}
