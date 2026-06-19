/**
 * Server-side data access for the web app. Reads go straight through
 * @questvault/db (never the raw drizzle client — operators are re-exported
 * from the db package per AGENT.md conventions).
 */
import { db, eq, ne, and, desc, asc, count, inArray, gt, isNull } from "@questvault/db";
import {
  projects,
  tickets,
  users,
  sprints,
  labels,
  ticketLabels,
  projectMembers,
  userBadges,
  invites,
  agentTokens,
  webhooks,
  webhookDeliveries,
} from "@questvault/db/schema";
import { auth } from "./auth";
import { hashToken, isInviteUsable } from "./auth-rules";
import type { TicketStatus, TicketPriority } from "./format";

export type LabelChip = { id: string; name: string; color: string };

export type Person = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

export type BoardTicket = {
  id: string;
  number: number;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  storyPoints: number | null;
  assignee: { id: string; displayName: string; avatarUrl: string | null } | null;
  labels: LabelChip[];
};

export async function getPrimaryProject() {
  return db.query.projects.findFirst({
    orderBy: (p, { asc }) => [asc(p.createdAt)],
  });
}

export async function getProjectBySlug(slug: string) {
  return db.query.projects.findFirst({
    where: eq(projects.slug, slug),
  });
}

export type ProjectOption = {
  id: string;
  name: string;
  slug: string;
  iconEmoji: string | null;
};

/** Lightweight list of projects for the board's project switcher. */
export async function getProjectOptions(): Promise<ProjectOption[]> {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      iconEmoji: projects.iconEmoji,
    })
    .from(projects)
    .orderBy(asc(projects.createdAt));
}

/** All non-archived tickets for a project, with assignee + labels attached. */
export async function getBoardTickets(projectId: string): Promise<BoardTicket[]> {
  const rows = await db.query.tickets.findMany({
    where: and(eq(tickets.projectId, projectId), ne(tickets.status, "archived")),
    columns: {
      id: true,
      number: true,
      title: true,
      status: true,
      priority: true,
      storyPoints: true,
    },
    with: {
      assignee: { columns: { id: true, displayName: true, avatarUrl: true } },
    },
    orderBy: (t, { asc }) => [asc(t.rank)],
  });

  const labelsByTicket = new Map<string, LabelChip[]>();
  if (rows.length > 0) {
    const labelRows = await db
      .select({
        ticketId: ticketLabels.ticketId,
        id: labels.id,
        name: labels.name,
        color: labels.color,
      })
      .from(ticketLabels)
      .innerJoin(labels, eq(ticketLabels.labelId, labels.id))
      .where(inArray(ticketLabels.ticketId, rows.map((r) => r.id)));

    for (const l of labelRows) {
      const list = labelsByTicket.get(l.ticketId) ?? [];
      list.push({ id: l.id, name: l.name, color: l.color });
      labelsByTicket.set(l.ticketId, list);
    }
  }

  return rows.map((r) => ({
    ...r,
    status: r.status as TicketStatus,
    priority: r.priority as TicketPriority,
    labels: labelsByTicket.get(r.id) ?? [],
  }));
}

export async function getActiveSprint(projectId: string) {
  return db.query.sprints.findFirst({
    where: and(eq(sprints.projectId, projectId), eq(sprints.status, "active")),
  });
}

/** Ticket counts keyed by status for a project. */
export async function getStatusCounts(
  projectId: string
): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: tickets.status, c: count() })
    .from(tickets)
    .where(eq(tickets.projectId, projectId))
    .groupBy(tickets.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.c]));
}

export type LeaderRow = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  xpTotal: number;
  streakDays: number;
  badges: number;
};

/** Users ranked by lifetime XP, with badge counts. */
export async function getLeaderboard(): Promise<LeaderRow[]> {
  const us = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      xpTotal: users.xpTotal,
      streakDays: users.streakDays,
    })
    .from(users)
    // Exclude system accounts (e.g. the MCP agent) from the leaderboard.
    .where(ne(users.email, "agent@questvault.internal"))
    .orderBy(desc(users.xpTotal));

  const badgeRows = await db
    .select({ userId: userBadges.userId, c: count() })
    .from(userBadges)
    .groupBy(userBadges.userId);
  const badgeCount = new Map(badgeRows.map((b) => [b.userId, b.c]));

  return us.map((u) => ({ ...u, badges: badgeCount.get(u.id) ?? 0 }));
}

export type ProjectCard = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  iconEmoji: string | null;
  color: string | null;
  members: number;
  total: number;
  done: number;
};

