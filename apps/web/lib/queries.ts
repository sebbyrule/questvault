/**
 * Server-side data access for the web app. Reads go straight through
 * @questvault/db (never the raw drizzle client — operators are re-exported
 * from the db package per AGENT.md conventions).
 */
import { db, eq, ne, and, desc, asc, count, inArray } from "@questvault/db";
import {
  projects,
  tickets,
  users,
  sprints,
  labels,
  ticketLabels,
  projectMembers,
  userBadges,
} from "@questvault/db/schema";
import type { TicketStatus, TicketPriority } from "./format";

export type LabelChip = { id: string; name: string; color: string };

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

/** First user, used as a default reporter for dev-created tickets. */
export async function getDefaultReporterId(): Promise<string | null> {
  const u = await db
    .select({ id: users.id })
    .from(users)
    .orderBy(asc(users.createdAt))
    .limit(1);
  return u[0]?.id ?? null;
}
