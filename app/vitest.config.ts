import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Mirror the `@/*` path alias from tsconfig.json so tests import the same way
// the app does.
const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": root },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Cron job-logic tests invoke the handlers without a bearer; opt into the
    // insecure-cron path the same way local dev does. The auth gate itself is
    // still asserted by the "CRON_SECRET set → 403" cases (which override this).
    env: { ALLOW_INSECURE_CRON: "1" },
  },
});