/** All projects with member counts and ticket totals. */
export async function getProjectCards(): Promise<ProjectCard[]> {
  const ps = await db.query.projects.findMany({
    orderBy: (p, { asc }) => [asc(p.createdAt)],
  });

  const memberRows = await db
    .select({ projectId: projectMembers.projectId, c: count() })
    .from(projectMembers)
    .groupBy(projectMembers.projectId);
  const memberCount = new Map(memberRows.map((m) => [m.projectId, m.c]));

  const ticketRows = await db
    .select({ projectId: tickets.projectId, status: tickets.status, c: count() })
    .from(tickets)
    .groupBy(tickets.projectId, tickets.status);
  const totals = new Map<string, { total: number; done: number }>();
  for (const t of ticketRows) {
    const cur = totals.get(t.projectId) ?? { total: 0, done: 0 };
    cur.total += t.c;
    if (t.status === "done") cur.done += t.c;
    totals.set(t.projectId, cur);
  }

  return ps.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    iconEmoji: p.iconEmoji,
    color: p.color,
    members: memberCount.get(p.id) ?? 0,
    total: totals.get(p.id)?.total ?? 0,
    done: totals.get(p.id)?.done ?? 0,
  }));
}

/**
 * The acting user for the web app, resolved from the Auth.js session. Returns
 * null when there is no authenticated session (the (app) layout + middleware
 * redirect to /auth/login in that case).
 */
export async function getCurrentUser(): Promise<Person | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;

  const u = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return u[0] ?? null;
}

/** Internal system account — excluded from "real user" counts. */
const SYSTEM_EMAIL = "agent@questvault.internal";

/**
 * True once at least one real (non-system) user exists. Drives the first-run
 * gate: registration is open only while this is false; afterwards visitors get
 * login only. Mirrors the leaderboard's system-account exclusion.
 */
export async function adminExists(): Promise<boolean> {
  const [row] = await db
    .select({ c: count() })
    .from(users)
    .where(ne(users.email, SYSTEM_EMAIL));
  return (row?.c ?? 0) > 0;
}

export type SessionAccount = { id: string; role: string; isActive: boolean };

/**
 * The current session user's account essentials (role + active flag), or null
 * when signed out or the row no longer exists. Drives admin gating and the
 * "deactivated → bounce to login" check in the (app) layout.
 */
export async function getSessionAccount(): Promise<SessionAccount | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const [u] = await db
    .select({ id: users.id, role: users.role, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return u ?? null;
}

// ─── Members & invites ────────────────────────────────────────────────────────

export type MemberRow = {
  id: string;
  displayName: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
};

/** All real (non-system) users for the Members admin page. */
export async function listMembers(): Promise<MemberRow[]> {
  return db
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(ne(users.email, SYSTEM_EMAIL))
    .orderBy(asc(users.displayName));
}

export type PendingInvite = {
  id: string;
  email: string;
  role: string;
  expiresAt: Date;
  invitedBy: string | null;
};

/** Outstanding invites (unaccepted and not expired). */
export async function listPendingInvites(): Promise<PendingInvite[]> {
  const rows = await db
    .select({
      id: invites.id,
      email: invites.email,
      role: invites.role,
      expiresAt: invites.expiresAt,
      inviterName: users.displayName,
    })
    .from(invites)
    .leftJoin(users, eq(invites.invitedBy, users.id))
    .where(and(isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())))
    .orderBy(desc(invites.createdAt));
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    expiresAt: r.expiresAt,
    invitedBy: r.inviterName,
  }));
}

export type AgentTokenRow = {
  id: string;
  name: string;
  scopes: string[];
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

/** All agent tokens for the admin Agents page (newest first; no hashes). */
export async function listAgentTokens(): Promise<AgentTokenRow[]> {
  return db
    .select({
      id: agentTokens.id,
      name: agentTokens.name,
      scopes: agentTokens.scopes,
      lastUsedAt: agentTokens.lastUsedAt,
      revokedAt: agentTokens.revokedAt,
      createdAt: agentTokens.createdAt,
    })
    .from(agentTokens)
    .orderBy(desc(agentTokens.createdAt));
}

export type WebhookRow = {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  createdAt: Date;
};

/** All webhook subscriptions for the admin page (newest first). */
export async function listWebhooks(): Promise<WebhookRow[]> {
  return db
    .select({
      id: webhooks.id,
      name: webhooks.name,
      url: webhooks.url,
      secret: webhooks.secret,
      events: webhooks.events,
      isActive: webhooks.isActive,
      createdAt: webhooks.createdAt,
    })
    .from(webhooks)
    .orderBy(desc(webhooks.createdAt));
}

export type DeliveryRow = {
  id: string;
  webhookName: string | null;
  eventType: string;
  status: string;
  attempts: number;
  responseStatus: number | null;
  error: string | null;
  createdAt: Date;
};

/** Recent webhook deliveries across all hooks (for the admin log view). */
export async function listRecentDeliveries(limit = 20): Promise<DeliveryRow[]> {
  return db
    .select({
      id: webhookDeliveries.id,
      webhookName: webhooks.name,
      eventType: webhookDeliveries.eventType,
      status: webhookDeliveries.status,
      attempts: webhookDeliveries.attempts,
      responseStatus: webhookDeliveries.responseStatus,
      error: webhookDeliveries.error,
      createdAt: webhookDeliveries.createdAt,
    })
    .from(webhookDeliveries)
    .leftJoin(webhooks, eq(webhookDeliveries.webhookId, webhooks.id))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);
}

