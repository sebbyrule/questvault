# ADR-001: Monorepo with Turborepo

**Status:** accepted  
**Date:** 2026-06-05  
**Deciders:** founding team

## Context

QuestVault has five logical boundaries (web app, mobile app, API services, shared packages, AI/MCP layer) that share types and business logic. We need a repo strategy that avoids drift between packages while keeping CI fast.

## Decision

Single monorepo managed with pnpm workspaces + Turborepo for task caching and parallelism.

## Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| Polyrepo | Independent deploys, clear ownership | Type drift between packages, duplicated config, slow cross-repo PRs |
| Nx | More features (affected graph, generators) | Heavier config, steeper learning curve |
| Turborepo | Fast incremental builds, simple config, first-class pnpm support | Fewer code-gen features than Nx |

## Consequences

- All packages share a single `tsconfig.base.json` — consistent strict mode across the codebase.
- `turbo run build` caches outputs; CI only rebuilds what changed.
- Developers clone one repo and run `pnpm dev` to start everything.
- Adding a new service = new directory under `services/`, add to `pnpm-workspace.yaml`, done.
