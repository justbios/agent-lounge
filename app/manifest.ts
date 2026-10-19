import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Agent Lounge — your Claude Code agents, live",
    short_name: "Agent Lounge",
    description: "Your Claude Code agents, live, in a pixel café",
    start_url: "/",
    display: "standalone",
    background_color: "#06070c",
    theme_color: "#06070c",
    lang: "en",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
