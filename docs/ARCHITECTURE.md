# Architecture

PARA-ZK is a native Obsidian plugin whose canonical PARA/ZK workflow logic is shared by
three surfaces — the Obsidian GUI, a native CLI, and a thin MCP server. This document
describes the layering that keeps that core reusable and the surfaces consistent.

## Layer Model

Six tiers, dependencies pointing strictly downward:

```
L4  Entry        main.ts (plugin)            mcp/server.ts (separate MCP process)
                    │  │  │                        │
L3  Adapters    ┌── ux/   cli/   runtime/ ──┐   mcp/  (isolated: imports records only,
                │     \     |     /          │          proxies the native CLI via execFile)
L2  CORE        │      workflows/* + templates.ts
                │            │
L1  Vault       │      vault/ (files, frontmatter, sections, paths, host)
                │            │
L0  Foundation  └─ layout · types · records · text · time · i18n · vocabulary ·
                   plugin-interface · zk/kinds · props/schema
```

Arrows = "depends on". `ux/`, `cli/`, and `runtime/` each call into L2 core; they never
call each other. The MCP server does **not** import the core — see *Surfaces* below.

## Dependency Rules (enforced by `pnpm run lint:architecture`)

`tools/check-architecture.mjs` fails the build on any of:

1. **Layer order** — code in Lx may depend only on L0..L(x-1).
2. `runtime/` must not import `ux/` or `cli/`.
3. `cli/` must not import `ux/`; `ux/` must not import `cli/`.
4. Core (`src/workflows/*`, `src/templates.ts`) must not import `cli/`, `ux/`, or
   `runtime/`.

It also rejects content-blank filenames (`utils.ts`, `helpers.ts`, `shared.ts`, …), a
`src/shared/` directory, and re-exports (`export … from`) outside `index.ts`.

One intentional exception: `src/vault/host.ts` imports the `WorkflowContext` **type**
from `workflows/context` (a type-only L1→L2 edge). The lint forbids only core→adapter
edges, so this is allowed.

## Foundation Module Roles

| Module | Responsibility |
|--------|----------------|
| `layout.ts` | Fixed PARA-ZK vault layout constants (`PARA_ZK_PATHS`, `LAYOUT_FOLDERS`) |
| `types.ts` | Runtime-mutable settings, CLI/result option types, setup/dependency result types |
| `records.ts`, `text.ts`, `time.ts`, `i18n.ts`, `vocabulary.ts` | Leaf utilities and locale/code dictionaries |
| `plugin-interface.ts` | Minimal plugin surface shared by adapters and renderers |
| `zk/kinds.ts`, `props/schema.ts` | ZK-kind and frontmatter-prop schemas |

## Surfaces

| Surface | Entry | How it reaches workflow logic |
|---------|-------|-------------------------------|
| GUI | `src/main.ts` → `src/ux/*` | Calls `src/workflows/` **directly** |
| Native CLI | `src/cli/handlers.ts` (registered by `registerNativeCliHandlers`) | Calls `src/workflows/` **directly**, then renders readable text |
| MCP | `src/mcp/server.ts` → `clients/para-zk-mcp.mjs` | **Discovery proxy** — exposes `conventions`/`describe` text from `optsidian`/`obsidian`; does NOT link the core |

GUI and CLI are two thin adapters over the same core (the "GUI and CLI behave the same"
contract). MCP is a separate Node process that drives only the discovery commands
through the host CLI. Vault mutations stay on the public CLI/host command runner, so
MCP changes are discovery text and fallback behavior, not core workflow changes.

## Core Module Roles (`src/workflows/`)

