# AGENT.md — QuestVault

> This file is read by AI coding agents (Claude Code, etc.) at the start of every session.
> It describes the project, repo layout, conventions, and the MCP tools available for autonomous work.

---

## What is QuestVault?

QuestVault is a gamified, AI-native project management platform. Think Jira with XP, achievement badges, streaks, and an LLM coach that knows your actual work. It also exposes a first-class MCP server so agents like you can read, create, and close tickets without leaving the terminal.

**Stack:** Next.js 14 (App Router) · TypeScript · PostgreSQL 16 + pgvector · Redis 7 · Drizzle ORM · Auth.js v5 · Anthropic Claude API · MCP Server SDK · React Native + Expo · Tailwind CSS

---

## Repo Layout

```
questvault/
├── apps/
│   ├── web/                   # Next.js 14 web app
│   │   ├── app/               # App Router pages and layouts
│   │   ├── components/        # Shared UI components
│   │   └── lib/               # Client-side utilities
│   └── mobile/                # React Native + Expo app
├── packages/
│   ├── api-client/            # Typed API client (shared by web + mobile)
│   ├── db/                    # Drizzle schema, migrations, seed scripts
│   │   └── src/
│   │       ├── schema/        # One file per domain: tickets.ts, users.ts, etc.
│   │       └── migrations/    # Generated migration SQL (drizzle.config `out`)
│   ├── gamification/          # XP rules engine, anti-gaming guards, badge logic
│   ├── mcp-server/            # MCP tool definitions and handlers
│   └── ai/                    # LLM orchestrator, context builder, coach service
├── services/
│   ├── api/                   # Express API server (REST + GraphQL + WebSocket)
│   ├── workers/               # Background workers (event bus consumers)
│   └── ai-coach/              # Scheduled AI coach nudges
├── scripts/                   # Dev utilities, seed scripts, migration helpers
├── docs/                      # Architecture diagrams, ADRs
│   └── adr/                   # Architecture Decision Records
├── QuestVault_SDD.docx        # Full Software Design Document (repo root)
├── .env.example               # Required environment variables (never commit .env)
├── docker-compose.yml         # Local Postgres + Redis
├── turbo.json                 # Turborepo pipeline config
└── AGENT.md                   # This file
```

---

## Environment Setup

### Prerequisites
- Node.js 20+
- Docker (for local Postgres + Redis)
- pnpm 9+

### First-time setup
```bash
pnpm install                        # Install all workspace dependencies
cp .env.example .env.local          # Fill in required vars (see below)
docker compose up -d                # Start Postgres + Redis
pnpm db:migrate                     # Run all pending migrations
pnpm db:seed                        # Seed dev data (optional)
pnpm dev                            # Start all apps and services in watch mode
```

### Key environment variables
Local dev is provider-pluggable and runs with **no external services** — the
defaults below (LM Studio for the LLM, local disk for storage, credentials auth)
work out of the box. Swap the `*_PROVIDER` vars for cloud equivalents in prod.
```
DATABASE_URL=postgresql://questvault:password@localhost:5432/questvault_dev
REDIS_URL=redis://localhost:6379
AUTH_SECRET=<random 32-byte hex>
AUTH_PROVIDER=credentials              # local dev; "github" / "google" in prod
NEXTAUTH_URL=http://localhost:3002     # web dev port (moved off 3000 to avoid a local clash)
LLM_PROVIDER=lmstudio                  # local LLM; "anthropic" + ANTHROPIC_API_KEY in prod
STORAGE_PROVIDER=local                 # local disk; "s3" + S3_* in prod
MCP_AGENT_SECRET=dev_mcp_secret        # local agent auth
```
See `.env.example` / `.env.local` for the full, commented list (embeddings, OAuth,
S3, ports: API `3001`, MCP `3003`).

---

## Development Commands

