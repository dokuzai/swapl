import { ImageResponse } from "next/og";

// Shared Open Graph / Twitter card renderer so every shared swapl link previews
// on-brand (cream canvas, navy type, pink accent) instead of a blank box.
// 1200×630 is the canonical OG size honored by WhatsApp, iMessage, X, LinkedIn,
// Slack, Facebook.
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const CREAM = "#FAF6E8";
const NAVY = "#1A1F3C";
const NAVY_2 = "#2A3066";
const PINK = "#F24B8E";
const LINE = "#E5E0D0";

// swapl mark as a self-contained data URI so OG cards lead with the real logo.
const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g fill="none" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"><path stroke="${NAVY}" d="M 32.5 100 L 32.5 61 L 100 22 L 167.5 61 Q 167.5 104 132 108 L 117 110"/><path stroke="${PINK}" d="M 167.5 100 L 167.5 139 L 100 178 L 32.5 139 Q 32.5 96 68 92 L 83 90"/></g><g fill="${NAVY}"><rect x="87.5" y="87.5" width="11" height="11" rx="2.6"/><rect x="101.5" y="87.5" width="11" height="11" rx="2.6"/><rect x="87.5" y="101.5" width="11" height="11" rx="2.6"/><rect x="101.5" y="101.5" width="11" height="11" rx="2.6"/></g></svg>`;
const MARK_URI = `data:image/svg+xml;utf8,${encodeURIComponent(MARK_SVG)}`;

export function renderOgImage({
  kicker,
  title,
  subtitle,
}: {
  kicker: string;
  title: string;
  subtitle: string;
}) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: CREAM,
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* top row: wordmark + kicker */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MARK_URI} width={48} height={48} alt="" style={{ display: "flex" }} />
            <div style={{ fontSize: 34, fontWeight: 700, color: NAVY, letterSpacing: -1 }}>
              swapl
            </div>
          </div>
          <div
            style={{
              fontSize: 22,
              color: NAVY_2,
              textTransform: "uppercase",
              letterSpacing: 2,
            }}
          >
            {kicker}
          </div>
        </div>

        {/* headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 84,
              fontWeight: 600,
              color: NAVY,
              lineHeight: 1.0,
              letterSpacing: -3,
              maxWidth: 980,
            }}
          >
            {title}
          </div>
          <div style={{ width: 96, height: 5, background: PINK, display: "flex" }} />
          <div style={{ fontSize: 30, color: NAVY_2, lineHeight: 1.35, maxWidth: 920 }}>
            {subtitle}
          </div>
        </div>

        {/* footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            paddingTop: 28,
            borderTop: `1px solid ${LINE}`,
            fontSize: 24,
            color: NAVY_2,
          }}
        >
          <span style={{ color: PINK, fontWeight: 600 }}>Keys for keys.</span>
          <span>No money · Every stay backed · Launching September 2026</span>
        </div>
      </div>
    ),
    { ...OG_SIZE }
  );
}
