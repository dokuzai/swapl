import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { getCityGuide, allCityGuides } from "@/app/content/city-guides";
import { CityIllust } from "@/components/illustrations";
import { paletteForCity } from "@/lib/cities";
import { appUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/guides/[city]">) {
  const { city } = await props.params;
  const guide = getCityGuide(city);
  if (!guide) return { title: "Guide not found · swapl" };
  return { title: `${guide.city} city guide · swapl`, description: guide.hero };
}

const SECTION_KICKER: Record<string, string> = {
  neighbourhoods: "Where to stay",
  transport: "How to move",
  food: "Where to eat",
  etiquette: "Local customs",
  emergencies: "If something goes wrong",
};

// "milan" → "Milan", "san-francisco" → "San Francisco".
function prettifySlug(slug: string): string {
  return slug
    .split("-")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join(" ");
}

export default async function GuidePage(props: PageProps<"/guides/[city]">) {
  const { city } = await props.params;
  const guide = getCityGuide(city);
  if (!guide) return <GuideNotFound slug={city} />;

  // The marketing site has no session: free sections render in full, premium
  // sections stay locked with a CTA into the product app.
  const fullAccess = false;

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <div className="wrap py-10 lg:py-14 max-w-3xl">
          <Link href={appUrl("/listings")} className="font-mono text-xs uppercase tracking-[.08em] mb-6 inline-block" style={{ color: "var(--navy-3)" }}>
            ← Back to homes
          </Link>
          <div className="surface-card overflow-hidden mb-8 aspect-[16/8] relative" style={{ background: "var(--cream-2)" }}>
            <CityIllust city={guide.city} palette={paletteForCity(guide.city)} />
          </div>
          <p className="kicker mb-3">{guide.country} · city guide</p>
          <h1 className="font-display text-5xl tracking-[-0.03em] leading-[1.02] font-medium">{guide.city}</h1>
          <p className="mt-5 text-[18px] leading-[1.5] max-w-2xl" style={{ color: "var(--navy-2)" }}>
            {guide.hero}
          </p>

          <div className="mt-10 space-y-10">
            {guide.sections.map((section, i) => {
              const locked = !fullAccess && i >= 2; // first two sections are free
              return (
                <section key={section.title} className="relative">
                  <p className="kicker mb-2">{SECTION_KICKER[section.kind] ?? section.kind}</p>
                  <h2 className="font-display text-2xl tracking-[-0.01em] mb-3">{section.title}</h2>
                  <div
                    className="prose prose-sm max-w-none whitespace-pre-line"
                    style={{ color: locked ? "transparent" : "var(--navy-2)", textShadow: locked ? "0 0 9px rgba(26,31,60,.55)" : undefined, userSelect: locked ? "none" : "auto" }}
                  >
                    {section.body}
                  </div>
                  {locked && (
                    <div className="mt-3">
                      <p className="text-sm mb-2" style={{ color: "var(--navy-2)" }}>
                        The rest of the guide is included with swapl Plus and Pro.
                      </p>
                      <Link href={appUrl("/register")} className="pill-primary">
                        Unlock with Plus
                      </Link>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

// Guide-specific "not found" — a city we don't cover yet. Distinct from the
// site's listing-flavoured 404: it names the city and points to the guides we
// do have, plus the homes browser.
function GuideNotFound({ slug }: { slug: string }) {
  const city = prettifySlug(slug);
  const guides = allCityGuides();
  return (
    <>
      <Navbar />
      <main className="flex-1 grid place-items-center py-24 px-6 text-center">
        <div className="max-w-lg">
          <p className="kicker mb-3">City guide</p>
          <h1 className="font-display text-5xl tracking-[-0.02em] font-medium mb-4">
            No guide for {city} yet.
          </h1>
          <p className="mb-7" style={{ color: "var(--navy-2)" }}>
            We haven&rsquo;t written a {city} guide yet — we&rsquo;re adding cities as the
            community grows. In the meantime, explore the guides we already have:
          </p>
          <div className="flex flex-wrap justify-center gap-2 mb-8">
            {guides.map((g) => (
              <Link key={g.slug} href={`/guides/${g.slug}`} className="pill-ghost">
                {g.city}
              </Link>
            ))}
          </div>
          <Link href={appUrl("/listings")} className="pill-primary">Browse homes</Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
