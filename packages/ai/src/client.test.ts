import { describe, it, expect, vi, afterEach } from "vitest";
import { streamChatWithTools, type StreamChunk } from "./client.js";
import type { ToolSpec } from "./tool-schema.js";

// Build a fake SSE Response from raw `data:` lines.
function sseResponse(lines: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const line of lines) controller.enqueue(enc.encode(line));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

const tools: ToolSpec[] = [
  {
    name: "create_ticket",
    description: "Create a ticket",
    parameters: {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
    },
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("streamChatWithTools (lmstudio provider)", () => {
  it("executes a requested tool, then streams the final answer", async () => {
    process.env.LLM_PROVIDER = "lmstudio";

    // Turn 1: model asks to call create_ticket. Turn 2: final text answer.
    const turn1 = {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "call_1",
                function: { name: "create_ticket", arguments: '{"title":"x"}' },
              },
            ],
          },
        },
      ],
    };
    const turn2 = { choices: [{ delta: { content: "Created QV-9." } }] };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sseResponse([`data: ${JSON.stringify(turn1)}\n`]))
      .mockResolvedValueOnce(sseResponse([`data: ${JSON.stringify(turn2)}\n`]));
    vi.stubGlobal("fetch", fetchMock);

    const execute = vi.fn(async (name: string, args: unknown) => ({
      ok: true,
      name,
      args,
    }));

    const chunks: StreamChunk[] = [];
    for await (const c of streamChatWithTools(
      [{ role: "user", content: "create a ticket titled x" }],
      tools,
      execute
    )) {
      chunks.push(c);
    }

    // The tool ran with parsed arguments.
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith("create_ticket", { title: "x" });

    // Two model turns were requested (tool turn + final answer).
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Chunk sequence: a tool "call", a tool "result", then the final text.
    const toolEvents = chunks
      .filter((c) => c.kind === "tool")
      .map((c) => JSON.parse(c.text) as { name: string; phase: string; ok?: boolean });
    expect(toolEvents).toEqual([
      { name: "create_ticket", phase: "call" },
      { name: "create_ticket", phase: "result", ok: true },
    ]);

    const text = chunks
      .filter((c) => c.kind === "text")
      .map((c) => c.text)
      .join("");
    expect(text).toBe("Created QV-9.");
  });

  it("degrades to plain chat when the model emits no tool calls", async () => {
    process.env.LLM_PROVIDER = "lmstudio";
    const turn = { choices: [{ delta: { content: "Just a plain answer." } }] };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sseResponse([`data: ${JSON.stringify(turn)}\n`]));
    vi.stubGlobal("fetch", fetchMock);

    const execute = vi.fn(async () => ({}));
    const chunks: StreamChunk[] = [];
    for await (const c of streamChatWithTools(
      [{ role: "user", content: "hi" }],
      tools,
      execute
    )) {
      chunks.push(c);
    }

    expect(execute).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(chunks).toEqual([{ kind: "text", text: "Just a plain answer." }]);
  });
});
