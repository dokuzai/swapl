import Image from "next/image";
import { getDictionary } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict-en";

// Real screenshots captured from the iOS app via the XCUITest walkthrough
// (ios/SwaplUITests/MarketingScreenshotTests.swift). Resized to 800px wide.
const SHOTS: { src: string; captionKey: DictKey }[] = [
  { src: "/app/browse.png", captionKey: "appShowcase.shot.browse" },
  { src: "/app/listing-detail.png", captionKey: "appShowcase.shot.detail" },
  { src: "/app/messages.png", captionKey: "appShowcase.shot.messages" },
  { src: "/app/wishlists.png", captionKey: "appShowcase.shot.wishlists" },
];

export async function AppShowcase() {
  const dict = await getDictionary();
  return (
    <section id="app" className="border-t py-24" style={{ borderColor: "var(--line)" }}>
      <div className="wrap">
        <div className="mb-12 max-w-[780px]">
          <span className="kicker">{dict["appShowcase.kicker"]}</span>
          <h2 className="section-title mt-3">
            {dict["appShowcase.title"]} <span className="h-em" style={{ color: "var(--pink)" }}>{dict["appShowcase.titleEm"]}</span>
          </h2>
          <p className="mt-4 text-[18px] max-w-[56ch] leading-[1.5]" style={{ color: "var(--navy-2)" }}>
            {dict["appShowcase.lede"]}
          </p>
        </div>

        {/* Horizontal scroll on mobile, centered row on wide screens */}
        <div className="-mx-8 px-8 lg:mx-0 lg:px-0">
          <div className="flex gap-6 overflow-x-auto pb-4 snap-x snap-mandatory lg:justify-center lg:overflow-visible lg:pb-0">
            {SHOTS.map((shot) => (
              <figure key={shot.src} className="snap-center shrink-0 w-[216px] sm:w-[232px]">
                {/* Minimal device frame: bezel + suggested Dynamic Island */}
                <div
                  className="relative rounded-[40px] p-[9px]"
                  style={{
                    background: "var(--navy)",
                    boxShadow: "0 24px 48px -24px rgba(26,31,60,.45)",
                  }}
                >
                  <div className="relative overflow-hidden rounded-[31px]" style={{ aspectRatio: "800 / 1739" }}>
                    <Image
                      src={shot.src}
                      alt={dict[shot.captionKey]}
                      fill
                      sizes="232px"
                      className="object-cover"
                    />
                    <span
                      aria-hidden
                      className="absolute left-1/2 top-[10px] h-[16px] w-[56px] -translate-x-1/2 rounded-full"
                      style={{ background: "var(--navy)" }}
                    />
                  </div>
                </div>
                <figcaption
                  className="mt-4 text-center font-mono text-[11px] tracking-[.12em] uppercase"
                  style={{ color: "var(--navy-3)" }}
                >
                  {dict[shot.captionKey]}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>

        <div className="mt-12 flex justify-center">
          <span
            className="pill-ghost cursor-default select-none"
            style={{ pointerEvents: "none" }}
          >
            {dict["appShowcase.cta"]}
          </span>
        </div>
      </div>
    </section>
  );
}
