import type { NextConfig } from "next";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.swapl.fun";

const nextConfig: NextConfig = {
  // See app/next.config.ts: Vercel's 2-core build container makes Next
  // default to 1 prerender worker, which trips an "Expected workStore to be
  // initialized" bug while prerendering /_global-error. Force >=2 workers.
  experimental: {
    cpus: 4,
  },

  // Marketing forms and trackers POST to relative /api/* endpoints (beta
  // waitlist, marketing events, billing/corporate checkout). The product app
  // owns those routes — proxy everything except our own route handlers
  // (e.g. /api/i18n/locale, which is served locally and wins because
  // afterFiles rewrites only apply when no local route matches).
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${APP_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
