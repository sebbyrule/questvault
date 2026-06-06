/**
 * BFF proxy for the AI coach.
 *
 * The browser posts here (same-origin, no token); we forward to the Express
 * API's SSE endpoint with the dev auth token injected server-side, then stream
 * the response straight back. Architecture: web → API → @questvault/ai → LLM.
 */
import { getPrimaryProject } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { message, history } = (body ?? {}) as {
    message?: unknown;
    history?: unknown;
  };
  if (typeof message !== "string" || !message.trim()) {
    return Response.json({ error: "A message is required" }, { status: 400 });
  }
  const safeHistory = Array.isArray(history)
    ? history
        .filter(
          (m): m is { role: "user" | "assistant"; content: string } =>
            !!m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string"
        )
        .slice(-10)
    : [];

  const project = await getPrimaryProject();
  if (!project) {
    return Response.json(
      { error: "No project found. Run `pnpm db:seed`." },
      { status: 404 }
    );
  }

  const apiBase = `http://127.0.0.1:${process.env.API_PORT ?? "3001"}`;
  const devEmail = process.env.COACH_DEV_EMAIL ?? "alice@example.com";

  let upstream: Response;
  try {
    upstream = await fetch(`${apiBase}/api/v1/ai/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer dev:${devEmail}`,
      },
      body: JSON.stringify({
        projectId: project.id,
        message: message.slice(0, 2000),
        history: safeHistory,
      }),
    });
  } catch {
    return Response.json(
      { error: "Can't reach the API server on :" + (process.env.API_PORT ?? "3001") + ". Is `pnpm dev` running?" },
      { status: 503 }
    );
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return Response.json(
      { error: `Coach request failed (${upstream.status}). ${detail}`.trim() },
      { status: 502 }
    );
  }

  // Pass the SSE stream straight through to the browser.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
