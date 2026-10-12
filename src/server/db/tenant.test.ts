import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scopeArgs, TENANT_MODELS, TenantScopeError } from "./tenant";

const ORG = "org_a";

describe("scopeArgs", () => {
  it("adds organizationId to where clauses of read/update/delete operations", () => {
    for (const op of ["findMany", "findFirst", "findUnique", "count", "updateMany", "delete"]) {
      const out = scopeArgs("KnowledgeItem", op, { where: { id: "k1" } }, ORG);
      expect(out.where).toEqual({ id: "k1", organizationId: ORG });
    }
  });

  it("overrides a caller-supplied organizationId filter", () => {
    const out = scopeArgs("Conversation", "findMany", { where: { organizationId: "org_b" } }, ORG);
    expect(out.where).toEqual({ organizationId: ORG });
  });

  it("injects organizationId into create data", () => {
    const out = scopeArgs("Property", "create", { data: { name: "x" } }, ORG);
    expect(out.data).toEqual({ name: "x", organizationId: ORG });
  });

  it("injects organizationId into every createMany row", () => {
    const out = scopeArgs(
      "Message",
      "createMany",
      { data: [{ content: "a" }, { content: "b" }] },
      ORG,
    );
    expect(out.data).toEqual([
      { content: "a", organizationId: ORG },
      { content: "b", organizationId: ORG },
    ]);
  });

  it("rejects creating rows for another organization", () => {
    expect(() =>
      scopeArgs("Property", "create", { data: { organizationId: "org_b" } }, ORG),
    ).toThrow(TenantScopeError);
    expect(() =>
      scopeArgs(
        "Property",
        "create",
        { data: { organization: { connect: { id: "org_b" } } } },
        ORG,
      ),
    ).toThrow(TenantScopeError);
  });

  it("rejects moving rows to another organization", () => {
    expect(() =>
      scopeArgs(
        "Property",
        "update",
        { where: { id: "p" }, data: { organizationId: "org_b" } },
        ORG,
      ),
    ).toThrow(TenantScopeError);
  });

  it("scopes upsert where and create", () => {
    const out = scopeArgs(
      "Availability",
      "upsert",
      { where: { id: "a" }, create: { date: "d" }, update: { rate: 1 } },
      ORG,
    );
    expect(out.where).toEqual({ id: "a", organizationId: ORG });
    expect(out.create).toEqual({ date: "d", organizationId: ORG });
  });

  it("restricts Organization queries to the current organization", () => {
    expect(scopeArgs("Organization", "findMany", {}, ORG).where).toEqual({ id: ORG });
    expect(() => scopeArgs("Organization", "create", { data: {} }, ORG)).toThrow(TenantScopeError);
    expect(() => scopeArgs("Organization", "deleteMany", {}, ORG)).toThrow(TenantScopeError);
  });

  it("leaves non-tenant models untouched", () => {
    const args = { where: { token: "t" } };
    expect(scopeArgs("VerificationToken", "findFirst", args, ORG)).toEqual(args);
  });
});

describe("TENANT_MODELS", () => {
  it("matches every model in schema.prisma that has an organizationId column", () => {
    const schema = readFileSync(path.resolve(__dirname, "../../../prisma/schema.prisma"), "utf8");
    const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)]
      .filter(([, , body]) => /^\s+organizationId\s+String/m.test(body!))
      .map(([, name]) => name);
    expect([...TENANT_MODELS].sort()).toEqual(models.sort());
  });
});
