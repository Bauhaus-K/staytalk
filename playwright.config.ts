import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Optional: point at a preinstalled Chromium instead of `playwright install`.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  webServer: [
    {
      // Separate dist dir + port so it can run alongside the dev server; always
      // mock AI and the isolated test database.
      command: `pnpm exec next dev --port ${PORT}`,
      url: `${baseURL}/ko/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        NEXT_DIST_DIR: ".next-e2e",
        DATABASE_URL: process.env.DATABASE_URL_TEST ?? "",
        APP_URL: baseURL,
        AI_MODE: "mock",
        LINE_MODE: "mock",
      },
    },
    {
      // Stand-in for a property's website (whitelisted origin in the seed).
      command: "node scripts/demo-host.mjs",
      url: "http://localhost:4173/",
      reuseExistingServer: !process.env.CI,
      env: { PORT: "4173", APP_ORIGIN: baseURL },
    },
    {
      // A site that is NOT whitelisted.
      command: "node scripts/demo-host.mjs",
      url: "http://localhost:4174/",
      reuseExistingServer: !process.env.CI,
      env: { PORT: "4174", APP_ORIGIN: baseURL },
    },
  ],
});
