// Top-of-page banner reminding visitors that we're pre-launch and the
// listing they create now ranks higher when swaps go live in September.

import Link from "next/link";
import { getDictionary } from "@/lib/i18n/server";

export async function LaunchBanner() {
  const dict = await getDictionary();
  return (
    <div
      className="border-b text-center py-2 px-4 text-sm"
      style={{
        background: "var(--pink-light)",
        borderColor: "var(--line)",
        color: "var(--navy)",
      }}
    >
      <span className="font-mono uppercase tracking-[.08em] text-[10px] mr-3" style={{ color: "var(--pink)" }}>
        {dict["launchBanner.tag"]}
      </span>
      {dict["launchBanner.body"]} <strong>{dict["launchBanner.month"]}</strong>.{" "}
      <Link href="/listings/new" className="underline font-medium" style={{ color: "var(--pink)" }}>
        {dict["launchBanner.cta"]}
      </Link>
    </div>
  );
}
