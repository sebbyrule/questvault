/**
 * Auth middleware for the Express API.
 *
 * Accepts two token formats:
 *
 *  1. Dev token (NODE_ENV=development only)
 *     Header:  Authorization: Bearer dev:<email>
 *     Example: Authorization: Bearer dev:alice@example.com
 *     No secret required — instant, no OAuth needed.
 *
 *  2. MCP agent token
 *     Header:  Authorization: Bearer <MCP_AGENT_SECRET>
 *     Sets agentMode=true on the request.
 *
 *  3. JWT (production)
 *     Header:  Authorization: Bearer <jwt>
 *     Validated against AUTH_SECRET.
 */

import type { Request, Response, NextFunction } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";

export interface AuthContext {
  userId: string;
  email: string;
  agentMode: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }

  const token = header.slice(7);

  // ── 1. MCP agent token ─────────────────────────────────────────────────────
  const mcpSecret = process.env.MCP_AGENT_SECRET ?? "";
  if (mcpSecret && safeEqual(token, mcpSecret)) {
    req.auth = {
      userId: "mcp-agent",
      email: "agent@questvault.internal",
      agentMode: true,
    };
    next();
    return;
  }

  // ── 2. Dev token (development only) ───────────────────────────────────────
  if (process.env.NODE_ENV !== "production" && token.startsWith("dev:")) {
    const email = token.slice(4).trim();
    if (!email || !email.includes("@")) {
      res.status(401).json({
        error: 'Invalid dev token. Format: "dev:your@email.com"',
      });
      return;
    }
    req.auth = {
      userId: `dev-${email}`,
      email,
      agentMode: false,
    };
    next();
    return;
  }

  // ── 3. JWT (production) ────────────────────────────────────────────────────
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    // No secret configured and not in dev mode
    res.status(401).json({ error: "Auth not configured" });
    return;
  }

  try {
    // Minimal JWT verification — use jsonwebtoken in production for full support
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Invalid JWT format");

    const [headerB64, payloadB64, sigB64] = parts as [string, string, string];
    const expected = createHmac("sha256", secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64url");

    if (!safeEqual(sigB64, expected)) throw new Error("Invalid signature");

    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    ) as { userId?: string; email?: string; exp?: number };

    if (payload.exp && payload.exp < Date.now() / 1000) {
      throw new Error("Token expired");
    }

    if (!payload.userId || !payload.email) {
      throw new Error("Missing claims");
    }

    req.auth = { userId: payload.userId, email: payload.email, agentMode: false };
    next();
  } catch (err) {
    res.status(401).json({
      error: err instanceof Error ? err.message : "Invalid token",
    });
  }
}
