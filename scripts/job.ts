/**
 * Runs a batch job locally:  pnpm job expire-bookings
 */
import "dotenv/config";
import { createClient } from "../src/server/db/client";
import { isJobName, JOBS } from "../src/server/jobs";

async function main() {
  const name = process.argv[2] ?? "";
  if (!isJobName(name)) {
    console.error(`Unknown job "${name}". Available: ${Object.keys(JOBS).join(", ")}`);
    process.exit(1);
  }
  const client = createClient(process.env.DATABASE_URL!);
  try {
    console.log(name, await JOBS[name](client));
  } finally {
    await client.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
