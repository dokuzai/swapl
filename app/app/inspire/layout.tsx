import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { I18nProviderShell } from "@/components/i18n/provider-shell";

export const dynamic = "force-dynamic";

// NOTE: the auth gate lives in page.tsx, not here — layouts can't read
// searchParams, and the login redirect must preserve ?package & ?step
// (the deep link the mobile apps open to save a card, DOK-148).
export default async function InspireLayout({ children }: { children: React.ReactNode }) {
  return (
    <I18nProviderShell>
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </I18nProviderShell>
  );
}
