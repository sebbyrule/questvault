/**
 * QuestVault API Server — port 3001
 *
 * Local-dev friendly:
 *   - Serves uploaded files from ./uploads when STORAGE_PROVIDER=local
 *   - No AWS, no OAuth, no external dependencies required
 */

import "./load-env.js"; // must run before any import that reads env (e.g. @questvault/db)
import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "node:path";
import { ticketsRouter } from "./routes/tickets.js";
import { aiRouter } from "./routes/ai.js";
import { authMiddleware } from "./middleware/auth.js";

const app = express();
const PORT = process.env.API_PORT ? parseInt(process.env.API_PORT) : 3001;

// ─── Global middleware ────────────────────────────────────────────────────────
app.use(
  helmet({
    // Allow serving local uploads without CSP issues
    contentSecurityPolicy: process.env.NODE_ENV === "production",
  })
);
app.use(
  cors({
    origin: process.env.NEXTAUTH_URL ?? "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));

// ─── Local file uploads (dev only) ───────────────────────────────────────────
if ((process.env.STORAGE_PROVIDER ?? "local") === "local") {
  const uploadsPath = path.resolve(
    process.env.LOCAL_STORAGE_PATH ?? "./uploads"
  );
  app.use("/uploads", express.static(uploadsPath));
  console.log(`[storage] Serving local uploads from ${uploadsPath}`);
}

// ─── Health check (no auth) ───────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    llmProvider: process.env.LLM_PROVIDER ?? "lmstudio",
    storageProvider: process.env.STORAGE_PROVIDER ?? "local",
    embeddingsEnabled: process.env.USE_EMBEDDINGS === "true",
  });
});

// ─── Authenticated routes ─────────────────────────────────────────────────────
app.use("/api/v1", authMiddleware);
app.use("/api/v1", ticketsRouter);
app.use("/api/v1/ai", aiRouter);

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("[API Error]", err.message);
    res.status(500).json({
      error:
        process.env.NODE_ENV === "production"
          ? "Internal server error"
          : err.message,
    });
  }
);

app.listen(PORT, () => {
  console.log(`QuestVault API  →  http://localhost:${PORT}`);
  console.log(`Health check    →  http://localhost:${PORT}/health`);
});
