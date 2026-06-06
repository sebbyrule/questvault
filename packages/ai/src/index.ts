export { chat, streamChat, streamChatWithTools, getModelName } from "./client.js";
export type { ChatMessage, ChatOptions, StreamChunk, ToolExecutor } from "./client.js";
export { toToolSpecs } from "./tool-schema.js";
export type { ToolSpec } from "./tool-schema.js";
export { buildCoachContext } from "./context.js";
export { streamCoachResponse } from "./coach.js";
export { embed, embeddingsEnabled } from "./embeddings.js";
