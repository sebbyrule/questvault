/**
 * Backfill ticket embeddings for semantic search.
 *
 *   pnpm db:embed
 *
 * Embeds every ticket that has no embedding yet (e.g. seed data) so they join
 * semantic search results. No-op when USE_EMBEDDINGS is not "true". Loads the
 * repo-root env first, then imports @questvault/db (its client reads
 * DATABASE_URL at import time).
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

for (const f of [".env.local", ".env"]) {
  const p = resolve(process.cwd(), f);
  if (existsSync(p)) {
    process.loadEnvFile(p);
    break;
  }
}

const { db, isNull, eq, embed, embeddingsEnabled } = await import("@questvault/db");
const { tickets } = await import("@questvault/db/schema");

const EMBED_DIMS = 1536;

async function main() {
  if (!embeddingsEnabled()) {
    console.log("USE_EMBEDDINGS is not 'true' — nothing to backfill.");
    return;
  }

  const rows = await db
    .select({ id: tickets.id, title: tickets.title, description: tickets.description })
    .from(tickets)
    .where(isNull(tickets.embedding));

  console.log(`Embedding ${rows.length} ticket(s) without an embedding…`);
  let done = 0;
  let skipped = 0;
  for (const t of rows) {
    const vec = await embed(`${t.title}\n\n${t.description ?? ""}`.trim());
    if (!vec || vec.length !== EMBED_DIMS) {
      skipped++;
      continue;
    }
    await db.update(tickets).set({ embedding: vec }).where(eq(tickets.id, t.id));
    done++;
  }
  console.log(`✅ Embedded ${done}; skipped ${skipped} (no/!=${EMBED_DIMS}-dim vector).`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
