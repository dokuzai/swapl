import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { LocaleProvider } from "@/lib/i18n/client";
import { getI18n } from "@/lib/i18n/server";

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
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  openGraph: {
    title: "swapl",
    description: "Home swap marketplace — keys for keys, no money, fully insured.",
    siteName: "swapl",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

// Force-dynamic so getLocale() can read cookies + Accept-Language on every
// request. Locale detection happens once at the root and the resolved
// dictionary is handed to the client through context.
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { locale, dict } = await getI18n();
  return (
    <html
      lang={locale}
      className={cn(
        "h-full antialiased",
        fraunces.variable,
        inter.variable,
        jetbrains.variable
      )}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <LocaleProvider locale={locale} dict={dict}>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
