# Design Philosophy

## Core Principles

**Clarity First**: Good code guides readers naturally — structure reveals intent
without requiring explanation. Dense code can be clear; minimal code can be confusing.
Optimize for cognitive load, not line count.

**Single Source of Workflow Truth**: Canonical PARA/ZK operations and vault side effects
live in `src/workflows/`. GUI commands, ribbon actions, dashboard blocks, and CLI
handlers are adapters that call this core — they never duplicate business logic. If GUI
and CLI drift, push shared behavior down into `src/workflows/`.

**Surfaces Share Logic, Not Input Shape**: GUI is for people (low-friction, infers
context, opens the note); CLI is for LLMs/automation (explicit paths, codes, flags,
token-efficient JSON). "Behave the same" means same core functions and same vault side
effects — not identical prompts.

**Locale-Neutral at the Boundary**: CLI/MCP option values are locale-neutral codes
(`status: in_progress`, `priority: high`, `maturity: draft`). Localized labels are
rendered only in the GUI and generated Markdown. One canonical argument name per
concept — reject legacy/camelCase aliases with a direct error.

**Single-Direction ZK Links**: A new ZK note references its origin; the origin surfaces
it via backlinks / its *Cited by* view. No reverse link is stored. Distill moves a
spark's idea into a new permanent and marks the spark `processed: true` — it does not
link back.

**Idempotent Setup With Plugin-Owned Scaffolding**: `para-zk:setup` re-runs safely.
Managed scaffolding (templates, dashboards, READMEs) is plugin-owned and is
overwritten when generated content differs. User content notes are never touched by
setup.

**No Content-Blank Modules**: No `utils.ts`/`helpers.ts`/`shared/`; every module has a
role-specific name. Re-exports live only in `index.ts`.

## Refactoring Doctrine

Refactoring is allowed when it makes the workflow core, surface contracts, or vault-write
rules easier to audit. It is not allowed merely because a file is long.

**Split by durable PARA-ZK responsibility, not by line count**:
- A split is good when each new module owns a stable reason to change: CLI command
  registry vs argv parsing vs file-backed argument loading, workflow target resolution
  vs mutation execution, reference registry storage vs reference-link rendering, task
  ordering/filtering vs task persistence, dependency config vs setup orchestration.
- A split is bad when it creates thin pass-through files, generic helper buckets, or a
  module whose only purpose is to host one ordinary function. A one-function module is
  acceptable only when that function is a real boundary: an Obsidian/mobile bridge, a
  Node-only lazy import bridge, an MCP/CLI protocol entry point, or a self-contained
  algorithm with independent tests and callers.
- Prefer role-specific packages only when a namespace contains several related
  responsibilities. The package root should expose the small production API;
  implementation modules should keep private helpers private.

**Keep cohesive contract files intact**:
- Workflow contract modules may be large when colocating the contract makes it easier to
  audit: `src/workflows/context.ts`, `src/workflows/describe.ts`, and `src/templates.ts`
  are allowed to be dense.
- Adapter facades may be large when they own a public surface lifecycle or command table
  and delegate real work elsewhere. Split only when the command registry, parsing,
  envelope rendering, local-file bridge, or attachment handling becomes an independent
  responsibility.
- Renderer modules may be large when they own one Obsidian block's UI lifecycle. Split
  only along real UI boundaries such as data loading, filtering/sorting policy, modal
  editing, or reusable rendering primitives.

**Preserve the workflow-core contract**:
- New vault behavior belongs in `src/workflows/` or `src/templates.ts`; GUI, CLI, and MCP
  adapters should stay focused on input shape, output shape, and host integration.
- If GUI and CLI would duplicate behavior, move the shared side effect down into
  `src/workflows/`. Do not fix drift by copying logic between adapters.
- MCP remains a CLI proxy. `src/mcp/` maps tool calls to native CLI argv via `execFile`;
  it must not import the workflow core.

**Keep vault safety visible**:
- Reads must not write. Assigning ids, backfilling references, moving notes, or changing
  frontmatter belongs behind explicit mutation operations.
