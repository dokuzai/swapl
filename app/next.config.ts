import type { NextConfig } from "next";

const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://swapl.fun";

// Marketing paths that used to be served by this app now live on the
// marketing site. Temporary redirects keep old links working.
const MARKETING_PATHS = [
  "/pricing",
  "/corporate",
  "/blog/:path*",
  "/guides/:path*",
  "/how-it-works",
  "/insurance",
  "/contact",
  "/privacy",
  "/terms",
];

// Baseline security headers applied to every response (DOK-131).
// frame-ancestors 'none' (CSP) supersedes X-Frame-Options: DENY in all
// supported browsers, so we don't set both.
const SECURITY_HEADERS = [
  // 2 years, ready for the preload list once the apex is confirmed HTTPS-only.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
];

const nextConfig: NextConfig = {
  // Vercel sets outputFileTracingRoot to /vercel/path0 (the repo root, one
  // level above the app/) and Next requires turbopack.root to match it. We
  // already use relative imports for the generated Prisma client to avoid
  // alias-resolution edge cases, so leaving turbopack.root unset is fine.

  // Vercel's 2-core build container makes Next default to 1 prerender worker.
  // The single-worker code path in Next 16.2.4 hits "Expected workStore to be
  // initialized" when prerendering /_global-error; the multi-worker path
  // (which we use locally with 9 workers) sidesteps it. Force >=2 workers.
  experimental: {
    cpus: 4,
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
      // Apple requires the AASA file (no extension) to be served as JSON for
      // Universal Links + passkey autofill (webcredentials). The Android
      // counterpart, /.well-known/assetlinks.json, currently lists ONLY the
      // debug-keystore fingerprint.
      // TODO: add the release-keystore SHA-256 fingerprint to
      // public/.well-known/assetlinks.json before shipping a signed build.
      {
        source: "/.well-known/apple-app-site-association",
        headers: [{ key: "Content-Type", value: "application/json" }],
      },
    ];
  },

  async redirects() {
    return MARKETING_PATHS.map((source) => ({
      source,
      destination: `${MARKETING_URL}${source}`,
      permanent: false,
    }));
  },
};

export default nextConfig;
