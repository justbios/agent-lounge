import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="uk">
      <body>{children}</body>
    </html>
  );
}
