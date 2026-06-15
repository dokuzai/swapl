import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getI18n, t as tt } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict-en";
import ListingForm from "./listing-form";

export const metadata = { title: "List your home · swapl" };
export const dynamic = "force-dynamic";

export default async function ListingNewPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/listings/new");
  const { dict } = await getI18n();
  const t = (key: DictKey, vars?: Record<string, string | number>) => tt(dict, key, vars);
  return (
    <div className="wrap py-10 lg:py-14">
      <header className="mb-10 max-w-[640px]">
        <p className="kicker mb-3">{t("wizard.page.kicker")}</p>
        <h1 className="font-display text-4xl lg:text-5xl tracking-[-0.02em] leading-[1.05] font-medium">
          {t("wizard.page.title")}
        </h1>
        <p className="mt-3 text-[16px]" style={{ color: "var(--navy-2)" }}>
          {t("wizard.page.intro")}
        </p>
      </header>
      <ListingForm />
    </div>
  );
}
