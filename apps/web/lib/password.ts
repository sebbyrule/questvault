/**
 * Password hashing for credentials auth.
 *
 * Uses bcryptjs (pure JS — no native build, works on Windows). NODE-RUNTIME
 * ONLY: import this from auth.ts / auth-actions.ts, never from auth.config.ts
 * or middleware (which run on the Edge runtime).
 */
import bcrypt from "bcryptjs";

const COST = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
