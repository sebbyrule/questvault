# QuestVault

> Gamified, AI-native project management — Jira-class tickets with XP, levels, and
> an LLM coach grounded in your actual work, plus a first-class MCP server so
> agents can work tickets alongside you.

QuestVault is a Turborepo monorepo (Next.js 14 · Express · PostgreSQL 16 + pgvector ·
Drizzle ORM · TypeScript) designed to run **entirely on your machine** — no cloud
account, no API keys. The LLM runs locally via LM Studio; storage is local disk; auth
is a dev-credentials provider. Every external provider can be swapped for a cloud one
through environment variables alone.

---

## What works today

- **Kanban board** — live columns (Backlog → Done) from the database. Move a ticket
  between columns with one click; create tickets from a modal. Cards show priority,
  labels, story points, and assignee avatars.
- **Dashboard** — ticket counts by status, sprint progress with countdown, and an XP
  leaderboard (levels, streaks, badge counts) computed from the gamification rules.
- **Projects** — project cards with completion progress and member/ticket counts.
- **AI Coach** — a streaming chat panel grounded in your real tickets and sprint
  that can also **take actions** via the shared tool registry (create/update/close
  tickets, comment, list sprints) — each tool call shows as an activity chip.
  Answers are rendered as Markdown; reasoning-model "thinking" is streamed into a
  collapsible section.
- **Templates** — a Template Hub to spin up a project from a built-in preset
  (Scrum, Bug Tracker, Content Calendar) or a saved template, seeding labels, an
  active sprint, and starter tickets. Save any existing project as a reusable template.
- **Settings** — a workspace Settings page to choose the LLM provider/model/key,
  set custom coach instructions (SKILLS.md), restrict which tools the coach may
  call, and a working directory. Stored in the DB and **overrides the env
  defaults** (blank fields fall back to env).
- **Database** — full schema with migrations, an idempotent seed, `updated_at`
  triggers, an `xp_awarded >= 0` check, a unique `(project_id, number)` constraint,
  and a pgvector HNSW index ready for semantic search.
- **REST API** — Express server with dev-token auth, ticket endpoints, and the
  AI-coach SSE endpoint.
- **MCP server** — the 7 ticket tools served over HTTP on `:3003` (Streamable
  HTTP, bearer auth, audit-logged) so external agents (Claude Code, Hermes, any
  MCP client) can populate and maintain projects/tasks. The same tools power the
  in-app coach via one shared registry (`packages/tools`).

