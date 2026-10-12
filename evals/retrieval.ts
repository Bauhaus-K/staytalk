/**
 * Knowledge retrieval eval: compares trigram, vector and hybrid search.
 *
 *   pnpm eval:retrieval                    # hash embeddings (local baseline)
 *   pnpm eval:retrieval --provider=voyage  # needs VOYAGE_API_KEY (external API)
 *
 * Uses the demo knowledge bases in the test database. Reports hit@1, hit@3
 * and MRR per query kind (keyword / paraphrase / cross-language).
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "../src/server/db/client";
import { HashEmbedder } from "../src/server/embeddings/hash";
import type { Embedder } from "../src/server/embeddings/types";
import { VoyageEmbedder } from "../src/server/embeddings/voyage";
import { searchKnowledge, type SearchMode } from "../src/server/services/knowledge";
import { embedKnowledge } from "../src/server/services/knowledge-embeddings";
import { DEMO_PROPERTIES, seedDemo } from "../prisma/seed/seed";

type Case = { property: "seoul" | "fukuoka"; kind: string; query: string; expected: string };

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

function embedderFor(provider: string): Embedder {
  if (provider === "voyage") {
    if (!process.env.VOYAGE_API_KEY) throw new Error("--provider=voyage requires VOYAGE_API_KEY");
    return new VoyageEmbedder({
      apiKey: process.env.VOYAGE_API_KEY,
      model: process.env.VOYAGE_MODEL || undefined,
    });
  }
  return new HashEmbedder();
}

async function main() {
  const provider = arg("provider") ?? "hash";
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST is not set");
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: url },
  });
  const client = createClient(url);
  const embedder = embedderFor(provider);
  const properties = await seedDemo(client);
  const scope = {
    seoul: { organizationId: DEMO_PROPERTIES[0]!.organization.id, propertyId: properties[0]!.id },
    fukuoka: { organizationId: DEMO_PROPERTIES[1]!.organization.id, propertyId: properties[1]!.id },
  };
  for (const s of Object.values(scope)) await embedKnowledge(client, embedder, s);

  const cases = JSON.parse(readFileSync(path.join(ROOT, "retrieval/cases.json"), "utf8")) as Case[];
  const modes: SearchMode[] = ["trigram", "vector", "hybrid"];
  type Row = { hit1: number; hit3: number; rr: number; n: number };
  const table = new Map<string, Row>();
  const misses: string[] = [];

  for (const mode of modes) {
    for (const c of cases) {
      const hits = await searchKnowledge(
        client,
        { ...scope[c.property], query: c.query, limit: 5 },
        { embedder, mode },
      );
      const rank = hits.findIndex((h) => h.question === c.expected) + 1;
      for (const key of [`${mode}|all`, `${mode}|${c.kind}`]) {
        const row = table.get(key) ?? { hit1: 0, hit3: 0, rr: 0, n: 0 };
        row.n++;
        if (rank === 1) row.hit1++;
        if (rank >= 1 && rank <= 3) row.hit3++;
        if (rank >= 1) row.rr += 1 / rank;
        table.set(key, row);
      }
      if (rank !== 1)
        misses.push(
          `${mode} · ${c.kind} · "${c.query}" → ${hits[0]?.question ?? "(none)"} (expected ${c.expected}, rank ${rank || "-"})`,
        );
    }
  }
  await client.$disconnect();

  const kinds = ["all", "keyword", "paraphrase", "cross-language"];
  const fmt = (r?: Row) =>
    r
      ? `${((r.hit1 / r.n) * 100).toFixed(0)}% / ${((r.hit3 / r.n) * 100).toFixed(0)}% / ${(r.rr / r.n).toFixed(2)}`
      : "-";
  const lines = [
    `# Retrieval eval (embeddings: ${embedder.model})`,
    "",
    `${cases.length} queries. Cells: hit@1 / hit@3 / MRR.`,
    "",
    `| Mode | ${kinds.join(" | ")} |`,
    `| --- | ${kinds.map(() => "---").join(" | ")} |`,
    ...modes.map((m) => `| ${m} | ${kinds.map((k) => fmt(table.get(`${m}|${k}`))).join(" | ")} |`),
    "",
    "## Misses (rank ≠ 1)",
    "",
    ...misses.map((m) => `- ${m}`),
    "",
  ].join("\n");
  const dir = path.join(ROOT, "reports");
  mkdirSync(dir, { recursive: true });
  const file = path.join(
    dir,
    `retrieval-${embedder.model}-${new Date().toISOString().replace(/[:.]/g, "-")}.md`,
  );
  writeFileSync(file, lines);
  console.log(lines.split("\n").slice(0, 10).join("\n"));
  console.log(`Report: ${path.relative(process.cwd(), file)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
