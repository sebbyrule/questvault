// Side-effect module: load the repo-root .env.local (or .env) into process.env.
//
// Must be imported FIRST in index.ts — before any module that reads env at load
// time (e.g. @questvault/db's client reads DATABASE_URL on import). Unlike
// Next.js, a plain tsx/node process does not load .env files automatically.
import { existsSync } from "node:fs";
import { resolve } from "node:path";

for (const envFile of [".env.local", ".env"]) {
  const envPath = resolve(process.cwd(), "../..", envFile);
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
    break;
  }
}
