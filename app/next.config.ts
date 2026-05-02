import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel sets outputFileTracingRoot to /vercel/path0 (the repo root, one
  // level above the app/) and Next requires turbopack.root to match it. We
  // already use relative imports for the generated Prisma client to avoid
  // alias-resolution edge cases, so leaving turbopack.root unset is fine.
};

export default nextConfig;
