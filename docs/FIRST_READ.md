# First Read: PARA-ZK Project Intent

This document is the first context an LLM or automation agent should read before
changing this repository. It explains the product intent, the reference vaults,
and the contract between the GUI and CLI surfaces.

## Purpose

PARA-ZK is a native Obsidian plugin that turns a hand-built PARA and
Zettelkasten vault setup into repeatable plugin-owned workflows.

The original workflow lives in the user's Overmind vault. That vault was built
manually with Obsidian folders, templates, dashboards, QuickAdd choices,
Templater snippets, Meta Bind buttons, Dataview, Tasks, Tabs, and JavaScript
helper scripts. This repository exists to move those behaviors into a native
plugin so they can be invoked reliably by both humans and LLM-driven automation.

The main product goal is not only to make Obsidian nicer for a person. It is to
let an LLM create and maintain knowledge-work structures in the vault: create a
project, attach it to areas, add child notes, create resources, capture journal
memos, create ZK notes, promote resources into ZK, promote fleeting notes, and
keep the resulting frontmatter and backlinks coherent.

## Reference Vaults

Use these vaults with different trust levels:

- `/home/kang/documents/Overmind` is the read-only reference. It represents the
  original hand-built PARA/ZK setup and the user's intended behavior. Never
  modify it from this repository work. Read it only to compare templates,
  dashboards, QuickAdd flows, Meta Bind actions, and JavaScript helper behavior.
- `/home/kang/documents/para-zk` is the usual disposable test vault, but the
  exact test vault name or path may vary between machines and sessions. Infer it
  from local context when needed: look for a vault that has `.obsidian`, a
  `para-zk` plugin install, or is clearly named for PARA-ZK testing. It may be
  cleared, reinitialized, and filled with smoke-test notes to validate this
  plugin. Do not treat its current contents as a specification; older generated
  files may not match the current source.
- This repository is the implementation source of truth. Generated vault output
  must be judged against current source code and the Overmind reference intent,
  not against stale test-vault artifacts.

## GUI And CLI Contract

The GUI and CLI should share the same canonical workflow logic, but they do not
need the same input surface.

GUI commands are for people inside Obsidian. They should be direct, pleasant, and
low-friction. A GUI command may ask only for a title or a simple choice, infer
context from the active file, and open the created note.

CLI handlers are for LLMs and automation. They should be richer than the GUI:
accept explicit paths, dates, status codes, priority codes, maturity codes,
subnote types, links, open flags, dry-run flags, and other structured options
that let an LLM satisfy the user's request in one call. CLI output should be
token-efficient JSON with stable fields such as `ok`, `command`, `path`,
`created`, `sourcePath`, `archivedPath`, `warnings`, and `error`.

"GUI and CLI behave the same" means they call the same core workflow functions
and produce the same kind of vault side effects. It does not mean the CLI should
copy the GUI prompts or limit itself to human-oriented interaction.

CLI option values should be locale-neutral codes. Store values such as
`status: in_progress`, `priority: high`, `maturity: draft`, and
`subnote_type: meeting`; render localized labels in the GUI and generated
Markdown where appropriate.

## Architecture

The core behavior belongs in `src/workflows.ts`. GUI commands, inline buttons,
dashboard action blocks, and native CLI handlers should call this workflow layer
instead of duplicating business logic.

The LLM-facing CLI contract is documented in `docs/CLI.md`.
The Overmind-to-PARA-ZK behavior mapping is documented in
`docs/OVERMIND_MAPPING.md`.

Important modules:

- `src/workflows.ts`: canonical PARA/ZK operations and vault side effects.
- `src/templates.ts`: managed templates, vault guide, and dashboard artifacts.
- `src/cli/handlers.ts`: LLM-friendly native CLI adapter over workflows.
- `src/ux/workflow-commands.ts`: human-friendly Obsidian command adapter.
- `src/ux/inline-actions.ts`: `PZK[...]` Markdown action buttons.
- `src/ux/props-controls.ts`: native `para-zk-props` controls for frontmatter.
- `src/ux/dashboard-actions.ts`: native Home dashboard action block.
- `src/ux/dashboard-summary.ts`: native dashboard summary cards.
- `src/runtime/init.ts`: idempotent vault initialization and managed file writes.
- `src/runtime/dependencies.ts`: Dataview, Tasks, Tabs, Folder Notes, Update
  time on edit, Trash Explorer, Custom File Explorer sorting, and Homepage dependency handling.

