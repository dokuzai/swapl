import { ImageResponse } from "next/og";

export const alt = "swapl — home swaps for slow travel";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Branded social preview card, shared by every route that doesn't define its
// own. Satori (next/og) requires every multi-child element to set display:flex.
export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#faf6ef",
          padding: 80,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 48, fontWeight: 700, color: "#1c2436", letterSpacing: "-0.03em" }}>
          swapl
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 84, fontWeight: 700, color: "#1c2436", letterSpacing: "-0.03em", lineHeight: 1.02 }}>
            Live somewhere new.
          </div>
          <div style={{ fontSize: 84, fontWeight: 700, color: "#e35d7a", letterSpacing: "-0.03em", lineHeight: 1.05 }}>
            For free.
          </div>
          <div style={{ fontSize: 30, color: "#3a4257", marginTop: 28 }}>
            Home swaps with verified hosts · €150,000 cover on every swap
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
