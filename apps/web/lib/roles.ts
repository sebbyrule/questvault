/**
 * Pure role helpers — safe to import from client components (no server deps).
 * Server-side gating lives in authz.ts.
 */
export function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "owner";
}
