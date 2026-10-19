import type { Metadata, Viewport } from "next";
import { Pixelify_Sans } from "next/font/google";
import "./globals.css";
import "./pixel.css";
import { HtmlLang } from "@/lib/i18n";

const pixel = Pixelify_Sans({ subsets: ["latin", "cyrillic"], variable: "--font-pixel" });

export const metadata: Metadata = {
  title: "Agent Lounge — your Claude Code agents, live",
  description: "Watch your Claude Code agents work in a pixel café, live",
  appleWebApp: { capable: true, title: "Agent Lounge", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#06070c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={pixel.variable}>
      <body>
        <HtmlLang />
        {children}
      </body>
    </html>
  );
}
