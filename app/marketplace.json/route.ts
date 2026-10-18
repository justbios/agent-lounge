import pack from "@/lib/live/pluginPack.json";

export const dynamic = "force-dynamic";

/** A Claude Code marketplace served by the site itself: `/plugin marketplace add <site>/marketplace.json`. */
export function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return Response.json({
    name: "agent-lounge",
    owner: { name: "justbios" },
    description: "Agent Lounge: your Claude Code agents live in a pixel café.",
    plugins: [
      {
        name: "agent-lounge",
        description: "Seats your Claude Code agents in the Agent Lounge pixel café, live.",
        source: { source: "archive", url: `${origin}/agent-lounge-plugin.zip`, sha256: pack.sha256 },
      },
    ],
  });
}
