import type { ToolDefinition } from "./types.js";
import { listTicketsTool } from "./defs/list-tickets.js";
import { getTicketTool } from "./defs/get-ticket.js";
import { createTicketTool } from "./defs/create-ticket.js";
import { updateTicketTool } from "./defs/update-ticket.js";
import { closeTicketTool } from "./defs/close-ticket.js";
import { addCommentTool } from "./defs/add-comment.js";
import { listSprintsTool } from "./defs/list-sprints.js";

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
