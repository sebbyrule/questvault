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

- Branch `main`, latest feature commit `f9f28ab` (semantic search), pushed to `origin` (github `sebbyrule/questvault`).
- `pnpm typecheck` → **9/9 green**. `pnpm test` → **green repo-wide** (gamification 22,
  web 13, db 5, ai 2, mcp-server 2). Web production build clean.
- **Since the previous handoff** three features + a test pass landed on `main` (§4):
  the **gamification XP loop** (`7f04f12`) — ticket actions award XP for real —
  **first-run admin registration** (`e299c6f`) — real sign-up with hashed
  passwords — **team member management** (`87f2b70`) — invite links, workspace
  roles, deactivation — and a **test foundation** (greened the suite + unit-tested
  the auth/XP decision logic). **DB now has 6 migrations** (0004 = `users.password_hash`
  + `role`; 0005 = `invites` table + `users.is_active`); `apps/web` gained
  `bcryptjs` + `vitest`, so re-run `pnpm install` and `pnpm db:migrate`.
- Dev servers are currently **stopped**. Docker (Postgres/Redis) may still be up.

## 3. Architecture map

```
apps/web            Next.js app — pages: /board, /board/[ticketId], /dashboard,
                    /projects, /templates, /settings (admin), /members (admin),
                    /auth/login, /auth/register, /auth/invite/[token];
                    API route /api/auth/[...nextauth] and BFF /api/coach;
                    middleware.ts (route protection). Server actions in
                    lib/*-actions.ts (incl. member-actions.ts), reads in
                    lib/queries.ts; role gating in lib/authz.ts (+ pure
                    lib/roles.ts). lib/xp.ts bridges
                    ticket actions → gamification; lib/password.ts = bcrypt (Node only).
packages/db         Drizzle schema (one file per domain under src/schema/),
                    migrations, seed, client. Re-exports drizzle operators so app
                    code never imports drizzle-orm directly. getAppSettings /
                    updateAppSettings live here.
packages/tools      ★ KEYSTONE. Shared tool registry. One ToolDefinition per file
                    under src/defs/ (8 tools); registry.ts aggregates `allTools` +
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

**Phase 2 (gamification) + auth, since this handoff:**
- `7f04f12` **Gamification XP loop (Phase 2 core).** The tested rules engine was
  imported nowhere; dashboard XP was static seed data. New
  `apps/web/lib/xp.ts` (`awardXp`) bridges `@questvault/gamification` to the DB:
  runs the matching rule (quality gate → daily-cap guards → streak multiplier),
  writes an `xp_event`, advances the UTC-day streak, unlocks the seeded badges
  idempotently, and bumps `users.xp_total` — all in one transaction, best-effort
  (never breaks the mutation). Wired into the server actions in `lib/actions.ts`:
  `createTicket` (`ticket_created` + first-ticket badge), `moveTicket` /
  `updateTicketDetails` (transition into *done* → `ticket_closed`, credited to
  assignee else actor), and PR-url first-set → `pr_linked`. Added a `<XpToaster>`
  (`components/xp-toast.tsx`) for a "+N XP earned" toast. **Applied the custom
  `jsonb` type to `xp_events.metadata`** (the §8 gotcha — no DDL drift). Seed sets
  `last_active_at = yesterday` for streaked users so the first action *extends*
  the streak rather than resetting it. Awards happen **only in the web
  server-action layer** — coach/MCP changes (via `@questvault/tools`) do not mint XP.
- `e299c6f` **First-run admin registration.** Migration `0004` adds
  `users.password_hash` (nullable) + `users.role` (`userRoleEnum`, default
  `member`). New `apps/web/lib/password.ts` (`bcryptjs`, cost 12, **Node-runtime
  only**). `adminExists()` / `getSessionRole()` in `lib/queries.ts` (reuse the
  leaderboard's `ne(email, "agent@questvault.internal")` exclusion). `registerUser`
  action (`lib/auth-actions.ts`) — first-run gated, hashes the password, creates the
  first user with role `admin`. `authorize()` (`lib/auth.ts`) now verifies the
  bcrypt hash for users that have one (all envs) and keeps the `devpass` find-or-create
  fallback for hash-less rows (non-prod). `/auth/login` + `/auth/register` are server
  wrappers that redirect on `adminExists()`; the login form moved to
  `components/auth/login-form.tsx`, with a new `register-form.tsx`. Sidebar shows an
  **ADMIN** pill.
- `87f2b70` **Team member management.** Migration `0005` adds the `invites` table
  (email, role, SHA-256 `token_hash`, inviter, expiry, `accepted_at` → single-use,
  hashed token) and `users.is_active`. `lib/authz.ts` `requireAdmin()` (+ pure
  `lib/roles.ts` `isAdminRole`, client-safe). `lib/member-actions.ts`: `createInvite`
  (returns the raw token once; only its hash is stored; 7-day expiry), public
  `acceptInvite` (sets own password, then the client signs in), `updateUserRole` /
  `setUserActive` (self-lockout guards), `revokeInvite`. New `/members` admin page
  (+ `members-manager.tsx`) and public `/auth/invite/[token]` accept page
  (+ `accept-invite-form.tsx`). **Role gating:** Settings + Members redirect non-admins
  and are hidden from the sidebar; `authorize()` rejects inactive accounts; the
  `(app)` layout bounces a *confirmed-inactive* session (NOT a null lookup — see §8).
  Seed makes **alice an `admin`**. NB: the invite control uses a button `onClick`,
  not `<form onSubmit>` — a native form submit raced into a page POST that bounced
  to login (§8).
- (test foundation) — greened the suite + unit-tested the auth/XP decision logic
  (`gamification/streak.ts`, `apps/web/lib/auth-rules.ts`, `roles.ts`), added a
  real `mcp-server` smoke test, and wired `apps/web` into vitest.
- `f9f28ab` **Semantic ticket search.** `apps/web/lib/search.ts`: `searchTickets`
  (pgvector cosine over the existing HNSW index, **full-text fallback** when
  embeddings off / embed fails / dims ≠ 1536) + `embedTicketText` (best-effort
  embed on create/update). `searchTicketsAction` + a `TicketSearch` board-header
  dropdown. New `search_tickets` tool (8th) — coach/MCP get semantic search via an
  injected `ctx.embed` (DI avoids a `tools`↔`ai` cycle). `scripts/embed-backfill.ts`
  + `pnpm db:embed`. **The embedding helpers (`embed`, `embeddingsEnabled`,
  `toVectorLiteral`) moved from `@questvault/ai` into `@questvault/db`** because web
  can't import `ai` (§8); web/ai/tools/backfill all import them from `db`.

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
- **Auth/registration:** seeded users have **no** `password_hash` → they use the
  `devpass` dev fallback (non-prod). The credentials provider verifies a bcrypt
  hash for any user that has one (all envs). To exercise the first-run **register**
  flow you need an empty users table (`TRUNCATE users CASCADE;` then visit
  `/auth/login` → it redirects to `/auth/register`); re-seeding closes registration
  again. The first registered user gets `role = "admin"`.
- **Roles/members:** seed makes **alice `admin`** (bob/carol `member`), so the
  seeded login can reach `/settings` + `/members`. Admin invites others from
  Members → a one-time link `/auth/invite/<token>`. To test an invite without the
  admin UI: insert a row in `invites` with `token_hash = sha256(rawToken)` and open
  `/auth/invite/<rawToken>`. Deactivated (`is_active=false`) users can't log in.

## 7. How to run & verify

```bash
docker compose up -d                       # Postgres(:5433 locally)+Redis
pnpm install
pnpm db:migrate && pnpm db:seed            # 6 migrations; seeds 7 tickets, 3 users (+agent), alice=admin
pnpm dev                                    # web:3002, api:3001, mcp:3003
pnpm typecheck                              # 9/9 green
pnpm test                                   # green (gamification 22, web 13, db 5, ai 2, mcp 2)
# pnpm db:embed                             # optional: backfill ticket embeddings (needs USE_EMBEDDINGS + a 1536-dim model)
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
  `packages/db/src/schema/json.ts` for any new jsonb column (applied to
  `definition`, `enabled_tools`, and now `xp_events.metadata`). No remaining
  built-in jsonb columns — but keep using the custom type for new ones.