See the [Roadmap](#roadmap) for what's next.

---

## Local development — zero external dependencies

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 20 | https://nodejs.org |
| pnpm | ≥ 9 | `npm i -g pnpm` |
| Docker Desktop | latest | https://docker.com |
| LM Studio | latest (optional — only for the AI coach) | https://lmstudio.ai |

> **Windows note:** if you have a native PostgreSQL service installed, it may occupy
> port `5432` and shadow the Docker container. Stop it (or remap the container port)
> before running migrations. The web app runs on **3002** (3000 is a common local
> clash, e.g. Obsidian); the API on **3001**.

### 1. Clone and install

```bash
git clone <your-repo-url> questvault
cd questvault
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

The defaults work out of the box for local dev. The only thing you may want to change
is `LM_STUDIO_MODEL` (step 5).

### 3. Start Postgres + Redis

```bash
docker compose up -d      # PostgreSQL 16 + pgvector on :5432, Redis 7 on :6379
docker compose ps         # verify both are healthy
```

### 4. Set up the database

```bash
pnpm db:migrate           # applies all migrations (extension, tables, triggers, indexes)
pnpm db:seed              # loads dev data: 7 tickets, 3 users, 1 active sprint, badges
```

### 5. Set up LM Studio (optional — for the AI coach)

1. Download and open [LM Studio](https://lmstudio.ai).
2. Download a model. Good dev choices:
   - **Phi-3 Mini** / **Llama 3.1 8B** — fast, general-purpose.
   - Any **reasoning model** (Qwen, some Gemma builds) — fully supported; the coach
     streams the chain-of-thought into a collapsible "Thoughts" section.
3. Open the **Local Server** tab, select the model, and **Start Server**.
4. Paste the exact model id into `.env.local` as `LM_STUDIO_MODEL`, then verify:
   ```bash
   curl http://localhost:1234/v1/models
   ```

> **No LM Studio?** Everything except the AI coach works normally; the coach panel
> shows a friendly "model unavailable" message.

### 6. Start the app

```bash
pnpm dev                  # web + API + MCP server in watch mode, via Turborepo
```

| Service | URL |
|---------|-----|
| Web app (Next.js) | http://localhost:3002 |
| API server (Express) | http://localhost:3001 |
| API health check | http://localhost:3001/health |
| MCP server | http://localhost:3003/mcp (health: http://localhost:3003/health) |

Open **http://localhost:3002** for the landing page → Board / Dashboard / Projects.
The AI coach is the **✦** button at the bottom-right of any app page.

Seeded dev account (also printed by `pnpm db:seed`):

```
Email:    alice@example.com   (any valid email works)
Password: devpass
```

The same identity is a dev API token: `Authorization: Bearer dev:alice@example.com`.

---

## Commands

```bash
pnpm dev          # run web + API + MCP server in watch mode
pnpm build        # production build (all packages)
pnpm test         # run all tests (Vitest)
pnpm lint         # ESLint across packages
pnpm typecheck    # tsc --noEmit across packages
pnpm db:generate  # generate a Drizzle migration from schema changes
pnpm db:migrate   # apply pending migrations
pnpm db:seed      # (re)seed dev data
pnpm db:studio    # open Drizzle Studio
```

---

## Testing the API directly

```bash
# List tickets in the seeded project
curl -s -H "Authorization: Bearer dev:alice@example.com" \
  "http://localhost:3001/api/v1/projects/00000000-0000-0000-0000-000000000010/tickets" | jq .

# Create a ticket
curl -s -X POST -H "Authorization: Bearer dev:alice@example.com" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test ticket","description":"From curl","priority":"p2"}' \
  "http://localhost:3001/api/v1/projects/00000000-0000-0000-0000-000000000010/tickets" | jq .

# Ask the AI coach (SSE stream; requires LM Studio)
curl -sN -X POST -H "Authorization: Bearer dev:alice@example.com" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"00000000-0000-0000-0000-000000000010","message":"What should I focus on today?","history":[]}' \
  "http://localhost:3001/api/v1/ai/chat"
```

---

## Connecting an MCP agent

External agents reach the 7 ticket tools at `http://localhost:3003/mcp` (MCP
Streamable HTTP), authenticated with `Authorization: Bearer $MCP_AGENT_SECRET`
(default `dev_mcp_secret`). An optional `X-Agent-Id` header labels the caller in
the `agent_audit_log` table. Tools: `list_tickets`, `get_ticket`, `create_ticket`,
`update_ticket`, `close_ticket`, `add_comment`, `list_sprints`. Agent-created
tickets are reported by the seeded **QuestVault Agent** user.

```bash
curl -s http://localhost:3003/health        # → {"status":"ok",...}
```

Point any MCP client (e.g. the `@modelcontextprotocol/sdk` `StreamableHTTPClientTransport`)
at the endpoint with that bearer header to `tools/list` and call tools. See
[AGENT.md](AGENT.md) for the full tool contract and agent constraints.

---

## Switching to production providers

No code changes — flip the `*_PROVIDER` vars in `.env.local`:

```bash
LLM_PROVIDER=anthropic        # + ANTHROPIC_API_KEY
AUTH_PROVIDER=github          # + GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
STORAGE_PROVIDER=s3           # + S3_BUCKET / S3_* credentials
USE_EMBEDDINGS=true           # enable pgvector semantic search
```

