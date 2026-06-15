import { z } from "zod";
import { sql } from "@questvault/db";
import type { ToolDefinition } from "../types";

const EMBED_DIMS = 1536;

const schema = z.object({
  project_id: z.string().uuid(),
  query: z.string().min(1),
  limit: z.number().int().min(1).max(50).default(10),
});

type Hit = {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: string;
  score: number;
};

function toHits(rows: unknown): Hit[] {
  return (rows as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    number: Number(r.number),
    title: String(r.title),
    status: String(r.status),
    priority: String(r.priority),
    score: Number(r.score ?? 0),
  }));
}

/**
 * Semantic ticket search (pgvector cosine) with a Postgres full-text fallback —
 * the same behaviour as the web board search, exposed to the coach + MCP agents.
 */
export const searchTicketsTool: ToolDefinition = {
  name: "search_tickets",
  description:
    "Search a project's tickets by meaning. Uses vector similarity when embeddings are enabled, otherwise full-text search. Returns ranked matches (id, number, title, status, score).",
  inputSchema: schema,
  async execute(raw, { db, embed }) {
    const { project_id, query, limit } = schema.parse(raw);

    if (embed) {
      try {
        const qvec = await embed(query);
        if (qvec && qvec.length === EMBED_DIMS) {
          const literal = `[${qvec.join(",")}]`;
          const rows = await db.execute(sql`
            SELECT id, number, title, status, priority,
                   1 - (embedding <=> ${literal}::vector) AS score
            FROM tickets
            WHERE project_id = ${project_id}
              AND status <> 'archived'
              AND embedding IS NOT NULL
            ORDER BY embedding <=> ${literal}::vector ASC
            LIMIT ${limit}
          `);
          const hits = toHits(rows);
          if (hits.length > 0) return { mode: "semantic", results: hits };
        }
      } catch {
        // fall through to full-text
      }
    }

    const rows = await db.execute(sql`
      SELECT id, number, title, status, priority,
             ts_rank(
               to_tsvector('english', title || ' ' || coalesce(description, '')),
               websearch_to_tsquery('english', ${query})
             ) AS score
      FROM tickets
      WHERE project_id = ${project_id}
        AND status <> 'archived'
        AND to_tsvector('english', title || ' ' || coalesce(description, ''))
            @@ websearch_to_tsquery('english', ${query})
      ORDER BY score DESC
      LIMIT ${limit}
    `);
    return { mode: "text", results: toHits(rows) };
  },
};
