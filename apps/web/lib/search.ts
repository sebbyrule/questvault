/**
 * Ticket search — semantic (pgvector / HNSW cosine) with a Postgres full-text
 * fallback. Server-only. The embedding column is fixed at 1536 dims; anything
 * else (embeddings off, embed failure, dim mismatch, or no embedded rows) falls
 * back to full-text so search always works, even with no embedding model.
 */
import { db, eq, sql, embed, embeddingsEnabled, toVectorLiteral } from "@questvault/db";
import { tickets } from "@questvault/db/schema";

const EMBED_DIMS = 1536;

export type SearchHit = {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: string;
  score: number;
};

export type SearchResult = { mode: "semantic" | "text"; results: SearchHit[] };

/**
 * Best-effort: embed the ticket's text and store it. Never throws into the
 * caller; a no-op when embeddings are disabled or the model's dims don't match.
 */
export async function embedTicketText(
  ticketId: string,
  title: string,
  description: string | null
): Promise<void> {
  if (!embeddingsEnabled()) return;
  try {
    const vec = await embed(`${title}\n\n${description ?? ""}`.trim());
    if (!vec || vec.length !== EMBED_DIMS) return;
    await db.update(tickets).set({ embedding: vec }).where(eq(tickets.id, ticketId));
  } catch (err) {
    console.error("[search] embedTicketText failed:", err);
  }
}

/** Search a project's tickets, semantic-first with a full-text fallback. */
export async function searchTickets(
  projectId: string,
  query: string,
  limit = 10
): Promise<SearchResult> {
  const q = query.trim();
  if (!q) return { mode: "text", results: [] };

  // ── Semantic ──────────────────────────────────────────────────────────────
  if (embeddingsEnabled()) {
    try {
      const qvec = await embed(q);
      if (qvec && qvec.length === EMBED_DIMS) {
        const literal = toVectorLiteral(qvec);
        const rows = await db.execute(sql`
          SELECT id, number, title, status, priority,
                 1 - (embedding <=> ${literal}::vector) AS score
          FROM tickets
          WHERE project_id = ${projectId}
            AND status <> 'archived'
            AND embedding IS NOT NULL
          ORDER BY embedding <=> ${literal}::vector ASC
          LIMIT ${limit}
        `);
        const results = rowsToHits(rows);
        if (results.length > 0) return { mode: "semantic", results };
      }
    } catch (err) {
      console.error("[search] semantic search failed, falling back to text:", err);
    }
  }

  // ── Full-text fallback ──────────────────────────────────────────────────────
  const rows = await db.execute(sql`
    SELECT id, number, title, status, priority,
           ts_rank(
             to_tsvector('english', title || ' ' || coalesce(description, '')),
             websearch_to_tsquery('english', ${q})
           ) AS score
    FROM tickets
    WHERE project_id = ${projectId}
      AND status <> 'archived'
      AND to_tsvector('english', title || ' ' || coalesce(description, ''))
          @@ websearch_to_tsquery('english', ${q})
    ORDER BY score DESC
    LIMIT ${limit}
  `);
  return { mode: "text", results: rowsToHits(rows) };
}

// drizzle-orm/postgres-js returns rows as an array of plain objects.
function rowsToHits(rows: unknown): SearchHit[] {
  const arr = rows as Array<Record<string, unknown>>;
  return arr.map((r) => ({
    id: String(r.id),
    number: Number(r.number),
    title: String(r.title),
    status: String(r.status),
    priority: String(r.priority),
    score: Number(r.score ?? 0),
  }));
}
