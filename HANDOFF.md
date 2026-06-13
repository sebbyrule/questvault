# QuestVault — Engineering Handoff

A working log + map of everything built so far, written so a fresh session can
continue with minimal ramp-up. For product/architecture detail see
`QuestVault_SDD.docx`; for agent/code conventions see `AGENT.md`; for setup see
`README.md`. **If anything here conflicts with the SDD, the SDD wins.**

---

## 1. What this is

QuestVault is a gamified, AI-native PM tool (Jira-class tickets + XP/badges + an
LLM coach + a first-class MCP server). Turborepo monorepo, runs fully locally
(LM Studio LLM, local-disk storage, dev-credentials auth); every provider swaps
to cloud via env vars.

**Stack:** Next.js 14 (App Router) · Express · PostgreSQL 16 + pgvector · Drizzle
ORM · Auth.js v5 · `@modelcontextprotocol/sdk` · TypeScript · Tailwind. pnpm 9 +
Turborepo.

## 2. Current state (as of this handoff)

- Branch `main`, latest commit `a46ee52`, pushed to `origin` (github `sebbyrule/questvault`).
- `pnpm typecheck` → **9/9 green**. `pnpm --filter @questvault/ai test` and
  `@questvault/gamification test` green. Web production build clean.
- `pnpm test` (repo-wide) is **not** fully green: `@questvault/mcp-server` declares
  a `test` script but has **no test files**, so vitest exits 1. Pre-existing; not
  yet addressed (see §8).
- Dev servers are currently **stopped**. Docker (Postgres/Redis) may still be up.

## 3. Architecture map

```
apps/web            Next.js app — pages: /board, /board/[ticketId], /dashboard,
                    /projects, /templates, /settings, /auth/login; API route
                    /api/auth/[...nextauth] and BFF /api/coach; middleware.ts
                    (route protection). Server actions in lib/*-actions.ts,
                    reads in lib/queries.ts.
packages/db         Drizzle schema (one file per domain under src/schema/),
                    migrations, seed, client. Re-exports drizzle operators so app
                    code never imports drizzle-orm directly. getAppSettings /
                    updateAppSettings live here.
packages/tools      ★ KEYSTONE. Shared tool registry. One ToolDefinition per file
                    under src/defs/ (7 tools); registry.ts aggregates `allTools` +
                    `toolsByName`. Pure logic — no audit, no transport. Consumed by
                    BOTH the MCP server and the AI coach.
packages/mcp-server Serving layer for external agents. index.ts = createServer(ctx)
                    registers allTools onto an McpServer with audit logging; http.ts
                    serves Streamable HTTP on :3003 with bearer auth.
packages/ai         Provider-agnostic LLM client (LM Studio + Anthropic, raw fetch),
                    the tool-calling loop (streamChatWithTools), coach, context
                    builder, tool-schema (zod→JSON schema).
packages/gamification  XP rules + anti-gaming guards (+ vitest tests).
packages/api-client    Shared Zod request schemas.
packages/storage       Local/S3 file storage.
services/api        Express REST + SSE (:3001). Routes: tickets, ai/chat.
services/{workers,ai-coach}  Empty dirs (planned).
apps/mobile         Empty (planned).
```

**The keystone idea:** all ticket actions live once in `@questvault/tools`. Add a
tool = add a file under `packages/tools/src/defs/` + list it in `registry.ts`, and
**both** the MCP server (external agents) and the in-app coach pick it up.

## 4. Build history (in order, with commits)

Two threads of work, both already on `main`:

**Phase 1 finish (ticket detail + auth):**
- `1a9cc69` **Ticket detail view** — `/board/[ticketId]` (edit title/description,
  status/priority/assignee/points/sprint/due/PR, labels, comments thread, activity
  feed). Server actions `updateTicketDetails` (writes `ticket_history` per changed
  field, in a tx), `addComment`, `editComment`, `setTicketLabels`. Added
  `ticketHistory` relation (code-level, no migration).
