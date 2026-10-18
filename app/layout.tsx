import type { Metadata, Viewport } from "next";
import { Pixelify_Sans } from "next/font/google";
import "./globals.css";
import "./pixel.css";

const pixel = Pixelify_Sans({ subsets: ["latin", "cyrillic"], variable: "--font-pixel" });

export const metadata: Metadata = {
  title: "Agent Lounge — живий конвеєр агентів",
  description: "Візуалізація мультиагентного пайплайну в реальному часі",
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
    <html lang="uk" className={pixel.variable}>
      <body>{children}</body>
    </html>
  );
}
