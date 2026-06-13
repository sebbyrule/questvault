/**
 * Workspace-role authorization helpers. Pages redirect when requireAdmin()
 * returns null; server actions return a Forbidden result. Role is read from the
 * DB (not the JWT) via getSessionAccount.
 */
import { getSessionAccount } from "./queries";
import { isAdminRole } from "./roles";

export { isAdminRole };

/**
 * The current session account if it is an active admin/owner, else null.
 * Inactive accounts never pass (they are also bounced by the (app) layout).
 */
export async function requireAdmin(): Promise<{ id: string; role: string } | null> {
  const account = await getSessionAccount();
  if (!account || !account.isActive || !isAdminRole(account.role)) return null;
  return { id: account.id, role: account.role };
}