- **Web tsconfig target:** spreading a `Set` (`[...set]`) errors — use
  `Array.from(set)`.
- **Adding a workspace dep / schema change requires restarting the running Next dev
  server** (it won't hot-resolve a newly added package or a changed `@questvault/db`
  schema). Restart the API too after changing coach/ai/db code.
- **`@questvault/ai` is NOT web-importable.** Its source uses `.js` import
  specifiers (`from "./client.js"`), which tsx/Node resolve but **webpack cannot**
  (the file is `client.ts`) → a `Module not found` 500. That's why the embedding
  helpers (`embed`, `embeddingsEnabled`, `toVectorLiteral`) live in
  `@questvault/db` (web-safe, extensionless), not `ai`. If web ever needs ai
  logic, convert ai's imports to extensionless first.
- **`tools`↔`ai` cycle:** `ai` depends on `tools` (the coach runs the registry),
  so `tools` must NOT depend on `ai`. The `search_tickets` tool gets its embedder
  via an injected `ctx.embed` (set by the coach) rather than importing it.
- **Don't `<form onSubmit>` for a server-action button under the `(app)` layout.**
  In the preview/proxy env a native form submit raced into a *page* POST that fell
  through to a render where `auth()` was null → the layout redirected to
  `/auth/login` and the action body never ran. Use a plain `<button onClick>` that
  calls the action (like the board move control). See `members-manager.tsx`.
