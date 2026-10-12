import { prisma, type DbClient } from "./client";

/**
 * Models that carry an `organizationId` column and must always be scoped.
 * Keep in sync with prisma/schema.prisma (a unit test guards this).
 */
export const TENANT_MODELS = [
  "User",
  "Property",
  "RoomType",
  "Availability",
  "KnowledgeItem",
  "Conversation",
  "Message",
  "BookingRequest",
  "Escalation",
  "AgentRun",
  "ToolCall",
  "LlmUsage",
  "ChannelConnection",
] as const;

const tenantModels = new Set<string>(TENANT_MODELS);

const WHERE_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
  "upsert",
]);

const CREATE_OPERATIONS = new Set(["create", "createMany", "createManyAndReturn"]);

export class TenantScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantScopeError";
  }
}

type Args = Record<string, unknown>;

function withOrgData(data: unknown, organizationId: string): Args {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new TenantScopeError("Tenant-scoped create requires an object `data`.");
  }
  const record = data as Args;
  if ("organization" in record) {
    throw new TenantScopeError(
      "Do not connect `organization` explicitly; the tenant client sets organizationId.",
    );
  }
  if ("organizationId" in record && record.organizationId !== organizationId) {
    throw new TenantScopeError("organizationId in data does not match the tenant scope.");
  }
  return { ...record, organizationId };
}

function assertNoOrgChange(data: unknown, organizationId: string) {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const record = data as Args;
    if ("organization" in record) {
      throw new TenantScopeError("Changing `organization` is not allowed.");
    }
    if ("organizationId" in record && record.organizationId !== organizationId) {
      throw new TenantScopeError("Changing organizationId is not allowed.");
    }
  }
}

/**
 * Rewrites query args so they can only touch rows of `organizationId`.
 * Exported for unit testing; app code should use `forOrg()`.
 *
 * Limitation: nested writes (e.g. `messages: { create: [...] }`) are not
 * rewritten. Create child rows with their own top-level call instead.
 */
export function scopeArgs(
  model: string,
  operation: string,
  args: Args | undefined,
  organizationId: string,
): Args {
  const next: Args = { ...(args ?? {}) };

  if (model === "Organization") {
    if (CREATE_OPERATIONS.has(operation) || operation.startsWith("delete")) {
      throw new TenantScopeError(`Organization.${operation} is not allowed in tenant scope.`);
    }
    if (WHERE_OPERATIONS.has(operation)) {
      next.where = { ...(next.where as Args | undefined), id: organizationId };
    }
    return next;
  }

  if (!tenantModels.has(model)) return next;

  if (WHERE_OPERATIONS.has(operation)) {
    next.where = { ...(next.where as Args | undefined), organizationId };
  }

  if (operation === "create") {
    next.data = withOrgData(next.data, organizationId);
  } else if (operation === "createMany" || operation === "createManyAndReturn") {
    const rows = Array.isArray(next.data) ? next.data : [next.data];
    next.data = rows.map((row) => withOrgData(row, organizationId));
  } else if (operation === "upsert") {
    next.create = withOrgData(next.create, organizationId);
    assertNoOrgChange(next.update, organizationId);
  } else if (operation.startsWith("update")) {
    assertNoOrgChange(next.data, organizationId);
  }

  return next;
}

function scopedClient(client: DbClient, organizationId: string) {
  return client.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return query(scopeArgs(model, operation, args as Args, organizationId) as typeof args);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof scopedClient>;

/**
 * Returns a Prisma client whose every model query is restricted to one
 * organization. This is the only sanctioned way for app code to read or write
 * tenant data.
 *
 * Creates must still pass `organizationId` explicitly (Prisma's types require
 * it); the scope verifies it matches and rejects anything else.
 */
export function forOrg(organizationId: string, client: DbClient = prisma): TenantDb {
  if (!organizationId) throw new TenantScopeError("organizationId is required.");
  return scopedClient(client, organizationId);
}
