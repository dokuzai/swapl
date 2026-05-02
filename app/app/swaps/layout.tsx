import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { I18nProviderShell } from "@/components/i18n/provider-shell";

export const dynamic = "force-dynamic";

export default async function SwapsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login?next=/swaps");
  return (
    <I18nProviderShell>
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </I18nProviderShell>
  );
}
