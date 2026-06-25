/**
 * Resolve an API AuthContext to a real `users.id` (UUID).
 *
 * The auth middleware sets `userId` to a non-UUID label for the dev token
 * (`dev-<email>`) and the agent token (`mcp-agent`) — inserting those into a
 * uuid column (e.g. tickets.reporterId) throws. This maps the principal to a
 * real row so writes attribute correctly and emitted events carry a valid actor.
 */
import { db, eq } from "@questvault/db";
import { users } from "@questvault/db/schema";
import type { AuthContext } from "./middleware/auth.js";

const AGENT_USER_ID =
  process.env.MCP_AGENT_REPORTER_ID ?? "00000000-0000-0000-0000-000000000000";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns a real users.id, or null when the principal can't be resolved. */
export async function resolveUserId(auth: AuthContext): Promise<string | null> {
  // Agent token → the seeded QuestVault Agent system user.
  if (auth.agentMode) return AGENT_USER_ID;
  // A JWT may already carry a real UUID (production).
  if (UUID_RE.test(auth.userId)) return auth.userId;
  // Dev token / email-based principal → look up by email.
  if (!auth.email) return null;
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, auth.email))
    .limit(1);
  return u?.id ?? null;
}
