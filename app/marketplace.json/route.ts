import pack from "@/lib/live/pluginPack.json";

export const dynamic = "force-dynamic";

/** A Claude Code marketplace served by the site itself: `/plugin marketplace add <site>/marketplace.json`. */
export function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return Response.json({
    name: "relay",
    owner: { name: "justbios" },
    description: "Relay: your Claude Code agents live in a pixel café.",
    plugins: [
      {
        name: "relay",
        description: "Seats your Claude Code agents in the Relay pixel café, live.",
        source: { source: "archive", url: `${origin}/relay-plugin.zip`, sha256: pack.sha256 },
      },
    ],
  });
}
