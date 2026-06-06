/**
 * Storage abstraction — two providers:
 *
 *   STORAGE_PROVIDER=local  → writes files to LOCAL_STORAGE_PATH (default ./uploads)
 *   STORAGE_PROVIDER=s3     → AWS S3 / compatible (production)
 *
 * The rest of the codebase calls upload() / getUrl() and never knows which is active.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface UploadResult {
  key: string;       // storage key (path or S3 key)
  url: string;       // URL the client can use to fetch the file
  size: number;      // bytes
  mimeType: string;
}

// ─── Local provider ───────────────────────────────────────────────────────────

function getLocalBasePath(): string {
  return path.resolve(process.env.LOCAL_STORAGE_PATH ?? "./uploads");
}

async function localUpload(
  buffer: Buffer,
  mimeType: string,
  originalName: string
): Promise<UploadResult> {
  const basePath = getLocalBasePath();
  await fs.mkdir(basePath, { recursive: true });

  const ext = path.extname(originalName) || ".bin";
  const key = `${crypto.randomUUID()}${ext}`;
  const filePath = path.join(basePath, key);

  await fs.writeFile(filePath, buffer);

  // URL is served by the API server under /uploads/:key
  const apiBase = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const url = `${apiBase}/uploads/${key}`;

  return { key, url, size: buffer.length, mimeType };
}

async function localGetUrl(key: string): Promise<string> {
  const apiBase = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `${apiBase}/uploads/${key}`;
}

async function localDelete(key: string): Promise<void> {
  const filePath = path.join(getLocalBasePath(), key);
  try {
    await fs.unlink(filePath);
  } catch (err) {
    // Ignore ENOENT — file already gone
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

// ─── S3 provider (stub — fill in aws-sdk calls for production) ───────────────

async function s3Upload(
  _buffer: Buffer,
  _mimeType: string,
  _originalName: string
): Promise<UploadResult> {
  // TODO Phase 5: implement with @aws-sdk/client-s3
  throw new Error(
    "S3 storage is not yet implemented. Set STORAGE_PROVIDER=local for development."
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

function getProvider(): "local" | "s3" {
  const p = process.env.STORAGE_PROVIDER ?? "local";
  if (p !== "local" && p !== "s3") {
    throw new Error(`Unknown STORAGE_PROVIDER "${p}". Use "local" or "s3".`);
  }
  return p;
}

export async function upload(
  buffer: Buffer,
  mimeType: string,
  originalName: string
): Promise<UploadResult> {
  return getProvider() === "local"
    ? localUpload(buffer, mimeType, originalName)
    : s3Upload(buffer, mimeType, originalName);
}

export async function getUrl(key: string): Promise<string> {
  return getProvider() === "local"
    ? localGetUrl(key)
    : Promise.resolve(`https://${process.env.S3_BUCKET}.s3.amazonaws.com/${key}`);
}

export async function remove(key: string): Promise<void> {
  if (getProvider() === "local") {
    await localDelete(key);
  }
  // S3: TODO Phase 5
}
