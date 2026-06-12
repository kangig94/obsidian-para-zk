# PARA-ZK - Development Instructions

PARA-ZK is a native Obsidian plugin (TypeScript) that turns a hand-built PARA +
Zettelkasten vault into repeatable, plugin-owned workflows. The same canonical
workflow logic is exposed through three surfaces: the Obsidian **GUI** (commands,
ribbon, rendered blocks), a native **CLI** for LLMs/automation, and a thin **MCP**
server. It ships as both an Obsidian community plugin and a Claude Code / Codex plugin.

**Critical Requirements**:
- Core logic lives in `src/workflows/` + `src/templates.ts` and must stay independent
  of the `cli/`, `ux/`, and `runtime/` adapters (enforced by `pnpm run lint:architecture`).
- GUI, CLI, and MCP must stay behavior-consistent by sharing `src/workflows/` — never
  duplicate business logic in an adapter.
- CLI/MCP values are locale-neutral codes (`status=in_progress`); localized labels are
  rendered only in the GUI and generated Markdown.
- Never corrupt vault data; `para-zk:setup` is idempotent.
- `isDesktopOnly: false` — the plugin bundle must load on mobile: no eager top-level
  Node imports. GUI/core/vault/runtime use no Node APIs; the desktop-only CLI adapter
  (`src/cli/`) may use Node but only via lazy `import()` inside handlers (never top-level).

**Key Documentation**:
- `docs/FIRST_READ.md` - Product intent, GUI/CLI contract, behavioral expectations (read first)
- `docs/ARCHITECTURE.md` - Six-layer model, dependency rules, surface design
- `docs/DEV_GUIDE.md` - Build/test/lint/smoke commands, env vars, versioning (single source)
- `docs/CLI.md` - Exhaustive CLI contract; `docs/MCP.md` - MCP tool contract

**Build Commands**:
```bash
pnpm install
pnpm run lint      # architecture guard + knip deadcode + tsc --noEmit
pnpm run test      # Vitest unit suite against an in-memory Obsidian mock
pnpm run build     # esbuild: src/main.ts -> main.js, src/mcp/server.ts -> clients/para-zk-mcp.mjs
pnpm run smoke:vault -- --vault /path/to/disposable-vault   # live Obsidian E2E
```

Rules in `.claude/rules/` are auto-loaded. Domain-specific rules activate based on file
paths being edited via `paths:` frontmatter.

Good code guides readers naturally — structure reveals intent without requiring explanation.

## Workflow

**Before**: Read `docs/FIRST_READ.md`, `docs/ARCHITECTURE.md`, and `docs/DEV_GUIDE.md`.
Identify required agent consultations from the matrix in `.claude/rules/agents.md`.

**During**: Invoke domain agents per the consultation matrix. Keep business logic in
`src/workflows/`; keep adapters (`cli/`, `ux/`, `runtime/`, `mcp/`) thin. Respect the
layer dependency rules.

**After Implementation** (strict order, fail-fast by cost):

**Scope gate**: Steps 1-4 apply only when source-affecting files are modified (source
code, build config, dependencies). Non-source changes (docs, agent definitions) skip.

1. **Lint** - `pnpm run lint`
2. **Review Gate** - invoke `Skill(tier-review)`. BLOCKING items must pass before build.
3. **Build** - `pnpm run build`
4. **Test** - `pnpm run test` (and `pnpm run smoke:vault` when behavior touches the live
   Obsidian engine: link rewriting, backlinks, renderers, dependency config). All tests
   must pass and errors must be zero. Never assume a failure is "pre-existing" without
   tracing the stack and confirming the affected code was not modified.
5. **Changelog** - update `docs/CHANGELOG.md` for notable behavior/CLI/template/dependency changes.
