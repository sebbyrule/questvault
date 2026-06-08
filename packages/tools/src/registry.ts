import type { ToolDefinition } from "./types";
import { listTicketsTool } from "./defs/list-tickets";
import { getTicketTool } from "./defs/get-ticket";
import { createTicketTool } from "./defs/create-ticket";
import { updateTicketTool } from "./defs/update-ticket";
import { closeTicketTool } from "./defs/close-ticket";
import { addCommentTool } from "./defs/add-comment";
import { listSprintsTool } from "./defs/list-sprints";

/**
 * The canonical tool set, shared by every surface (MCP server, AI coach).
 * Add a new tool by creating a file under `defs/` and appending it here — both
 * surfaces pick it up automatically.
 */
export const allTools: ToolDefinition[] = [
  listTicketsTool,
  getTicketTool,
  createTicketTool,
  updateTicketTool,
  closeTicketTool,
  addCommentTool,
  listSprintsTool,
];

export const toolsByName: Record<string, ToolDefinition> = Object.fromEntries(
  allTools.map((t) => [t.name, t])
);
