/**
 * Embedding generation — fully optional. Lives in @questvault/db so it can be
 * imported by web (webpack), the coach, and tools without dragging in the AI
 * package's `.js`-specifier source. Co-located with the `vector` ticket column.
 *
 * Set USE_EMBEDDINGS=false to skip all vector operations (search falls back to
 * Postgres full-text). When enabled, calls an OpenAI-compatible /v1/embeddings
 * endpoint (LM Studio can serve one — e.g. point EMBEDDING_BASE_URL at it).
 */

export function embeddingsEnabled(): boolean {
  return process.env.USE_EMBEDDINGS === "true";
}

/** Format a vector for a pgvector `::vector` cast literal: [0.1,0.2,…]. */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

export async function embed(text: string): Promise<number[] | null> {
  if (!embeddingsEnabled()) return null;

  const baseUrl = process.env.EMBEDDING_BASE_URL ?? "http://localhost:1234/v1";
  const model = process.env.EMBEDDING_MODEL ?? "nomic-embed-text";
  const apiKey = process.env.EMBEDDING_API_KEY ?? "lm-studio";

  const res = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, input: text }),
  });

  if (!res.ok) {
    console.warn(`[embeddings] Failed to embed text: ${res.status} ${await res.text()}`);
    return null;
  }

  const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return data.data[0]?.embedding ?? null;
}