- Same-note mutations must preserve the existing write-serialization boundaries. Do not
  bypass `serializeFileWrite` for task shards, references, body edits, or other
  read-modify-write flows.
- `para-zk:setup` remains idempotent: matching managed scaffolding is not rewritten,
  differing managed scaffolding is overwritten, and `dryRun=true` reports without
  writing. Refactors must not expand setup writes to user content notes.

**Keep platform boundaries visible**:
- The plugin bundle must stay mobile-loadable: no eager top-level Node imports outside
  the MCP process, and desktop-only CLI Node access stays lazy inside async handlers.
- Core workflow/template/vault code must not import `cli/`, `ux/`, `runtime/`, or MCP.
- Optional host or platform behavior should live at the adapter/runtime boundary, not in
  foundation or workflow code.

**Narrow public surface during refactors**:
- Keep canonical production imports stable when they are the real API.
- Do not preserve compatibility shims just because old names existed; legacy CLI aliases
  are intentionally rejected unless a migration has been explicitly chosen.
- Do not export private helpers from `index.ts` for tests. Tests should import the
  production API or the direct owner module when they intentionally validate a low-level
  contract.

**Tests must not distort production code**:
- Production code solely for tests is forbidden.
- Production code that makes an essential behavior inspectable is allowed, but the
  behavior must be part of the real runtime contract.
- When a refactor changes architecture, prove the boundary with focused tests plus
  `pnpm run lint`, `pnpm run test`, and `pnpm run build`. Run `pnpm run smoke:vault`
  when the change touches live Obsidian behavior such as link rewriting, backlinks,
  renderers, setup, or dependency config.

## Source Tree Policy

| Directory | Layer | Contents | Modification Rule |
|-----------|-------|----------|-------------------|
| `src/` root (layout, types, records, text, time, i18n, vocabulary, plugin-interface) | L0 Foundation | Fixed vault layout, leaf utilities & types | Depend only on each other; no Obsidian/adapter imports |
| `src/zk/`, `src/props/` | L0 Foundation | ZK-kind & frontmatter-prop schemas | Same as L0 |
| `src/vault/` | L1 Vault primitives | Obsidian file/frontmatter/section/path access | May import L0; type-only edge to `workflows/context` allowed |
| `src/workflows/`, `src/templates.ts` | L2 CORE | Canonical PARA/ZK operations, managed templates | May import L0/L1 only — NEVER `cli/`, `ux/`, `runtime/` |
| `src/cli/` | L3 Adapter | LLM/automation CLI over workflows | May import L0–L2; NEVER `ux/` |
| `src/ux/` | L3 Adapter | Obsidian GUI: commands, ribbon, renderers, controls | May import L0–L2; NEVER `cli/` |
| `src/runtime/` | L3 Adapter | Settings, idempotent setup, dependency config | May import L0–L2; NEVER `ux/` or `cli/` |
| `src/mcp/` | L3 Adapter | Thin MCP server; proxies the native CLI via `execFile` | Isolated — imports only `records`; does NOT link the core |
| `src/main.ts`, `src/mcp/server.ts` | L4 Entry | Plugin composition root / MCP process entry | Wire adapters together |

Key rules (enforced by `pnpm run lint:architecture`):
1. Layer dependency: code in Lx may only depend on L0..L(x-1).
2. `runtime/` must not import `ux/` or `cli/`.
3. `cli/` must not import `ux/`; `ux/` must not import `cli/`.
4. Core (`workflows/*`, `templates.ts`) must not import `cli/`, `ux/`, or `runtime/`.

See `docs/ARCHITECTURE.md` for the current dependency graph and module role tables.

## Agent System Philosophy

- **Tiered Expertise**: OPUS for safety (plugin-lifecycle, surface-contract), SONNET for
  domain/quality (layer-boundary, critics).
- **Mandatory Consultations**: Cross-surface changes require multiple agents (see
  `.claude/rules/agents.md`).
- **Final validation**: `Skill(tier-review)` as the mandatory last step.
