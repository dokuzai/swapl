import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
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
  title: "swapl — trade your home for someone else's",
  description:
    "Home swap marketplace. List your place, browse thousands of homes, swap keys for keys. Every stay insured, end to end.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  openGraph: {
    title: "swapl",
    description: "Home swap marketplace — keys for keys, no money, fully insured.",
    siteName: "swapl",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
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
      </body>
    </html>
  );
}