- `203bd3d` **build: add missing tsconfig.json** to api-client/gamification/
  storage/mcp-server/ai/services-api (they had a `typecheck` script but no config →
  `tsc` dumped help). Also fixed latent `exactOptionalPropertyTypes` insert errors.
- `52d6a53` **chore:** gitignore `*.tsbuildinfo`, untrack it.
- `30116d7` **Real auth** — split Auth.js config (`lib/auth.config.ts` edge-safe +
  `lib/auth.ts` Node w/ DB-backed credentials), mount `/api/auth/[...nextauth]`,
  `middleware.ts` route protection, sidebar user + sign-out, session-attributed
  writes. **Credentials provider find-or-creates a real `users` row** so the
  session id is a valid UUID (fixes FK attribution).
- `f4ded32` **Create-project** modal + `createProject` action (unique slug, owner
  membership in a tx).
- `797ee08` **Project-scoped board** — `/board?project=<slug>` + ProjectSwitcher;
  cards/back-links target the project; `getTicketDetail` exposes `projectSlug`.

**Phase 4 (MCP + tools), the 4-increment plan in `~/.claude/plans/stateful-riding-hamming.md`:**
- `cd9262e` **Inc 1 — MCP serving + registry.** New `@questvault/tools` with all 7
  tools (`list_tickets`, `get_ticket`, `create_ticket`, `update_ticket`,
  `close_ticket`, `add_comment`, `list_sprints`); mcp-server serves them on :3003
  (stateless Streamable HTTP, bearer auth, `agent_audit_log`). Seeded **QuestVault
  Agent** user (id `00000000-0000-0000-0000-000000000000`, matches
  `MCP_AGENT_REPORTER_ID`). Wired into `pnpm dev`.
- `845c753` **Inc 2 — Coach tool-use.** `streamChatWithTools` agentic loop over
  LM Studio (`tool_calls`) and Anthropic (`tool_use`/`input_json_delta`);
  `StreamChunk` gained a `"tool"` kind; coach-panel renders activity chips. Coach
  writes attributed to agent (`agentId:"coach"`). Unit-tested with a stubbed provider.
- `956d9f5` **fix(gamification):** streak multiplier `Math.round` → `Math.floor`
  (never over-award; fixes a failing test).
- `485c3e9` **Inc 3 — Workspace Settings.** `app_settings` singleton table
  (migration `0002`); `LlmConfig`/`resolveLlmConfig` so DB settings override env;
  coach filters `allTools` by an allowlist (+ execute guard) and appends SKILLS.md;
  `/settings` page + form + action.
- `a46ee52` **Inc 4 — Template Hub.** Built-in presets + save-as-template
  (`project_templates` table, migration `0003`); `createProjectFromTemplate` /
  `saveProjectAsTemplate`; `/templates` hub. **Also fixed a jsonb double-encoding
  bug** with a custom jsonb column type (`packages/db/src/schema/json.ts`) — applied
  to `project_templates.definition` and `app_settings.enabled_tools`.

## 5. Key decisions & conventions

- **Web data layer = server actions + direct `@questvault/db`** (not the Express
  API). The Express API + MCP are separate surfaces for curl/agents.
- **DB access only via `@questvault/db`** (operators re-exported there).
- **`@questvault/tools` uses extensionless relative imports** (e.g. `./registry`,
  not `./registry.js`) so it resolves under both webpack (web) and tsx
  (mcp-server/ai). Other web-consumed packages do the same.
- **Coach allowlist applies to the coach only**; external MCP agents are governed
  by their bearer token (scoped per-agent tokens are deferred).
- **Coach LLM default stays `claude-sonnet-4-6` / LM Studio** — provider-agnostic
  raw-fetch client; no Anthropic SDK dependency (LM Studio is OpenAI-compatible).
- Every increment was planned in plan mode, built on a `feat/*` branch, verified,
  then fast-forward merged to `main` and pushed.

## 6. Local environment specifics (IMPORTANT for running)

- **Port 5432 collision:** the dev machine runs a native `postgresql-x64-18`
  service on 5432 that shadows Docker. Workaround in use: an **untracked
  `docker-compose.override.yml`** remaps the container to host **`5433`**, and
  `.env.local` `DATABASE_URL`/`DATABASE_URL_TEST` point at `5433`. (The committed
  `docker-compose.yml` stays at 5432 for everyone else.) See the memory note
  `port-5432-collision`.