| Module | Responsibility |
|--------|----------------|
| `index.ts` | Barrel — public workflow API surface |
| `context.ts` | `WorkflowContext`/`WorkflowHost` + option/result types (imported everywhere) |
| `create.ts` | Create project/root area/nested area/resource/subnote/retro/ZK; template instantiation |
| `read.ts` | Surface reads (sections, frontmatter, collections, backlinks) |
| `update.ts` | Section/frontmatter/task mutations with the split guard |
| `rename.ts` | Folder-style renames + wikilink rewrites |
| `delete.ts` | Core-trash deletes + reference cleanup |
| `promote.ts` | `captureJournal`, `createFromResource`, `createFromDigest`, `distillSpark` |
| `references.ts` | Wikilink/markdown reference parsing, add/insert/update/reorder/delete |
| `backlinks.ts` | Read-only backlink resolution & counts |
| `tasks.ts` | Managed task registry: root map, shard files, checkbox cycling |
| `describe.ts` | Surface descriptors powering `para-zk:describe` |
| `locations.ts` | Folder-style path resolution, ZK-kind folders, archived counterparts |
| `collections.ts` | Pagination for collection reads |
| `code-options.ts` | Locale-neutral code parsing/validation |

`src/templates.ts` (also L2) generates managed templates, dashboards, and the vault
guide; it imports only L0/L1 modules.

`llm-wiki` is a first-class workflow surface in the same L2 modules above:
create/read/update/rename/delete, describe, locations, list, references, backlinks,
and audit. It is not a seventh layer and it does not change the L-layer model.
The `LLM-Wiki/` folder is a derived, LLM-owned synthesis layer in the vault:
wiki pages cite canonical PARA/ZK/resource notes, but canonical notes should not
depend on wiki pages.

## Extension Points (note chrome + native blocks)

Generated templates do not depend on Meta Bind, QuickAdd, or Templater. Native plugin
blocks and frontmatter-driven note chrome replace them, each with a renderer
registered in `onload()`:

| Block | Role |
|-------|------|
| Frontmatter `type` note chrome | Auto-renders props at the top and managed UI at the bottom in Reading view and Live Preview; content templates no longer carry `para-zk-props`/`para-zk-managed` fences |
| `para-zk-view` | Relationship Dataview queries + matching workflow buttons |
| `PZ_INPUT[...]` | Frontmatter input controls inside the props panel (replaces Meta Bind) |
| `para-zk-tasks` / `para-zk-references` | Render the managed task registry / frontmatter references |
| `para-zk-dashboard-actions` / `para-zk-dashboard-summary` | Home dashboard blocks |
| `para-zk-latest-retro-summary` | Project latest-retro summary widget |

## Plugin Lifecycle

`ParaZkPlugin.onload()` registers (in order) status/init commands, workflow commands,
editor-width control, ribbon/auto-template/explorer actions, dashboard action/block/summary
renderers, Dataview-view renderers, latest-retro-summary, props-controls, task renderers,
reference renderers, citation renderers/editor extension, note-chrome renderers/editor
extension, editor suggest, the setting tab, and finally `registerNativeCliHandlers(this)`.
There is no explicit `onunload` — all teardown relies on Obsidian's automatic `register*` cleanup, so any new
listener/interval/observer MUST go through a `register*` helper or add explicit teardown.
`setupVault()` lazy-`import()`s `src/runtime/setup.ts` to keep setup off the load path.

## Host API Dependency Map

- **Obsidian API** (`obsidian` package, external at build; `minAppVersion 1.0.0`):
  `Plugin`, `Vault`, `MetadataCache`, `Workspace`, `MarkdownPostProcessor`, `Setting`.
- **Native CLI host**: handlers register only if the host exposes `registerCliHandler`
  (optsidian / obsidian-native CLI). The plugin works as a pure GUI plugin without it.
- **Required community plugins** (configured by `para-zk:setup`, defined in
  `src/runtime/dependencies/index.ts`): Dataview, Tasks, Folder Notes, Update time on
  edit, Trash Explorer, Custom File Explorer sorting, Homepage, Open Tab Settings,
  Remember cursor position. Five (dataview, custom-sort, homepage, open-tab-settings,
  update-time-on-edit) have dedicated config modules under `src/runtime/dependencies/`.
- **MCP SDK** (`@modelcontextprotocol/sdk`): bundled into `clients/para-zk-mcp.mjs`.

See `docs/DEV_GUIDE.md` for build/test commands and `docs/CLI.md` / `docs/MCP.md` for the
surface contracts.