```bash
pnpm dev                   # Run everything (web, api, workers) via Turborepo
pnpm build                 # Production build all packages
pnpm test                  # Run all tests (Vitest)
pnpm test:watch            # Watch mode
pnpm lint                  # ESLint across all packages
pnpm typecheck             # tsc --noEmit across all packages
pnpm db:generate           # Generate new Drizzle migration from schema changes
pnpm db:migrate            # Apply pending migrations
pnpm db:studio             # Open Drizzle Studio (DB browser)
pnpm db:seed               # Seed dev fixtures
```

---

## Code Conventions

### TypeScript
- Strict mode is on (`strict: true` in tsconfig). No `any` without a comment explaining why.
- Use `unknown` instead of `any` for external data; validate with Zod at the boundary.
- All async functions must handle errors explicitly — no unhandled promise rejections.
- Prefer named exports over default exports everywhere except Next.js page/layout files.

### Database
- All DB access goes through `packages/db`. Never import `drizzle` directly in app code.
- Use transactions for any operation that touches more than one table.
- New columns must be nullable or have a default — no breaking migrations.
- Column names: `snake_case`. TypeScript object keys: `camelCase` (Drizzle handles the mapping).
- Every table must have `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, and `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` (kept current via trigger).

### API
- All routes live under `/api/v1/`.
- Request bodies are validated with Zod schemas defined in `packages/api-client/schemas/`.
- HTTP status codes: 200 OK, 201 Created, 400 Bad Request (validation), 401 Unauthorised, 403 Forbidden, 404 Not Found, 409 Conflict, 422 Unprocessable, 500 Internal.
- Never return stack traces or internal error messages to clients in production.
- All mutations emit a domain event to the Redis event bus after committing to DB.

### Events
- Event names follow the pattern `<domain>.<action>` e.g. `ticket.created`, `ticket.closed`, `sprint.completed`.
- Event payloads must be serialisable JSON and include at minimum: `eventId`, `type`, `payload`, `timestamp`, `actorId`.
- Consumers must be idempotent — events may be delivered more than once.

### Gamification
- **Never** award XP inside a request handler. Publish an event; let the gamification worker consume it.
- All XP rules live in `packages/gamification/rules.ts`. Adding a new rule = adding a new entry to the rules array and a corresponding test.
- Anti-gaming guards run before any XP is committed. If a guard fails, log the reason and skip the award — do not throw.

### AI / LLM
- All Anthropic API calls go through `packages/ai/client.ts`. Never call the Anthropic SDK directly from app code.
- Context assembly (which tickets to include, how many tokens to budget) lives in `packages/ai/context.ts`.
- User-controlled strings (ticket titles, descriptions, comments) are always injected as `<user_content>` blocks in prompts, never as raw instructions.
- Cache prompt prefixes aggressively using Anthropic's prompt caching feature to reduce costs.

### MCP Server
- Tool definitions live in `packages/mcp-server/tools/`. One file per tool.
- Every tool handler must validate its input with Zod before touching the DB.
- All tool calls are logged to the `agent_audit_log` table (agent_id, tool_name, input_hash, output_summary, duration_ms, created_at).
- Tools must return structured JSON; never return raw error strings.

### Testing
- Unit tests live next to the file they test: `tickets.ts` → `tickets.test.ts`.
- Integration tests live in `__tests__/integration/` at the package root.
- Use Vitest for all tests. Use `vi.mock` for external dependencies.
- DB tests use a real test database (separate `DATABASE_URL_TEST`); wrap each test in a transaction and roll back after.
- Target: 80%+ coverage on `packages/gamification` and `packages/mcp-server`. Other packages: cover the happy path and one error path per handler.

---

## MCP Tools Available to This Agent

The tool definitions live in the shared `packages/tools` registry and are served
over HTTP by `packages/mcp-server`. `pnpm dev` now starts the MCP server on
`MCP_PORT` (`3003`) alongside the web app (`:3002`) and API (`:3001`).

- **Endpoint:** `POST http://localhost:3003/mcp` (MCP Streamable HTTP transport,
  stateless). `GET /health` is unauthenticated.