The **LLM** provider/model/key can also be set at runtime in the in-app
**Settings** page — DB-stored values override these env defaults (blank settings
fall back to env).

---

## Project layout

```
questvault/
├── apps/
│   ├── web/              Next.js 14 web app (board, dashboard, projects, AI coach)
│   └── mobile/           React Native + Expo (planned)
├── packages/
│   ├── ai/               LLM client (LM Studio + Anthropic), coach, context builder
│   ├── api-client/       Shared Zod schemas
│   ├── db/               Drizzle schema + migrations + seed (source of truth)
│   ├── gamification/     XP rules engine, levels, anti-gaming guards
│   ├── tools/            Shared, extensible tool registry (MCP + AI coach)
│   ├── mcp-server/       Serves the tool registry over HTTP on :3003 (MCP)
│   └── storage/          File storage (local + S3)
├── services/
│   ├── api/              Express REST + SSE API
│   ├── ai-coach/         Scheduled coach nudges (planned)
│   └── workers/          Event-bus consumers, e.g. XP awards (planned)
├── docs/adr/             Architecture Decision Records
├── docker-compose.yml    Postgres + Redis
├── QuestVault_SDD.docx   Full Software Design Document
├── AGENT.md              Guide for AI coding agents
└── .env.example          All config vars, commented
```

---

## Roadmap

Phases mirror the [SDD](QuestVault_SDD.docx). Status reflects the current codebase.

### Phase 1 — Core MVP  ·  🟢 done
- [x] PostgreSQL schema, migrations, seed (triggers, constraints, pgvector)
- [x] Kanban board — view, create, and move tickets
- [x] Projects & dashboard views
- [x] REST API with dev-token auth
- [x] Full ticket CRUD in the UI (edit, comments, history, labels, assignees)
- [x] Real auth (Auth.js handlers mounted; route protection; session-attributed writes)

### Phase 2 — Gamification  ·  🟡 in progress
- [x] XP rules engine, levels, badges (logic in `packages/gamification`)
- [x] Dashboard leaderboard (XP, levels, streaks, badges)
- [ ] Event-driven XP awards via a background worker (currently display-only)
- [ ] Anti-gaming guards wired to the event bus
- [ ] Real-time WebSocket updates (ticket/XP/notifications)

### Phase 3 — AI coach  ·  🟢 mostly done
- [x] Local + cloud LLM client (LM Studio / Anthropic), reasoning-model aware
- [x] Streaming AI coach chat grounded in ticket + sprint context (Markdown UI)
- [ ] Proactive nudges (scheduled coach service)
- [ ] Semantic ticket search (pgvector HNSW; index already created)

### Phase 4 — Agents (MCP)  ·  🟡 in progress
- [x] Shared, extensible tool registry (`packages/tools`) — all 7 tools
- [x] Serve the MCP tools over HTTP on `:3003` (Streamable HTTP, bearer auth, audit log)
- [x] AI coach calls the same tools (in-app tool-use, both LM Studio + Anthropic)
- [x] Workspace Settings (DB-overrides-env LLM config, SKILLS.md, tool allowlist)
- [x] Project Template Hub (built-in presets + save-as-template)
- [ ] Scoped per-agent tokens (currently a shared secret)
- [ ] Webhook callbacks + Claude Code integration tests

### Phase 5 — Scale & launch  ·  ⚪ planned
- [ ] Sprint analytics & burndown
- [ ] GitHub / Slack integrations
- [ ] Multi-tenant billing, SSO / SCIM
- [ ] Mobile app, performance hardening

---

## Contributing

- All DB access goes through `packages/db` (operators are re-exported there — never
  import `drizzle-orm` directly in app code).
- Conventions for schema, API, events, gamification, and the MCP server live in
  [AGENT.md](AGENT.md). If it conflicts with the SDD, the SDD wins.
- Run `pnpm typecheck` and `pnpm test` before committing.
