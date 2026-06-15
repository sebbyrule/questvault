/**
 * Shared agent-token logic, used by the web minter and the mcp-server verifier.
 * Hashing + the scope predicate are pure; resolveAgentToken hits the DB.
 */
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "./client";
import { agentTokens, type AgentToken } from "./schema/agents";

/** SHA-256 of a raw agent token. The raw token only ever lives in the header. */
export function hashAgentToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** True when a tool is permitted by a token's scope list (["*"] = all). */
export function isToolAllowed(scopes: string[], tool: string): boolean {
  return scopes.includes("*") || scopes.includes(tool);
}

/**
 * Resolve a raw bearer token to a live agent token (not revoked, not expired),
 * else null. On success, best-effort stamps last_used_at.
 */
export async function resolveAgentToken(
  db: Database,
  rawToken: string
): Promise<AgentToken | null> {
  if (!rawToken) return null;
  const [token] = await db
    .select()
    .from(agentTokens)
    .where(eq(agentTokens.tokenHash, hashAgentToken(rawToken)))
    .limit(1);
  if (!token) return null;
  if (token.revokedAt) return null;
  if (token.expiresAt && token.expiresAt.getTime() <= Date.now()) return null;

  // Fire-and-forget last-used stamp; never block auth on it.
  db.update(agentTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(agentTokens.id, token.id))
    .then(undefined, (err) => console.error("[agents] lastUsedAt update failed:", err));

  return token;
}
