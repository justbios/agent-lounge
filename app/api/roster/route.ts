import { projectRoster } from "@/lib/live/roster";
import { localRequest } from "@/lib/live/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!localRequest(req)) return new Response(null, { status: 404 });
  const cwd = new URL(req.url).searchParams.get("cwd");
  if (!cwd || !cwd.startsWith("/")) return Response.json({ agents: [] });
  return Response.json({ agents: await projectRoster(cwd) });
}
