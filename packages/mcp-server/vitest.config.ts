import { defineConfig } from "vitest/config";

// @questvault/tools transitively imports the @questvault/db client, which throws
// at import time unless DATABASE_URL is set. The smoke test never issues a query
// (createServer only registers handlers), so a dummy URL is enough — postgres-js
// connects lazily.
export default defineConfig({
  test: {
    env: { DATABASE_URL: "postgresql://test:test@localhost:5432/questvault_test" },
  },
});
