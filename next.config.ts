import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Lets E2E run a second dev server next to `pnpm dev`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Cache Components is intentionally off for the MVP: the dashboard is fully
  // per-tenant/per-session dynamic, so the static-shell model adds complexity
  // without benefit. Revisit for marketing/public pages later.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
