"use client";

// Replaces the root layout when the layout itself throws. Must be a client
// component and must render its own <html> + <body>. Kept dependency-free
// (no i18n, no cookies, no DB) so Next can prerender it without a request
// scope — that prerender is the build step that was failing on Vercel.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5eee0",
          color: "#1a1f3c",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <p
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 11,
              letterSpacing: ".1em",
              textTransform: "uppercase",
              color: "#d8467b",
              marginBottom: 12,
            }}
          >
            Something broke
          </p>
          <h1 style={{ fontSize: 32, lineHeight: 1.1, margin: "0 0 12px" }}>
            We hit an unexpected error.
          </h1>
          <p style={{ fontSize: 15, opacity: 0.75, marginBottom: 24 }}>
            Try again, or head back to the homepage.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button
              onClick={() => reset()}
              style={{
                background: "#d8467b",
                color: "#fff",
                border: 0,
                borderRadius: 999,
                padding: "10px 20px",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                background: "transparent",
                color: "#1a1f3c",
                border: "1px solid rgba(26,31,60,.2)",
                borderRadius: 999,
                padding: "10px 20px",
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              Home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
