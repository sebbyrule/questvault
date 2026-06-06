import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Next only loads .env files from this app's directory, but QuestVault keeps a
// single env file at the repo root. Load it here (before the server starts) so
// server components can read DATABASE_URL etc.
const here = dirname(fileURLToPath(import.meta.url));
for (const envFile of [".env.local", ".env"]) {
  const envPath = resolve(here, "../..", envFile);
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
    break;
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@questvault/db",
    "@questvault/gamification",
    "@questvault/api-client",
  ],
  experimental: {
    // Enables the App Router server actions
    serverActions: { allowedOrigins: ["localhost:3002"] },
  },
};

export default nextConfig;
