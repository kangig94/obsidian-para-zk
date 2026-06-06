# Agent System

## Agent Quick Reference

| Agent | Tier | Model | Purpose |
|-------|------|-------|---------|
| plugin-lifecycle | 1 | opus | Obsidian onload/onunload registration & cleanup, vault safety, mobile (no Node-only APIs), settings load/save tolerance |
| surface-contract | 1 | opus | GUI/CLI/MCP parity, stable JSON envelope, locale-neutral codes, canonical arg names, MCP-as-CLI-proxy shell safety |
| layer-boundary | 2 | sonnet | Core (workflows/templates) independence, no logic duplication in adapters, architecture-lint rules |
| manifest-version | 2 | sonnet | Version consistency across 7 locations, manifest/versions.json correctness, community-plugin dependency registry |
| code-critic | 3 | sonnet | Code quality / elegance review |
| doc-critic | 3 | sonnet | Documentation quality review |
| test-critic | 3 | sonnet | Test coverage & quality review |

## Consultation Matrix

| Task Type | Mandatory Agent | Recommended Agent |
|-----------|----------------|-------------------|
| Plugin entry / onload / event or command registration (`src/main.ts`, `src/ux/`) | plugin-lifecycle | code-critic |
| Settings schema change (`src/runtime/settings.ts`) | plugin-lifecycle | code-critic |
| CLI handler / parse change (`src/cli/`) | surface-contract | layer-boundary, test-critic |
| MCP tool change (`src/mcp/`, `clients/`) | surface-contract | manifest-version |
| New/changed workflow in `src/workflows/` | layer-boundary | code-critic, surface-contract |
| Adding a new module / moving code | layer-boundary | code-critic |
| manifest.json / versions.json / version bump / dependency registry | manifest-version | - |
| Template / dashboard / managed-block change (`src/templates.ts`, `src/ux/*-renderer.ts`) | layer-boundary | code-critic |
| Docs change | doc-critic | - |

## Design Principles

### Fresh Context for Verification

When verifying work output, spawn a dedicated subagent instead of self-verifying.

**Why**: The producing agent accumulates context bias through planning, decision-making,
and execution — it is predisposed to confirm its own output. A fresh subagent has no
prior commitment to the result.

**Pattern**:
- Producer agent generates output (files, plans, code)
- Verifier subagent receives only: inputs (requirements, analysis) + outputs (generated files)
- Verifier has a single goal: do the outputs satisfy the inputs?
- One goal, clean context, higher accuracy

**Anti-pattern**: Agent generates artifacts → same agent "spot-checks" its own work →
confirmation bias → defects pass through.
