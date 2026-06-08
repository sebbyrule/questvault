/**
 * Workspace settings access. The settings row is a singleton (`id = 'workspace'`);
 * `getAppSettings` find-or-creates it so callers always get a row.
 */
import { eq } from "drizzle-orm";
import type { Database } from "./client";
import { appSettings, type AppSettings, type NewAppSettings } from "./schema/settings";

const SINGLETON_ID = "workspace";

export async function getAppSettings(db: Database): Promise<AppSettings> {
  const existing = await db.query.appSettings.findFirst({
    where: eq(appSettings.id, SINGLETON_ID),
  });
  if (existing) return existing;

  // Create the default row on first access (idempotent under concurrent calls).
  await db
    .insert(appSettings)
    .values({ id: SINGLETON_ID })
    .onConflictDoNothing();

  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.id, SINGLETON_ID),
  });
  if (!row) throw new Error("Failed to initialise app settings");
  return row;
}

export async function updateAppSettings(
  db: Database,
  patch: Partial<Omit<NewAppSettings, "id" | "createdAt">>
): Promise<AppSettings> {
  await getAppSettings(db); // ensure the row exists
  const [updated] = await db
    .update(appSettings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(appSettings.id, SINGLETON_ID))
    .returning();
  if (!updated) throw new Error("Failed to update app settings");
  return updated;
}
