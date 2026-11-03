import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { BRAND } from "@/lib/brand";

const font = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

export const metadata: Metadata = {
  title: { default: `${BRAND.name} | Online appointment booking`, template: `%s | ${BRAND.name}` },
  description: BRAND.description,
  openGraph: {
    title: `${BRAND.name} | Online appointment booking`,
    description: BRAND.description,
    type: "website",
  },
};

export const viewport: Viewport = { themeColor: "#1b7d76" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={font.variable}>
      <body className="bg-canvas font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
