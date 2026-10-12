import { randomBytes } from "node:crypto";
import { serverSupabase } from "@/lib/serverSupabase";

/** Creates a new Relay project and returns its slug + ingest token (shown once). */
export async function POST(req: Request) {
  const sb = serverSupabase();
  if (!sb) {
    return Response.json(
      { error: "supabase_not_configured", hint: "Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to go live." },
      { status: 501 },
    );
  }
  let name = "My pipeline";
  try {
    const body = await req.json();
    if (typeof body?.name === "string" && body.name.trim()) name = body.name.trim().slice(0, 60);
  } catch {
    // no body — fine
  }
  const slug = randomBytes(5).toString("hex");
  const { data, error } = await sb
    .from("relay_projects")
    .insert({ slug, name })
    .select("id, slug, name, ingest_token")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
