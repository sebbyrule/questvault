/**
 * Project slug helpers (server-only, but not a "use server" action module, so it
 * can export plain functions used by multiple server actions).
 */
import { db, like } from "@questvault/db";
import { projects } from "@questvault/db/schema";

/** Turn a project name into a URL-safe slug base ("My App!" -> "my-app"). */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "project";
}

/** A unique project slug derived from the name (collisions get -2, -3, …). */
export async function uniqueProjectSlug(name: string): Promise<string> {
  const base = slugify(name);
  const existing = await db
    .select({ slug: projects.slug })
    .from(projects)
    .where(like(projects.slug, `${base}%`));
  const taken = new Set(existing.map((r) => r.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
