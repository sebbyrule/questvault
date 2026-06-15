"use server";

/**
 * Admin actions for per-agent MCP tokens: mint (raw token shown once) and
 * revoke. Admin-gated via requireAdmin(). The raw token is never stored — only
 * its SHA-256 hash (hashAgentToken).
 */
import { randomBytes } from "node:crypto";
import { db, eq, hashAgentToken } from "@questvault/db";
import { agentTokens } from "@questvault/db/schema";
import { allTools } from "@questvault/tools";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "./authz";

const KNOWN_TOOLS = allTools.map((t) => t.name);
const AGENT_USER_ID =
  process.env.MCP_AGENT_REPORTER_ID ?? "00000000-0000-0000-0000-000000000000";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  // Tool-name allowlist, or ["*"] for all.
  scopes: z.array(z.string()).min(1, "Select at least one scope"),
});

export type CreateAgentTokenInput = z.infer<typeof createSchema>;

export async function createAgentToken(input: CreateAgentTokenInput) {
  const admin = await requireAdmin();
  if (!admin) return { ok: false as const, error: "Forbidden" };

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { name } = parsed.data;

  // Normalize scopes: "*" wins; otherwise keep only known tool names.
  const scopes = parsed.data.scopes.includes("*")
    ? ["*"]
    : parsed.data.scopes.filter((s) => KNOWN_TOOLS.includes(s));
  if (scopes.length === 0) {
    return { ok: false as const, error: "Select at least one valid scope" };
  }

  const token = `qv_agent_${randomBytes(32).toString("base64url")}`;
  await db.insert(agentTokens).values({
    name,
    tokenHash: hashAgentToken(token),
    scopes,
    createdBy: admin.id,
    reporterId: AGENT_USER_ID,
  });

  revalidatePath("/agents");
  return { ok: true as const, token };
}

export async function revokeAgentToken(id: string) {
  if (!(await requireAdmin())) return { ok: false as const, error: "Forbidden" };
  await db.update(agentTokens).set({ revokedAt: new Date() }).where(eq(agentTokens.id, id));
  revalidatePath("/agents");
  return { ok: true as const };
}
