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

**Idempotent, Non-Destructive Setup**: `para-zk:setup` re-runs safely. Existing
non-managed files are skipped; managed files update only when safe or with `force=true`.

**No Content-Blank Modules**: No `utils.ts`/`helpers.ts`/`shared/`; every module has a
role-specific name. Re-exports live only in `index.ts`.

## Source Tree Policy

| Directory | Layer | Contents | Modification Rule |
|-----------|-------|----------|-------------------|
| `src/` root (types, records, text, time, i18n, vocabulary, plugin-interface) | L0 Foundation | Leaf utilities & types | Depend only on each other; no Obsidian/adapter imports |
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
