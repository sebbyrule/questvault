import { randomUUID } from "node:crypto";

/**
 * The QuestVault domain-event catalog. Names follow `<domain>.<action>`
 * (AGENT.md §Events). These are the events publishers emit to the Redis event
 * bus and the gamification/webhook worker consumes.
 *
 * Webhooks subscribe to a subset of these (see @questvault/db WEBHOOK_EVENTS);
 * the worker maps a domain event to both an XP award and a webhook dispatch.
 */
export const EVENT_TYPES = [
  "ticket.created",
  "ticket.updated",
  "ticket.closed",
  "comment.created",
  "pr.linked",
  "sprint.completed",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/**
 * The envelope every event carries on the bus. Per AGENT.md §Events the minimum
 * fields are `eventId`, `type`, `payload`, `timestamp`, `actorId`. Payloads must
 * be serialisable JSON; consumers must be idempotent (events may be redelivered).
 *
 * `eventId` is the idempotency key — consumers dedupe on it.
 */
export interface DomainEvent<P = Record<string, unknown>> {
  eventId: string;
  type: EventType;
  payload: P;
  timestamp: string; // ISO-8601
  actorId: string | null;
}

/** Build a well-formed event envelope (stamps a fresh id + timestamp). */
export function makeEvent<P extends Record<string, unknown>>(
  type: EventType,
  payload: P,
  actorId: string | null
): DomainEvent<P> {
  return {
    eventId: randomUUID(),
    type,
    payload,
    timestamp: new Date().toISOString(),
    actorId,
  };
}
