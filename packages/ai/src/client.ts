/**
 * LLM client — supports two providers:
 *
 *   LLM_PROVIDER=lmstudio   → LM Studio local server (OpenAI-compatible, no key needed)
 *   LLM_PROVIDER=anthropic  → Anthropic Claude API (production)
 *
 * Both providers expose the same `chat()` and `streamChat()` interface so the
 * rest of the codebase never needs to know which is active.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
}

/**
 * A streamed chunk. Reasoning models (e.g. Qwen, some Gemma builds served by
 * LM Studio) emit their chain-of-thought as `reasoning` before the final
 * `text` answer. Consumers can render reasoning as a live "thinking" state.
 */
export interface StreamChunk {
  kind: "reasoning" | "text";
  text: string;
}

// ─── Provider: LM Studio (OpenAI-compatible) ──────────────────────────────────

function getLmStudioConfig() {
  const baseUrl =
    process.env.LM_STUDIO_BASE_URL ?? "http://localhost:1234/v1";
  const model = process.env.LM_STUDIO_MODEL ?? "local-model";
  const apiKey = process.env.LM_STUDIO_API_KEY ?? "lm-studio";
  return { baseUrl, model, apiKey };
}

async function lmStudioChat(
  messages: ChatMessage[],
  opts: ChatOptions = {}
): Promise<string> {
  const { baseUrl, model, apiKey } = getLmStudioConfig();
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.7,
      stream: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LM Studio error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const content = data.choices[0]?.message.content;
  if (!content) throw new Error("LM Studio returned empty content");
  return content;
}

async function* lmStudioStreamChat(
  messages: ChatMessage[],
  opts: ChatOptions = {}
): AsyncIterable<StreamChunk> {
  const { baseUrl, model, apiKey } = getLmStudioConfig();
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.7,
      stream: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LM Studio stream error ${res.status}: ${text}`);
  }

  if (!res.body) throw new Error("No response body from LM Studio");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") continue;
      if (!trimmed.startsWith("data: ")) continue;

      try {
        const json = JSON.parse(trimmed.slice(6)) as {
          choices: Array<{
            delta?: { content?: string; reasoning_content?: string };
          }>;
        };
        const delta = json.choices[0]?.delta;
        if (delta?.reasoning_content)
          yield { kind: "reasoning", text: delta.reasoning_content };
        if (delta?.content) yield { kind: "text", text: delta.content };
      } catch {
        // skip malformed SSE lines
      }
    }
  }
}

// ─── Provider: Anthropic ──────────────────────────────────────────────────────

async function anthropicChat(
  messages: ChatMessage[],
  opts: ChatOptions = {}
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

  // Anthropic separates system from messages
  const system = messages.find((m) => m.role === "system")?.content;
  const userMessages = messages.filter((m) => m.role !== "system");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 1024,
      ...(system ? { system } : {}),
      messages: userMessages,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    content: Array<{ type: string; text: string }>;
  };

  const text = data.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("Anthropic returned empty content");
  return text;
}

async function* anthropicStreamChat(
  messages: ChatMessage[],
  opts: ChatOptions = {}
): AsyncIterable<StreamChunk> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const system = messages.find((m) => m.role === "system")?.content;
  const userMessages = messages.filter((m) => m.role !== "system");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 1024,
      stream: true,
      ...(system ? { system } : {}),
      messages: userMessages,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic stream error ${res.status}: ${text}`);
  }

  if (!res.body) throw new Error("No response body from Anthropic");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;

      try {
        const json = JSON.parse(trimmed.slice(6)) as {
          type: string;
          delta?: { type: string; text: string };
        };
        if (
          json.type === "content_block_delta" &&
          json.delta?.type === "text_delta"
        ) {
          yield { kind: "text", text: json.delta.text };
        }
      } catch {
        // skip malformed lines
      }
    }
  }
}

// ─── Unified interface ────────────────────────────────────────────────────────

function getProvider(): "lmstudio" | "anthropic" {
  const p = process.env.LLM_PROVIDER ?? "lmstudio";
  if (p !== "lmstudio" && p !== "anthropic") {
    throw new Error(`Unknown LLM_PROVIDER "${p}". Use "lmstudio" or "anthropic".`);
  }
  return p;
}

export async function chat(
  messages: ChatMessage[],
  opts?: ChatOptions
): Promise<string> {
  return getProvider() === "lmstudio"
    ? lmStudioChat(messages, opts)
    : anthropicChat(messages, opts);
}

export async function* streamChat(
  messages: ChatMessage[],
  opts?: ChatOptions
): AsyncIterable<StreamChunk> {
  const iter =
    getProvider() === "lmstudio"
      ? lmStudioStreamChat(messages, opts)
      : anthropicStreamChat(messages, opts);
  yield* iter;
}

export function getModelName(): string {
  return getProvider() === "lmstudio"
    ? (process.env.LM_STUDIO_MODEL ?? "local-model")
    : (process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6");
}
