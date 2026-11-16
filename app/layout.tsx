import type { Metadata, Viewport } from "next";
import { Golos_Text, JetBrains_Mono, Tiny5 } from "next/font/google";
import "./globals.css";
import "./pixel.css";
import { HtmlLang } from "@/lib/i18n";

const pixel = Tiny5({ weight: "400", subsets: ["latin", "cyrillic"], variable: "--font-pixel" });
// Tiny5 for titles and numbers: Pixelify Sans drew Cyrillic «д» like «а» («піасумок»)
const body = Golos_Text({ subsets: ["latin", "cyrillic"], variable: "--font-body" });
const code = JetBrains_Mono({ subsets: ["latin", "cyrillic"], variable: "--font-code" });

export const metadata: Metadata = {
  title: "Agent Lounge — your Claude Code agents, live",
  description: "Watch your Claude Code agents work in a pixel café, live",
  appleWebApp: { capable: true, title: "Agent Lounge", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#120e1c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${pixel.variable} ${body.variable} ${code.variable}`}>
      <body>
        <HtmlLang />
        {children}
      </body>
    </html>
  );
}
