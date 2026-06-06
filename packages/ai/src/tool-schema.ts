/**
 * Convert the shared @questvault/tools registry (Zod input schemas) into the
 * provider-neutral tool spec used by the tool-calling loop. The JSON Schema is
 * accepted as-is by both Anthropic (`input_schema`) and the OpenAI-compatible
 * LM Studio API (`function.parameters`).
 */
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolDefinition } from "@questvault/tools";

export type JsonSchema = Record<string, unknown>;

export interface ToolSpec {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export function toToolSpecs(tools: ToolDefinition[]): ToolSpec[] {
  return tools.map((t) => {
    const parameters = zodToJsonSchema(t.inputSchema, {
      $refStrategy: "none",
    }) as JsonSchema;
    // Drop the JSON Schema dialect marker — providers don't need it.
    delete parameters.$schema;
    return { name: t.name, description: t.description, parameters };
  });
}
