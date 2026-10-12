import type { Metadata } from "next";
import { Pixelify_Sans } from "next/font/google";
import "./globals.css";

const pixel = Pixelify_Sans({ subsets: ["latin", "cyrillic"], variable: "--font-pixel" });

export const metadata: Metadata = {
  title: "Relay — живий конвеєр агентів",
  description: "Візуалізація мультиагентного пайплайну в реальному часі",
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
