import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Unscoped client. Only use directly for cross-tenant system work (auth, widget
// key lookup, batch jobs). App code handling tenant data must use `forOrg()`.
function createClient(connectionString: string) {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const prisma =
  globalForPrisma.prisma ?? createClient(process.env.DATABASE_URL ?? "postgresql://invalid");

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export { createClient };
export type DbClient = ReturnType<typeof createClient>;