- **Auth:** `Authorization: Bearer $MCP_AGENT_SECRET`. An optional `X-Agent-Id`
  header labels the caller in `agent_audit_log` (defaults to `mcp-agent`).
- **Identity:** agent-created tickets are reported by the seeded *QuestVault Agent*
  system user (`MCP_AGENT_REPORTER_ID`); comments/history carry the text agent id.
- Connect any MCP client (e.g. the SDK's `StreamableHTTPClientTransport`). Adding
  a tool = add one file under `packages/tools/src/defs/` and list it in the
  registry — both the MCP server and the in-app coach pick it up.

> Not yet implemented (later Phase 4 increments): per-agent scoped tokens
> (currently a single shared secret) and webhook callbacks.

| Tool | Description |
|------|-------------|
| `list_tickets` | List tickets in a project with optional filters (status, assignee, priority, sprint_id, label). Returns paginated results. |
| `get_ticket` | Get full ticket detail including comments, history, and linked PRs. |
| `create_ticket` | Create a new ticket. Required: title, project_id. Optional: description, priority, assignee_id, sprint_id, story_points, labels. |
| `update_ticket` | Partial update any ticket fields. Emits `ticket.updated` event. |
| `close_ticket` | Transition ticket to `done` status. Accepts optional `resolution_note`. Triggers XP award for assignee. |
| `add_comment` | Add a comment to a ticket. Attributed to the agent's identity in the audit log. |
| `list_sprints` | List sprints for a project including velocity and completion stats. |

### Example: close a ticket via MCP
```json
POST http://localhost:3003/mcp
Authorization: Bearer $MCP_AGENT_SECRET
Content-Type: application/json

{
  "type": "tool_call",
  "tool": "close_ticket",
  "input": {
    "ticket_id": "uuid-here",
    "resolution_note": "Implemented in PR #42. All tests passing."
  }
}
```

### Agent constraints
- You may NOT hard-delete tickets. Use `close_ticket` or `update_ticket` with `status: archived`.
- You may NOT modify another user's XP or badge records directly. Gamification is event-driven.
- You may NOT read tickets outside the project(s) your agent token is scoped to.
- Rate limit: 60 tool calls per minute. If you hit it, back off exponentially starting at 2s.
- Every action you take is written to `agent_audit_log`. This is immutable and reviewed by humans.

---

## Ticket Workflow

```
Backlog → Todo → In Progress → In Review → Done → Archived
```

- Tickets can move backward (e.g. In Review → In Progress on a failed review).
- Archived tickets are soft-deleted; they remain queryable with `status: archived` filter.
- Subtasks have a `parent_id` pointing to their parent ticket. Subtasks cannot have subtasks.
- A ticket is considered "complete" only in `done` or `archived` state.

---

## Common Tasks for Agents

### Work a ticket from start to finish
1. `get_ticket` to read the requirements and any linked context.
2. Implement the change in the codebase.
3. `add_comment` with a summary of what you did and why.
4. `update_ticket` to set `status: in_review` and link the PR (field: `pr_url`).
5. After review passes: `close_ticket` with a resolution note.

### Triage a backlog
1. `list_tickets` with `status: backlog` and `sprint_id: null`.
2. For each ticket: assess priority based on description and labels.
3. `update_ticket` to set or correct priority.
4. `add_comment` on any ticket that needs clarification before it can be started.

### Create subtasks for a large ticket
1. `get_ticket` to understand the scope.
2. `create_ticket` for each subtask with `parent_id` set to the parent ticket's id.
3. `add_comment` on the parent summarising the breakdown.

---

## Architecture Decision Records (ADRs)

ADRs live in `docs/adr/`. Before making a significant architectural change (new dependency, schema change, new service boundary), create an ADR using the template at `docs/adr/TEMPLATE.md` and get it reviewed before implementing.

---

## Getting Help

- Full architecture and data model details: `QuestVault_SDD.docx` (repo root)
- If something in this file conflicts with the SDD, the SDD wins.
- If you are unsure whether an action is within your scope, do not take it — add a comment to the relevant ticket explaining what you need a human to clarify.
