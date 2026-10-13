import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Relay — живий конвеєр агентів",
    short_name: "Relay",
    description: "Твої агенти Claude Code наживо, у піксельному інтернет-кафе",
    start_url: "/",
    display: "standalone",
    background_color: "#06070c",
    theme_color: "#06070c",
    lang: "uk",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
