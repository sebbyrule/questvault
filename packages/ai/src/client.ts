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
  kind: "reasoning" | "text" | "tool";
  // For "reasoning"/"text" this is the delta. For "tool" it is a JSON string
  // describing tool activity: { name, phase: "call" | "result", ok? }.
  text: string;
}

import type { ToolSpec } from "./tool-schema.js";

/** Executes a tool by name with parsed arguments; returns JSON-serialisable output. */
export type ToolExecutor = (name: string, args: unknown) => Promise<unknown>;

const MAX_TOOL_ITERATIONS = 6;

function toolChunk(name: string, phase: "call" | "result", ok?: boolean): StreamChunk {
  return { kind: "tool", text: JSON.stringify({ name, phase, ...(ok === undefined ? {} : { ok }) }) };
}

/** Parse an SSE response body, yielding each `data:` payload as parsed JSON. */
async function* sseEvents(
  body: ReadableStream<Uint8Array>
): AsyncIterable<Record<string, unknown>> {
  const reader = body.getReader();
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
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        yield JSON.parse(payload);
      } catch {
        // skip malformed SSE lines
      }
    }
  }
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

// ─── Tool-calling loop ──────────────────────────────────────────────────────────
//
// Provider-specific agentic loops: stream a model turn, and if it requests tools,
// execute them via the registry and feed results back until the model answers with
// no further tool calls (or MAX_TOOL_ITERATIONS is hit). Models that ignore the
// `tools` parameter simply never emit tool calls — the loop degrades to plain chat.
//
// Provider message arrays use `any` because each provider has a distinct,
// untyped-here wire shape (OpenAI tool_calls vs Anthropic content blocks).
/* eslint-disable @typescript-eslint/no-explicit-any */

async function* lmStudioToolLoop(
  messages: ChatMessage[],
  tools: ToolSpec[],
  execute: ToolExecutor,
  opts: ChatOptions
): AsyncIterable<StreamChunk> {
  const { baseUrl, model, apiKey } = getLmStudioConfig();
  const oaiTools = tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  const convo: any[] = messages.map((m) => ({ role: m.role, content: m.content }));

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: convo,
        tools: oaiTools,
        max_tokens: opts.maxTokens ?? 2048,
        temperature: opts.temperature ?? 0.7,
        stream: true,
      }),
    });
    if (!res.ok) throw new Error(`LM Studio error ${res.status}: ${await res.text()}`);
    if (!res.body) throw new Error("No response body from LM Studio");

    const callsByIndex = new Map<number, { id: string; name: string; args: string }>();
    let assistantText = "";

    for await (const json of sseEvents(res.body)) {
      const choice = (json as any).choices?.[0];
      const delta = choice?.delta;
      if (!delta) continue;
      if (delta.reasoning_content) yield { kind: "reasoning", text: delta.reasoning_content };
      if (delta.content) {
        assistantText += delta.content;
        yield { kind: "text", text: delta.content };
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          const cur = callsByIndex.get(idx) ?? { id: "", name: "", args: "" };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name = tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          callsByIndex.set(idx, cur);
        }
      }
    }

    const calls = [...callsByIndex.values()].filter((c) => c.name);
    if (calls.length === 0) return; // final answer already streamed

    convo.push({
      role: "assistant",
      content: assistantText || null,
      tool_calls: calls.map((c) => ({
        id: c.id,
        type: "function",
        function: { name: c.name, arguments: c.args || "{}" },
      })),
    });

    for (const c of calls) {
      yield toolChunk(c.name, "call");
      const { content, ok } = await runTool(execute, c.name, c.args);
      yield toolChunk(c.name, "result", ok);
      convo.push({ role: "tool", tool_call_id: c.id, content });
    }
  }
}

async function* anthropicToolLoop(
  messages: ChatMessage[],
  tools: ToolSpec[],
  execute: ToolExecutor,
  opts: ChatOptions
): AsyncIterable<StreamChunk> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

  const system = messages.find((m) => m.role === "system")?.content;
  const convo: any[] = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));
  const aTools = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 2048,
        stream: true,
        ...(system ? { system } : {}),
        messages: convo,
        tools: aTools,
      }),
    });
    if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
    if (!res.body) throw new Error("No response body from Anthropic");

    // Assemble content blocks by index as they stream.
    const blocks = new Map<number, { type: string; text: string; id: string; name: string; partial: string }>();
    for await (const json of sseEvents(res.body)) {
      const type = (json as any).type;
      if (type === "content_block_start") {
        const cb = (json as any).content_block;
        blocks.set((json as any).index, {
          type: cb.type,
          text: "",
          id: cb.id ?? "",
          name: cb.name ?? "",
          partial: "",
        });
      } else if (type === "content_block_delta") {
        const st = blocks.get((json as any).index);
        if (!st) continue;
        const delta = (json as any).delta;
        if (delta.type === "text_delta") {
          st.text += delta.text;
          yield { kind: "text", text: delta.text };
        } else if (delta.type === "thinking_delta") {
          yield { kind: "reasoning", text: delta.thinking };
        } else if (delta.type === "input_json_delta") {
          st.partial += delta.partial_json;
        }
      }
    }

    const ordered = [...blocks.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
    const toolUses = ordered.filter((b) => b.type === "tool_use");
    if (toolUses.length === 0) return; // final answer already streamed

    // Rebuild the assistant turn (text + tool_use blocks) exactly for the next request.
    const assistantContent: any[] = [];
    for (const b of ordered) {
      if (b.type === "text" && b.text) {
        assistantContent.push({ type: "text", text: b.text });
      } else if (b.type === "tool_use") {
        let input: unknown = {};
        try {
          input = b.partial ? JSON.parse(b.partial) : {};
        } catch {
          input = {};
        }
        assistantContent.push({ type: "tool_use", id: b.id, name: b.name, input });
      }
    }
    convo.push({ role: "assistant", content: assistantContent });

    const toolResults: any[] = [];
    for (const tu of toolUses) {
      yield toolChunk(tu.name, "call");
      const { content, ok } = await runTool(execute, tu.name, tu.partial);
      yield toolChunk(tu.name, "result", ok);
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content,
        ...(ok ? {} : { is_error: true }),
      });
    }
    convo.push({ role: "user", content: toolResults });
  }
}

/** Parse args JSON, execute the tool, and serialise the result (or error) to a string. */
async function runTool(
  execute: ToolExecutor,
  name: string,
  argsJson: string
): Promise<{ content: string; ok: boolean }> {
  let args: unknown = {};
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch {
    return { content: JSON.stringify({ error: "Invalid tool arguments JSON" }), ok: false };
  }
  try {
    const result = await execute(name, args);
    return { content: JSON.stringify(result), ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tool execution failed";
    return { content: JSON.stringify({ error: message }), ok: false };
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Stream a coach/agent response that can call tools. Yields reasoning/text deltas
 * plus `tool` activity chunks. Dispatches to the configured provider.
 */
export function streamChatWithTools(
  messages: ChatMessage[],
  tools: ToolSpec[],
  execute: ToolExecutor,
  opts: ChatOptions = {}
): AsyncIterable<StreamChunk> {
  return getProvider() === "lmstudio"
    ? lmStudioToolLoop(messages, tools, execute, opts)
    : anthropicToolLoop(messages, tools, execute, opts);
}