The architecture lint intentionally rejects content-blank modules and enforces
layer boundaries. Keep core workflow/template modules independent from CLI, UX,
and runtime adapters.

## Behavioral Expectations

`para-zk:init` should be idempotent. It creates the PARA/ZK layout, managed
templates under `Templates/para-zk`, dashboards under `Dashboard`, and a root
vault guide. Existing non-managed files are skipped. Managed files are updated
only when safe or when `force=true` is requested.

Generated templates should no longer depend on Meta Bind, QuickAdd, or
Templater. Native plugin blocks and tokens replace the old Overmind mechanisms:

- `PZK[...]` replaces Meta Bind buttons for workflow actions.
- `para-zk-props` and `PZK_INPUT[...]` replace Meta Bind input controls.
- `para-zk-dashboard-actions` replaces Home dashboard button callouts.
- `para-zk-dashboard-summary` replaces DataviewJS-only summary cards.

Dataview and Tasks remain query engines. PARA-ZK should not try to replace them.
Tabs may still be used for generated task views where it matches the Overmind
experience. Folder Notes is required because PARA-ZK uses folder-style project
and area notes, where a folder and its main note share the same name.
Update time on edit is required to keep `created` and `updated` frontmatter
current after human edits in Obsidian.
Trash Explorer is required for reviewing and emptying the local `.trash` folder;
PARA-ZK owns the replacement for the old Commander explorer empty-trash button.
Custom File Explorer sorting is required for the stable PARA/ZK explorer order.
PARA-ZK configures bookmark-based sorting and creates the baseline `sortspec`
bookmarks group only when it is missing.
Homepage is required for opening the generated Home dashboard on startup and when
the workspace is empty.

Folder-style notes are part of the workflow. Projects and areas are created as
folders containing their main note. Child documents and child areas should link
back through frontmatter so Dataview queries can discover them.

Promotion behavior should preserve traceability:

- Promoting a resource creates a ZK note and links back to the resource.
- Promoting a fleeting note creates a Literature or Permanent note, moves the
  source fleeting note into `ZK/Fleeting/Archives`, marks it processed, and links
  it to the promoted note.

## Verification Workflow

For local validation, use the disposable test vault. The examples below use the
common local path `/home/kang/documents/para-zk`; if the test vault has a
different name, infer the correct path from the local Obsidian vaults and plugin
install directories.

```bash
OBSIDIAN_PLUGIN_DIR=/home/kang/documents/para-zk/.obsidian/plugins/para-zk npm run build
optsidian open-gui vault-path=/home/kang/documents/para-zk
optsidian raw plugin:reload id=para-zk
optsidian raw para-zk:init installDeps=true format=json
```

The default locale is English. Pass `locale=ko` only when validating Korean
generated headings, labels, and tags.

The automated smoke test wraps the same flow and verifies generated files:

```bash
npm run smoke:vault -- --vault /home/kang/documents/para-zk
npm run smoke:vault -- --vault /home/kang/documents/para-zk --clean
```

When a clean test is needed, preserve `.obsidian` and clear the rest of
`/home/kang/documents/para-zk`, then remove
`/home/kang/documents/para-zk/.obsidian/plugins/para-zk/data.json` before
running `para-zk:init`.

Representative CLI smoke tests should cover:

- `para-zk:create-area`
- `para-zk:create-project` with `areas`, `status`, and `priority`
- `para-zk:create-subnote`
- `para-zk:create-subarea`
- `para-zk:create-resource` with `file_path` and link insertion
- `para-zk:create-retro`
- `para-zk:create-zk`
- `para-zk:capture-journal`
- `para-zk:promote-resource`
- `para-zk:promote-fleeting`
- `para-zk:init dryRun=true` after initialization

Always run `npm run lint` and `npm run build` before considering behavior
changes complete.

## Development Rules

Read Overmind for intent, but do not mutate it.

Use the disposable `para-zk` vault for destructive testing, initialization tests,
and smoke-test notes. Its contents are not authoritative.

Prefer extending existing workflow functions and adapters over creating parallel
logic. If GUI and CLI drift, move the shared behavior down into `workflows.ts`
and keep each adapter focused on input and output shape.

Update `docs/CHANGELOG.md` for notable behavior, workflow, CLI, template,
dashboard, or dependency changes.
