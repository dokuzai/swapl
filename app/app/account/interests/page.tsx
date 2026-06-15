import { redirect } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { parseInterests } from "@/lib/interests";
import { I18nProviderShell } from "@/components/i18n/provider-shell";
import { getI18n, t as tt } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict-en";
import { InterestsForm } from "./interests-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your interests · swapl" };

export default async function InterestsPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/account/interests");
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) redirect("/login");

  const { dict } = await getI18n();
  const t = (key: DictKey, vars?: Record<string, string | number>) => tt(dict, key, vars);

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <I18nProviderShell>
        <div className="wrap py-10 lg:py-14 max-w-3xl">
          <Link href="/account" className="font-mono text-xs uppercase tracking-[.08em] mb-6 inline-block" style={{ color: "var(--navy-3)" }}>
            ← {t("interests.back")}
          </Link>
          <p className="kicker mb-3">{t("interests.kicker")}</p>
          <h1 className="font-display text-4xl tracking-[-0.02em] mb-3">{t("interests.title")}</h1>
          <p className="mb-6 text-[16px]" style={{ color: "var(--navy-2)" }}>
            {t("interests.intro")}
          </p>
          <InterestsForm
            initial={parseInterests(user.interests).map((t) => t.slug)}
            initialBio={user.bioVibe ?? ""}
          />
        </div>
        </I18nProviderShell>
      </main>
      <Footer />
    </>
  );
}
