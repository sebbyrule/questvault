import { defineConfig } from "drizzle-kit";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// drizzle-kit does not load .env files automatically, and this package runs
// from packages/db, so the repo-root .env.local is never read. Load it here
// (preferring .env.local, falling back to .env) before reading DATABASE_URL.
for (const envFile of [".env.local", ".env"]) {
  const envPath = resolve(process.cwd(), "../..", envFile);
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
    break;
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Have you copied .env.example to .env.local?");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./src/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
});
