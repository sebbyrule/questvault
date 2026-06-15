/**
 * Dev seed — populates the database with enough data to test the full app
 * without connecting to any external service.
 *
 * Run: pnpm db:seed
 *
 * Safe to re-run: clears all tables first (dev only).
 */

import "./load-env.js"; // must run before ./client.js reads DATABASE_URL
import { db } from "./client.js";
import {
  users, projects, projectMembers, sprints,
  tickets, labels, ticketLabels, badges, userBadges, agentTokens,
} from "./schema/index.js";
import { hashAgentToken } from "./agents.js";

// A fixed example read-only agent token so dev can try scoped MCP access.
const EXAMPLE_AGENT_TOKEN = "qv_agent_example_readonly";

async function seed() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Never run the seed script in production.");
  }

  console.log("🌱 Seeding database…");

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // ── Wipe existing dev data (order matters for FK constraints) ──────────────
  await db.delete(agentTokens);
  await db.delete(ticketLabels);
  await db.delete(userBadges);
  await db.delete(tickets);
  await db.delete(labels);
  await db.delete(sprints);
  await db.delete(projectMembers);
  await db.delete(projects);
  await db.delete(badges);
  await db.delete(users);
  console.log("  ✓ Cleared existing data");

  // ── Users ──────────────────────────────────────────────────────────────────
  const [alice, bob, carol] = await db
    .insert(users)
    .values([
      {
        id: "00000000-0000-0000-0000-000000000001",
        email: "alice@example.com",
        displayName: "Alice Chen",
        // Workspace admin so the seeded dev login can reach Settings / Members.
        role: "admin" as const,
        xpTotal: 340,
        streakDays: 5,
        // Active yesterday so today's first action extends the streak (rather
        // than resetting it — a null last_active_at reads as "no prior day").
        lastActiveAt: yesterday,
      },
      {
        id: "00000000-0000-0000-0000-000000000002",
        email: "bob@example.com",
        displayName: "Bob Torres",
        xpTotal: 120,
        streakDays: 2,
        lastActiveAt: yesterday,
      },
      {
        id: "00000000-0000-0000-0000-000000000003",
        email: "carol@example.com",
        displayName: "Carol Kim",
        xpTotal: 85,
        streakDays: 0,
      },
      {
        // System account used as the reporter/author for MCP agent actions.
        // Its id matches MCP_AGENT_REPORTER_ID in .env so create_ticket works
        // out of the box. Excluded from the leaderboard (internal email domain).
        id: "00000000-0000-0000-0000-000000000000",
        email: "agent@questvault.internal",
        displayName: "QuestVault Agent",
      },
    ])
    .returning();

  console.log("  ✓ Users: alice, bob, carol, agent");

  // ── Project ────────────────────────────────────────────────────────────────
  const [project] = await db
    .insert(projects)
    .values({
      id: "00000000-0000-0000-0000-000000000010",
      name: "QuestVault",
      slug: "questvault",
      description: "The app itself — dogfooding from day one.",
      iconEmoji: "⚔️",
      color: "#534AB7",
    })
    .returning();

  await db.insert(projectMembers).values([
    { projectId: project!.id, userId: alice!.id, role: "owner" },
    { projectId: project!.id, userId: bob!.id,   role: "member" },
    { projectId: project!.id, userId: carol!.id,  role: "member" },
  ]);

  console.log("  ✓ Project: QuestVault");

  // ── Sprint ─────────────────────────────────────────────────────────────────
  const now = new Date();
  const sprintEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 days

  const [sprint] = await db
    .insert(sprints)
    .values({
      id: "00000000-0000-0000-0000-000000000020",
      projectId: project!.id,
      name: "Sprint 1",
      goal: "Ship the core ticket + Kanban MVP",
      status: "active",
      startDate: now,
      endDate: sprintEnd,
    })
    .returning();

  console.log("  ✓ Sprint 1 (active, ends in 7 days)");

  // ── Labels ─────────────────────────────────────────────────────────────────
  const [labelBug, labelFeat, labelDx] = await db
    .insert(labels)
    .values([
      { id: "00000000-0000-0000-0000-000000000031", projectId: project!.id, name: "bug",     color: "#E24B4A" },
      { id: "00000000-0000-0000-0000-000000000032", projectId: project!.id, name: "feature",  color: "#534AB7" },
      { id: "00000000-0000-0000-0000-000000000033", projectId: project!.id, name: "dx",       color: "#0F6E56" },
    ])
    .returning();

  // ── Tickets ────────────────────────────────────────────────────────────────
  const ticketRows = await db
    .insert(tickets)
    .values([
      // ── Sprint tickets ──────────────────────────────────────────────────
      {
        number: 1,
        projectId: project!.id,
        sprintId: sprint!.id,
        title: "Kanban board — drag and drop columns",
        description: "Implement @dnd-kit based Kanban board. Columns: Backlog, Todo, In Progress, In Review, Done. Cards should be draggable between columns and the status should update optimistically.",
        status: "in_progress" as const,
        priority: "p1" as const,
        assigneeId: alice!.id,
        reporterId: alice!.id,
        storyPoints: 8,
        rank: "0|a:",
      },
      {
        number: 2,
        projectId: project!.id,
        sprintId: sprint!.id,
        title: "Ticket detail modal",
        description: "Full-screen modal showing ticket title, description (rendered Markdown), status, priority, assignee, labels, story points, comments, and history.",
        status: "todo" as const,
        priority: "p1" as const,
        assigneeId: bob!.id,
        reporterId: alice!.id,
        storyPoints: 5,
        rank: "0|b:",
      },
      {
        number: 3,
        projectId: project!.id,
        sprintId: sprint!.id,
        title: "XP toast notification on ticket close",
        description: "When a ticket is moved to Done, show a brief animated toast with the XP earned and current streak. Use the gamification package to calculate the award.",
        status: "todo" as const,
        priority: "p2" as const,
        assigneeId: carol!.id,
        reporterId: alice!.id,
        storyPoints: 3,
        rank: "0|c:",
      },
      {
        number: 4,
        projectId: project!.id,
        sprintId: sprint!.id,
        title: "Fix: ticket number auto-increment race condition",
        description: "Under concurrent inserts the ticket number can be duplicated. Replace MAX(number)+1 with a Postgres sequence per project.",
        status: "in_review" as const,
        priority: "p0" as const,
        assigneeId: alice!.id,
        reporterId: bob!.id,
        storyPoints: 2,
        rank: "0|d:",
      },
      // ── Backlog tickets ─────────────────────────────────────────────────
      {
        number: 5,
        projectId: project!.id,
        sprintId: null,
        title: "AI coach chat UI",
        description: "Chat panel on the right side of the board. Uses the /api/v1/ai/chat SSE endpoint. Show typing indicator while streaming.",
        status: "backlog" as const,
        priority: "p2" as const,
        assigneeId: null,
        reporterId: alice!.id,
        storyPoints: 8,
        rank: "0|e:",
      },
      {
        number: 6,
        projectId: project!.id,
        sprintId: null,
        title: "Leaderboard page",
        description: "Team leaderboard showing rank, avatar, display name, level, XP total, and badge count. Updates every 60s via polling.",
        status: "backlog" as const,
        priority: "p3" as const,
        assigneeId: null,
        reporterId: bob!.id,
        storyPoints: 5,
        rank: "0|f:",
      },
      {
        number: 7,
        projectId: project!.id,
        sprintId: null,
        title: "Semantic ticket search",
        description: "Search bar that queries the pgvector HNSW index for semantically similar tickets. Falls back to Postgres full-text if USE_EMBEDDINGS=false.",
        status: "backlog" as const,
        priority: "p2" as const,
        assigneeId: null,
        reporterId: alice!.id,
        storyPoints: 5,
        rank: "0|g:",
      },
    ])
    .returning();

  // ── Ticket labels ──────────────────────────────────────────────────────────
  await db.insert(ticketLabels).values([
    { ticketId: ticketRows[0]!.id, labelId: labelFeat!.id },
    { ticketId: ticketRows[1]!.id, labelId: labelFeat!.id },
    { ticketId: ticketRows[2]!.id, labelId: labelFeat!.id },
    { ticketId: ticketRows[3]!.id, labelId: labelBug!.id },
    { ticketId: ticketRows[4]!.id, labelId: labelFeat!.id },
    { ticketId: ticketRows[6]!.id, labelId: labelDx!.id },
  ]);

  console.log(`  ✓ Tickets: ${ticketRows.length} created (4 in sprint, 3 in backlog)`);

  // ── Badges ─────────────────────────────────────────────────────────────────
  const [firstTicketBadge, streakBadge] = await db
    .insert(badges)
    .values([
      {
        slug: "first-ticket",
        name: "First Quest",
        description: "Created your first ticket.",
        iconEmoji: "🗡️",
        category: "milestone" as const,
        xpReward: 25,
      },
      {
        slug: "streak-5",
        name: "On a Roll",
        description: "Maintained a 5-day activity streak.",
        iconEmoji: "🔥",
        category: "streak" as const,
        xpReward: 50,
      },
    ])
    .returning();

  await db.insert(userBadges).values([
    { userId: alice!.id, badgeId: firstTicketBadge!.id },
    { userId: alice!.id, badgeId: streakBadge!.id },
    { userId: bob!.id,   badgeId: firstTicketBadge!.id },
  ]);

  console.log("  ✓ Badges seeded; alice has 2, bob has 1");

  // ── Example agent token (read-only) ────────────────────────────────────────
  const agentUser = "00000000-0000-0000-0000-000000000000";
  await db.insert(agentTokens).values({
    name: "Example Agent (read-only)",
    tokenHash: hashAgentToken(EXAMPLE_AGENT_TOKEN),
    scopes: ["list_tickets", "get_ticket", "search_tickets"],
    createdBy: alice!.id,
    reporterId: agentUser,
  });
  console.log("  ✓ Example agent token seeded (read-only)");

  console.log("\n✅ Seed complete!");
  console.log("\nDev login credentials:");
  console.log("  Email:    alice@example.com  (or any email)");
  console.log("  Password: devpass");
  console.log("\nDev API token:");
  console.log('  Authorization: Bearer dev:alice@example.com');
  console.log("\nTest the API:");
  console.log('  curl -H "Authorization: Bearer dev:alice@example.com" \\');
  console.log('       http://localhost:3001/api/v1/projects/00000000-0000-0000-0000-000000000010/tickets');
  console.log("\nMCP tokens:");
  console.log(`  Shared (all tools):  Bearer ${process.env.MCP_AGENT_SECRET ?? "dev_mcp_secret"}`);
  console.log(`  Example (read-only): Bearer ${EXAMPLE_AGENT_TOKEN}`);

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
