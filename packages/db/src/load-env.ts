// Side-effect module: load the repo-root .env.local (or .env) into process.env.
//
// Import this FIRST from CLI entrypoints (seed scripts, one-off tools) that run
// outside the Next.js / service runtime. Neither tsx nor drizzle-kit load env
// files automatically, and this package runs from packages/db, so the repo-root
// env file is otherwise never read.
import { existsSync } from "node:fs";
import { resolve } from "node:path";

for (const envFile of [".env.local", ".env"]) {
  const envPath = resolve(process.cwd(), "../..", envFile);
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
    break;
  }
}
