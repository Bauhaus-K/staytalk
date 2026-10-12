import { execSync } from "node:child_process";
import "dotenv/config";

// Migrates and seeds the test database used by the E2E web server.
export default function globalSetup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST is not set (see .env.example)");
  const env = { ...process.env, DATABASE_URL: url };
  execSync("pnpm exec prisma migrate deploy", { stdio: "ignore", env });
  execSync("pnpm exec tsx prisma/seed/index.ts", { stdio: "ignore", env });
}
