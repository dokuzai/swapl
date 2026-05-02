import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin Turbopack's workspace root. Without this Next 16 can pick the wrong
  // root when multiple lockfiles are visible (warning at dev start, hard
  // alias-resolution failure on Vercel).
  turbopack: {
    root: path.join(import.meta.dirname),
  },
};

export default nextConfig;
