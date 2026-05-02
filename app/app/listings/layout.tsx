import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { I18nProviderShell } from "@/components/i18n/provider-shell";

export const dynamic = "force-dynamic";

export default function ListingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <I18nProviderShell>
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </I18nProviderShell>
  );
}
