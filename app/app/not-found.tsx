import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { getI18n, t } from "@/lib/i18n/server";
import { I18nProviderShell } from "@/components/i18n/provider-shell";

export default async function NotFound() {
  const { dict } = await getI18n();
  // The root layout doesn't mount <LocaleProvider> (section layouts do), but
  // this page renders the Navbar — whose AvatarMenu mounts the client
  // AppRatingDialog that calls useT(). Wrap in the provider shell so it doesn't
  // throw "useT must be inside <LocaleProvider>".
  return (
    <I18nProviderShell>
      <Navbar />
      <main className="flex-1 grid place-items-center py-24 px-6 text-center">
        <div>
          <p className="kicker mb-3">404</p>
          <h1 className="font-display text-5xl tracking-[-0.02em] font-medium mb-4">{t(dict, "notFound.title")}</h1>
          <p className="mb-6 max-w-md mx-auto" style={{ color: "var(--navy-2)" }}>
            {t(dict, "notFound.body")}
          </p>
          <Link href="/listings" className="pill-primary">{t(dict, "notFound.browse")}</Link>
        </div>
      </main>
      <Footer />
    </I18nProviderShell>
  );
}
