export { db } from "./client";
export type { Database } from "./client";
export * from "./schema/index";
export { getAppSettings, updateAppSettings } from "./settings";
export { embed, embeddingsEnabled, toVectorLiteral } from "./embeddings";
export { hashAgentToken, isToolAllowed, resolveAgentToken } from "./agents";
export {
  WEBHOOK_EVENTS,
  MAX_ATTEMPTS,
  signPayload,
  isEventSubscribed,
  backoffMs,
  enqueueWebhooks,
  processDueDeliveries,
  dispatchTest,
  redeliverDelivery,
  type WebhookEventType,
  type WebhookEvent,
} from "./webhooks";

// Re-export drizzle query operators so app code can compose queries without a
// direct drizzle-orm dependency (AGENT.md: "Never import drizzle directly in
// app code. All DB access goes through packages/db").
export {
  eq, ne, gt, gte, lt, lte,
  and, or, not,
  isNull, isNotNull,
  inArray, notInArray,
  like, ilike, between,
  asc, desc,
  sql,
  count, countDistinct, sum, avg, min, max,
  getTableColumns,
} from "drizzle-orm";
