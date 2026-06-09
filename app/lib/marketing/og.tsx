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
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: PINK,
                display: "flex",
              }}
            />
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
          <span>No money · Every stay insured · Launching September 2026</span>
        </div>
      </div>
    ),
    { ...OG_SIZE }
  );
}