/** Resolve a raw invite token to a valid (pending, unexpired) invite, else null. */
export async function getInviteByToken(rawToken: string) {
  if (!rawToken) return null;
  const [invite] = await db
    .select()
    .from(invites)
    .where(eq(invites.tokenHash, hashToken(rawToken)))
    .limit(1);
  if (!invite) return null;
  return isInviteUsable(invite) ? invite : null;
}

// ─── Ticket detail ──────────────────────────────────────────────────────────

export type TicketComment = {
  id: string;
  body: string;
  isEdited: boolean;
  createdAt: Date;
  author: Person | null;
  agentId: string | null;
};

export type TicketHistoryEntry = {
  id: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: Date;
  actor: Person | null;
  agentId: string | null;
};

export type TicketDetail = {
  id: string;
  number: number;
  projectId: string;
  projectSlug: string;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  storyPoints: number | null;
  dueDate: Date | null;
  prUrl: string | null;
  createdAt: Date;
  closedAt: Date | null;
  assignee: Person | null;
  reporter: Person | null;
  sprint: { id: string; name: string } | null;
  labels: LabelChip[];
  comments: TicketComment[];
  history: TicketHistoryEntry[];
};

const personColumns = { id: true, displayName: true, avatarUrl: true } as const;

/** Full ticket detail: properties, assignee/reporter/sprint, labels, comments, history. */
export async function getTicketDetail(
  ticketId: string
): Promise<TicketDetail | null> {
  const row = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
    columns: { embedding: false },
    with: {
      project: { columns: { slug: true } },
      assignee: { columns: personColumns },
      reporter: { columns: personColumns },
      sprint: { columns: { id: true, name: true } },
      comments: {
        with: { author: { columns: personColumns } },
        orderBy: (c, { asc }) => [asc(c.createdAt)],
      },
      history: {
        with: { actor: { columns: personColumns } },
        orderBy: (h, { desc }) => [desc(h.createdAt)],
      },
    },
  });
  if (!row) return null;

  const labelRows = await db
    .select({ id: labels.id, name: labels.name, color: labels.color })
    .from(ticketLabels)
    .innerJoin(labels, eq(ticketLabels.labelId, labels.id))
    .where(eq(ticketLabels.ticketId, ticketId));

  return {
    id: row.id,
    number: row.number,
    projectId: row.projectId,
    projectSlug: row.project.slug,
    title: row.title,
    description: row.description,
    status: row.status as TicketStatus,
    priority: row.priority as TicketPriority,
    storyPoints: row.storyPoints,
    dueDate: row.dueDate,
    prUrl: row.prUrl,
    createdAt: row.createdAt,
    closedAt: row.closedAt,
    assignee: row.assignee,
    reporter: row.reporter,
    sprint: row.sprint,
    labels: labelRows,
    comments: row.comments.map((c) => ({
      id: c.id,
      body: c.body,
      isEdited: c.isEdited,
      createdAt: c.createdAt,
      author: c.author,
      agentId: c.agentId,
    })),
    history: row.history.map((h) => ({
      id: h.id,
      field: h.field,
      oldValue: h.oldValue,
      newValue: h.newValue,
      createdAt: h.createdAt,
      actor: h.actor,
      agentId: h.agentId,
    })),
  };
}

/** Members of a project (for assignee selection). Falls back to all users if none. */
export async function getProjectMembers(projectId: string): Promise<Person[]> {
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(users.displayName));

  if (rows.length > 0) return rows;

  return db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .orderBy(asc(users.displayName));
}

/** All labels defined on a project (for label assignment). */
export async function getProjectLabels(projectId: string): Promise<LabelChip[]> {
  return db
    .select({ id: labels.id, name: labels.name, color: labels.color })
    .from(labels)
    .where(eq(labels.projectId, projectId))
    .orderBy(asc(labels.name));
}

export type SprintOption = { id: string; name: string; status: string };

/** Non-cancelled sprints for a project (for the sprint selector). */
export async function getProjectSprints(projectId: string): Promise<SprintOption[]> {
  return db
    .select({ id: sprints.id, name: sprints.name, status: sprints.status })
    .from(sprints)
    .where(and(eq(sprints.projectId, projectId), ne(sprints.status, "cancelled")))
    .orderBy(desc(sprints.createdAt));
}
