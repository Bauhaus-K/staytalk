import "dotenv/config";
import { createClient, type DbClient } from "@/server/db/client";

let client: DbClient | undefined;

/** Unscoped client bound to the test database. */
export function testDb(): DbClient {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST is not set");
  client ??= createClient(url);
  return client;
}
