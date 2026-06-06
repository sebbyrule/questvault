/**
 * Embedding generation — fully optional.
 *
 * Set USE_EMBEDDINGS=false in .env to skip all vector operations
 * (ticket semantic search will fall back to Postgres full-text search).
 *
 * When enabled, uses an OpenAI-compatible /v1/embeddings endpoint.
 * LM Studio can serve embedding models — load one (e.g. nomic-embed-text)
 * and point EMBEDDING_BASE_URL at it.
 */

export function embeddingsEnabled(): boolean {
  return process.env.USE_EMBEDDINGS === "true";
}

export async function embed(text: string): Promise<number[] | null> {
  if (!embeddingsEnabled()) return null;

  const baseUrl = process.env.EMBEDDING_BASE_URL ?? "http://localhost:1234/v1";
  const model = process.env.EMBEDDING_MODEL ?? "nomic-embed-text";
  const apiKey = process.env.EMBEDDING_API_KEY ?? "lm-studio";

  const res = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: text }),
  });

  if (!res.ok) {
    console.warn(`[embeddings] Failed to embed text: ${res.status} ${await res.text()}`);
    return null;
  }

  const data = (await res.json()) as {
    data: Array<{ embedding: number[] }>;
  };

  return data.data[0]?.embedding ?? null;
}
