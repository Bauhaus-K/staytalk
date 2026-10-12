/**
 * Creates an organization and its first owner account.
 *
 *   pnpm admin:create-owner --org "Seochon Stay" --email owner@example.com --name "Kim" [--locale ko] [--password ...]
 *
 * Without --password the owner signs in with an email magic link.
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { createClient } from "../src/server/db/client";
import { createOrganizationWithOwner } from "../src/server/services/admin";

async function main() {
  const { values } = parseArgs({
    options: {
      org: { type: "string" },
      email: { type: "string" },
      name: { type: "string" },
      locale: { type: "string", default: "ko" },
      password: { type: "string" },
    },
  });
  const client = createClient(process.env.DATABASE_URL!);
  try {
    const { organization, owner } = await createOrganizationWithOwner(client, {
      organizationName: values.org ?? "",
      email: values.email ?? "",
      name: values.name ?? "",
      locale: values.locale as "ko",
      password: values.password,
    });
    console.log(`Created organization ${organization.id} with owner ${owner.email}`);
  } finally {
    await client.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
