import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { cn } from "@/lib/utils";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "swapl — home swapping for September 2026",
    template: "%s · swapl",
  },
  description:
    "List your home before the September 2026 launch. swapl is a home swap marketplace for trading keys for keys, with no nightly rates and every accepted stay insured.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  applicationName: "swapl",
  alternates: { canonical: "/" },
  keywords: [
    "home exchange",
    "home swap",
    "house swapping",
    "apartment swap",
    "swap homes",
    "insured home exchange",
    "travel without hotels",
    "September 2026 launch",
  ],
  openGraph: {
    title: "swapl — home swapping for September 2026",
    description: "List before launch to join the first homes surfaced for insured, money-free swaps.",
    siteName: "swapl",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "swapl — home swapping for September 2026",
    description: "List your home before swaps go live in September 2026.",
  },
};

// Root layout is intentionally pure-static — no cookies(), no headers(), no
// async fetch. Per-section layouts wrap their children in <I18nProviderShell>
// so /_global-error can prerender without crashing on a missing workStore.
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full antialiased",
        fraunces.variable,
        inter.variable,
        jetbrains.variable
      )}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
