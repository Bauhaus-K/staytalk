import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1).optional(),
  EMAIL_SERVER: z.string().default("smtp://localhost:1025"),
  EMAIL_FROM: z.string().default("StayTalk <no-reply@staytalk.local>"),
  AI_MODE: z.enum(["mock", "live"]).default("mock"),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL_MAIN: z.string().default("claude-sonnet-5-5"),
  AI_MODEL_FAST: z.string().default("claude-haiku-5-5"),
  AI_MAX_TOOL_CALLS: z.coerce.number().int().positive().default(6),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  LINE_MODE: z.enum(["mock", "live"]).default("mock"),
  CRON_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

export const env: Env = schema.parse(process.env);
