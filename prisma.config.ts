import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed/index.ts",
  },
  datasource: {
    // CLI (migrations) may need a direct, non-pooled connection in production
    // (Neon/Supabase poolers); the app itself uses DATABASE_URL.
    url: process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL || "",
  },
});