- **Ports:** web `3002`, API `3001`, MCP `3003`, LM Studio `1234`, Postgres `5433`
  (local override), Redis `6379`.
- **Seeded IDs:** primary project `00000000-0000-0000-0000-000000000010`; users
  alice/bob/carol = `…001/002/003`; agent user = `…000`. Dev login
  `alice@example.com` / `devpass`; dev API token `Bearer dev:alice@example.com`;
  MCP bearer `dev_mcp_secret`.

## 7. How to run & verify

```bash
docker compose up -d                       # Postgres(:5433 locally)+Redis
pnpm install
pnpm db:migrate && pnpm db:seed            # 4 migrations; seeds 7 tickets, agent user
pnpm dev                                    # web:3002, api:3001, mcp:3003
pnpm typecheck                              # 9/9 green
```
- **MCP:** `curl localhost:3003/health`; drive tools with an MCP SDK client +
  `Authorization: Bearer dev_mcp_secret` (see README "Connecting an MCP agent").
- **Coach tool-use (needs a tool-capable LM Studio model or Anthropic key):** in
  the web app, log in → open the ✦ coach → "create a P2 ticket titled X" → a
  `create_ticket` chip appears and the ticket lands on the board (reporter =
  QuestVault Agent). Without a tool-capable model it degrades to plain chat.
- **Browser checks use `mcp__Claude_Preview__preview_*`** (launch.json has a "web"
  config). The coach also needs the Express API running, which `pnpm dev` covers;
  the preview tool only starts "web", so start the API separately if using preview.

## 8. Known gotchas / traps

- **jsonb double-encoding:** drizzle's built-in `jsonb` + postgres-js both
  stringify → values stored as JSON *strings*. Use the custom `jsonb` from
  `packages/db/src/schema/json.ts` for any new jsonb column (already applied to
  `definition` and `enabled_tools`; `xp_events.metadata` still uses built-in jsonb
  and would need the same fix if/when it's written).
- **Web tsconfig target:** spreading a `Set` (`[...set]`) errors — use
  `Array.from(set)`.
- **Adding a workspace dep / schema change requires restarting the running Next dev
  server** (it won't hot-resolve a newly added package or a changed `@questvault/db`
  schema). Restart the API too after changing coach/ai/db code.
- **Dev-token → users.id:** the Express API's dev token sets `userId = dev:<email>`
  (not a UUID). Web auth resolves a real UUID; the coach/MCP attribute writes to the
  agent user. Don't assume the Express `req.auth.userId` is a real `users` row.
- **`pnpm test`** fails on mcp-server ("No test files"); add `--passWithNoTests` or a
  test if you want the repo suite green.
- After live verification, **test data was cleaned up** (back to 1 project / 7
  tickets / 0 templates; settings reset to defaults).

## 9. What's next (not done)

- **Phase 4 remainder:** scoped per-agent MCP tokens (replace the shared
  `MCP_AGENT_SECRET`; likely an `agent_tokens` table) and webhook callbacks.
- **Phase 2:** event-bus worker for XP awards (currently display-only),
  anti-gaming guards wired to the bus, real-time WebSocket updates.
- **Phase 3:** proactive coach nudges (scheduled `services/ai-coach`), semantic
  ticket search (pgvector HNSW index already exists; `USE_EMBEDDINGS`).
- **Phase 5:** sprint analytics, GitHub/Slack integrations, billing/SSO/SCIM,
  mobile, perf.
- **Housekeeping:** mcp-server test script; consider applying custom `jsonb` to
  `xp_events.metadata`.

## 10. Working agreements observed with the owner

- Plan non-trivial features in plan mode and get approval before coding.
- One feature per `feat/*` branch → verify → fast-forward merge to `main` → push,
  each on explicit request.
- Verify changes for real (run it, check the DB), clean up test artifacts, and
  report failures honestly. Don't commit/push/merge unless asked.