- **Layout deactivation check must not redirect on a *null* account.** The `(app)`
  layout reads `getSessionAccount()`; `auth()` can transiently return null during a
  Server-Action re-render, so it only redirects when the account is *confirmed
  inactive* (`account && !account.isActive`), never on `!account`. The logged-out
  case is already handled by the `!session?.user` guard above it.
- **Dev-token → users.id:** the Express API's dev token sets `userId = dev:<email>`
  (not a UUID). Web auth resolves a real UUID; the coach/MCP attribute writes to the
  agent user. Don't assume the Express `req.auth.userId` is a real `users` row.
- **Testing convention = pure unit tests, no DB.** Vitest runs config-free with
  colocated `*.test.ts`; `gamification`, `ai`, and now `apps/web` have a runner.
  `@questvault/db`'s client connects **on import** (throws without `DATABASE_URL`),
  so web tests must import only DB-free modules (`lib/roles.ts`, `lib/auth-rules.ts`,
  `@questvault/gamification`) — never `lib/xp.ts`/`queries.ts`/actions (those pull
  the db client). Pure decision-logic was extracted into those DB-free modules to
  keep it testable; the DB I/O glue is covered by manual/preview verification.
  `mcp-server` runs `--passWithNoTests` (no real test yet). No test-DB harness exists.
- After live verification, **test data was cleaned up** (re-seeded to baseline:
  1 project / 7 tickets / 0 templates; alice=admin; settings reset to defaults).

## 9. What's next (not done)

- **Phase 4 remainder:** scoped per-agent MCP tokens (replace the shared
  `MCP_AGENT_SECRET`; likely an `agent_tokens` table) and webhook callbacks.
- **Phase 2:** XP is now awarded synchronously in the web server actions
  (`lib/xp.ts`). Remaining: move awarding to an event-bus worker
  (`services/workers`) so coach/MCP changes also mint XP; wire anti-gaming guards
  (the velocity check in `constants.ts` is still unwired); real-time WebSocket
  updates. Also: `sprint_completed` / `review_submitted` rules exist but have no
  triggering surface yet.
- **Phase 3:** proactive coach nudges (scheduled `services/ai-coach`). Semantic
  search shipped (`f9f28ab`) — remaining there: a GIN index for the full-text
  fallback, and verifying the semantic path against a real 1536-dim embedding
  model (local LM Studio `nomic-embed-text` is 768-dim → falls back to text).
- **Auth/members remainder:** email delivery for invites (currently the link is
  copied manually), password reset/change, per-project membership management UI,
  and forced JWT revocation on deactivation (today it takes effect on next nav).
- **Phase 5:** sprint analytics, GitHub/Slack integrations, billing/SSO/SCIM,
  mobile, perf.
- **Testing remainder:** pure decision-logic is unit-tested (gamification streak/
  rules, `auth-rules`, `roles`), but the **DB I/O paths are not** — no integration
  harness for `awardXp`/invite-accept/`authorize` (would need a test DB + `auth()`/
  `next/cache` mocks). `mcp-server` has no real test (`--passWithNoTests`). No CI
  wiring or coverage thresholds yet.

## 10. Working agreements observed with the owner

- Plan non-trivial features in plan mode and get approval before coding.
- One feature per `feat/*` branch → verify → fast-forward merge to `main` → push,
  each on explicit request.
- Verify changes for real (run it, check the DB), clean up test artifacts, and
  report failures honestly. Don't commit/push/merge unless asked.
