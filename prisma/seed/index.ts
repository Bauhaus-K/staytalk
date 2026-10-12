import "dotenv/config";
import { createClient } from "../../src/server/db/client";
import { DEMO_PASSWORD, DEMO_PROPERTIES, seedDemo } from "./seed";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = createClient(url);
  try {
    const properties = await seedDemo(client, { sampleConversations: true });
    console.log(`Seeded ${properties.length} demo properties:`);
    for (const d of DEMO_PROPERTIES) {
      console.log(
        `  - ${d.property.name}: ${d.knowledge.length} knowledge items, login ${d.owner.email} / ${DEMO_PASSWORD}`,
      );
    }
  } finally {
    await client.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
