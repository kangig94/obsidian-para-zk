# First Read: PARA-ZK Project Intent

This document is the first context an LLM or automation agent should read before
changing this repository. It explains the product intent, the test vaults,
and the contract between the GUI and CLI surfaces.

## Purpose

PARA-ZK is a native Obsidian plugin that turns a hand-built PARA and
Zettelkasten vault setup into repeatable plugin-owned workflows.

It owns the vault layout, generated templates, dashboards, workflow commands,
view toolbars, frontmatter controls, dependency configuration, and native CLI
surface needed to operate a PARA/ZK knowledge system from Obsidian or automation.

The main product goal is not only to make Obsidian nicer for a person. It is to
let an LLM create and maintain knowledge-work structures in the vault: create a
project, attach it to areas, add child notes, create resources, capture journal
memos, create ZK notes, promote resources into ZK, promote fleeting notes, and
keep the resulting frontmatter and backlinks coherent.

## Test Vaults

Use these vaults with different trust levels:

- The disposable test vault path may vary between machines and sessions. Prefer
  `$PARA_ZK_TEST_VAULT` when it is set; otherwise infer the vault from local
  context by looking for a vault that has `.obsidian`, a `para-zk` plugin
  install, or a name clearly meant for PARA-ZK testing. It may be cleared,
  rebuilt, and filled with smoke-test notes to validate this plugin. Do
  not treat its current contents as a specification; older generated files may
  not match the current source.
- This repository is the implementation source of truth. Generated vault output
  must be judged against current source code, not against stale test-vault
  artifacts.

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
`created`, `sourcePath`, `archived`, `warnings`, and `error`.
Each CLI concept should have one canonical argument name. Prefer rejecting
legacy or camelCase aliases with a direct error over accepting multiple spellings;
that keeps automation prompts and help output unambiguous.

Read commands should expose PARA-ZK editable surfaces, not raw Markdown files.
Their `key` arguments are stable map paths such as `frontmatter/status`,
`summary`, `children`, and `children/<child note title>/body`. They must not
depend on localized generated headings. Raw file reads, arbitrary patches, and
generic vault search belong to Optsidian; PARA-ZK read/update commands should
focus on template-safe PARA/ZK surfaces.
Full read payloads should be compact by default. Do not return static schema
keys, `archived: false`, null frontmatter values, empty sections, or
template-only scaffold content such as blank checkboxes, empty bullet lists, and
empty markdown tables. Full reads may compact frontmatter wikilinks to their
display titles; a `key` read may return exact stored values or an explicit empty
value because the user requested that exact surface.
Large collections such as `tasks` and `references` should use compact `count`
summaries in full reads. Exact
collection root reads return a paged object with `count`, `offset`, `limit`,
`returned`, `has_more`, and `items`; deeper keys such as
`tasks/<id>/name` and `references/<i>/link` return a single item or field. Full
read payloads must include `mode: "compact"` and summarize prose sections as
`{ chars: N }` (like collections' `{ count: N }`), with full text read on demand
via `key=<section>`; exact key reads must include `mode: "exact"`. The stable
`key=` roots per note type come from `para-zk:describe`, not the read payload.
Task collection reads are structured: each item exposes the literal checkbox
status character, task name, and parsed Tasks metadata instead of returning the
raw task section string. Tasks are not stored inline in project/area/journal
notes; PARA-ZK owns managed `Tasks/current` and `Tasks/archives` registries,
keyed by each root note's locale-independent `id`, and root templates render
that registry with `para-zk-tasks` blocks. Task shard files are intentionally
plain Markdown: `Tasks/current/<root id>.md` and
`Tasks/archives/<root id>.md` contain a `# Tasks` heading and task lines, with
no frontmatter mirror of root metadata. Archiving or restoring a root note moves
its task shard between those two registries.
PARA read commands may select archived notes with `archived=true`; the returned
`archived: true` field, when present, is the single code-level indicator for
that state.

Update commands should use the same stable map-path keys as read commands, but
only writable leaves are mutable. `frontmatter/<key>` uses structured Obsidian
frontmatter mutation and supports `op=set`. Section/body keys support
`op=set`, `op=append`, `op=prepend`, and exact literal `op=replace` scoped to
the selected key. Do not expose raw line/range editing through PARA-ZK; that is
Optsidian's responsibility.
Task updates must stay structural: insert with `key=tasks op=insert` and a
single `value_json` object, optionally with a 1-based `position`, update a task
field with `tasks/<id>/<field> op=set`, and delete a task with `tasks/<id>
op=delete`. Do not accept raw Markdown task lines as an alternate task update
path. Stored task lines use the Tasks plugin's default Emoji format for task ids
and metadata. Root ids are UUIDs because they are file-level link keys; task ids
are 8-character lower-case base36 tokens generated with a vault-wide collision
check.
Reference updates must stay structural too. References are stored in each note's
frontmatter `references` array as ordered bare-string canonical links or objects
`{ link, description? }`. The CLI handle is the absolute 0-based list index:
`references`, `references/<i>`, and `references/<i>/{link|description}`.
References use `op=insert` with a 0-based `position` inside `value_json`; this
is intentionally different from task insert's 1-based position. `kind`, `path`,
and `target` are derived read-only fields. Duplicate canonical links are no-op
inserts or rejected link updates, never merged records.

Structural changes should stay domain-specific. Use `rename-project`,
`rename-area`, `rename-resource`, and `rename-zk` for title/path changes instead
of exposing a generic move command. Project archive and restore behavior is
status-driven: setting `frontmatter/status` to `archived` moves the project into
`PARA/Archives/Projects`, and setting a non-archived status on the archived copy
restores it to the active Projects folder.

Delete commands should also stay domain-specific and use Obsidian core trash
APIs. Do not depend on Trash Explorer for deletion; Trash Explorer is only a GUI
helper for reviewing or emptying `.trash`. Body backlinks should remain in place
as historical context and be reported in JSON. Only PARA-ZK-owned relationships,
such as `areas`, `project`, `parent`, `promoted_to`, and frontmatter
`references` items, should be cleaned automatically.

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

Important modules:

- `src/workflows.ts`: canonical PARA/ZK operations and vault side effects.
- `src/templates.ts`: managed templates, vault guide, and dashboard artifacts.
- `src/cli/handlers.ts`: LLM-friendly native CLI adapter over workflows.
- `src/ux/workflow-commands.ts`: human-friendly Obsidian command adapter.
- `src/ux/managed-sections.ts`: `para-zk-managed` wrapper for template-managed UI tails.
- `src/ux/dataview-views.ts`: native `para-zk-view` wrappers around managed Dataview queries and their toolbar actions.
- `src/ux/latest-retro-summary.ts`: native project latest-retro summary widget.
- `src/ux/workflow-buttons.ts`: shared GUI workflow button creation.
- `src/ux/props-controls.ts`: native `para-zk-props` controls for frontmatter.
- `src/ux/dashboard-actions.ts`: native Home dashboard action block.
- `src/ux/dashboard-summary.ts`: native dashboard summary cards.
- `src/runtime/setup.ts`: idempotent vault setup and managed file writes.
- `src/runtime/dependencies/index.ts`: Dataview, Tasks, Folder Notes, Update
  time on edit, Trash Explorer, Custom File Explorer sorting, Homepage, Open
  Tab Settings, and Remember cursor position dependency handling.

The architecture lint intentionally rejects content-blank modules and enforces
layer boundaries. Keep core workflow/template modules independent from CLI, UX,
and runtime adapters.

## Behavioral Expectations

`para-zk:setup` should be idempotent. It creates the PARA/ZK layout, managed
templates under `Templates/para-zk`, dashboards under `Dashboard`, and a root
vault guide. Existing non-managed files are skipped. Managed files are updated
only when safe or when `force=true` is requested.

Generated templates should not depend on Meta Bind, QuickAdd, or Templater.
Native plugin blocks and controls replace legacy prompt/script mechanisms:

- `para-zk-managed` keeps generated template UI tails in one compact block.
- `para-zk-view` integrates relationship Dataview queries with matching workflow buttons.
- `para-zk-latest-retro-summary` replaces the old project-summary DataviewJS callout.
- `para-zk-props` and `PZK_INPUT[...]` replace Meta Bind input controls.
- `para-zk-dashboard-actions` replaces Home dashboard button callouts.
- `para-zk-dashboard-summary` replaces DataviewJS-only summary cards.
- `para-zk-tasks` renders the hidden task registry inside root notes.
- `para-zk-references` renders frontmatter-backed references inside root notes.

Dataview remains the query engine for note relationships. Tasks remains enabled
for Tasks-compatible status and metadata syntax, while PARA-ZK owns the root task
registry and rendered task controls. Folder Notes is required because PARA-ZK
uses folder-style project and area notes, where a folder and its main note share
the same name.
Update time on edit is required to keep `created` and `updated` frontmatter
current after human edits in Obsidian.
Trash Explorer is required for reviewing and emptying the local `.trash` folder;
PARA-ZK owns the replacement for the old Commander explorer empty-trash button.
Custom File Explorer sorting is required for the stable PARA/ZK explorer order.
PARA-ZK configures bookmark-based sorting and creates the baseline `sortspec`
bookmarks group only when it is missing.
Homepage is required for opening the generated Home dashboard on startup and when
the workspace is empty.
Open Tab Settings is required so PARA-ZK navigation (ribbon, dashboard, inline
actions) opens notes with consistent open-in-new-tab / no-duplicate-tab behavior;
PARA-ZK configures it to open in new tabs, prevent duplicate tabs, and focus
explicitly-created new tabs.
Remember cursor position is required so frequent navigation across dashboards,
root notes, and child notes restores each note's cursor and scroll position;
PARA-ZK installs and enables Remember cursor position but does not force its options.

Folder-style notes are part of the workflow. Projects and areas are created as
folders containing their main note. Child documents and child areas should link
back through frontmatter so Dataview queries can discover them.

Promotion behavior should preserve traceability:

- Promoting a resource creates a ZK note and links back to the resource.
- Promoting a fleeting note creates a Literature or Permanent note, keeps the
  source fleeting note in place, marks it processed, and links it to the
  promoted note.
- Fleeting notes do not have an archive folder. Completed fleeting work is
  represented by `processed: true`.

## Verification Workflow

For local validation, use the disposable test vault. Set `PARA_ZK_TEST_VAULT` or
replace `/path/to/para-zk-test-vault` with the local disposable vault path.

```bash
export PARA_ZK_TEST_VAULT=/path/to/para-zk-test-vault
OBSIDIAN_PLUGIN_DIR="$PARA_ZK_TEST_VAULT/.obsidian/plugins/para-zk" npm run build
optsidian open-gui vault-path="$PARA_ZK_TEST_VAULT"
optsidian raw plugin:reload id=para-zk
optsidian raw para-zk:setup installDeps=true format=json
```

The default locale is English. Pass `locale=ko` only when validating Korean
generated headings, labels, and tags.

The automated smoke test wraps the same flow and verifies generated files:

```bash
npm run smoke:vault -- --vault "$PARA_ZK_TEST_VAULT"
npm run smoke:vault -- --vault "$PARA_ZK_TEST_VAULT" --clean
```

When a clean test is needed, preserve `.obsidian` and clear the rest of
the disposable vault, then remove
`$PARA_ZK_TEST_VAULT/.obsidian/plugins/para-zk/data.json` before running
`para-zk:setup`.

Representative CLI smoke tests should cover:

- `para-zk:create-area`
- `para-zk:create-project` with `areas`, `status`, and `priority`
- `para-zk:read-project` with no `key`, a frontmatter key, `children`, and a
  child-note key path
- `para-zk:read-project key=tasks` with paged structured task items, literal
  checkbox status characters, names, due dates, priority, and collection filters
- `para-zk:update-project key=tasks op=insert`, positional insert,
  `tasks/<id>/<field> op=set`, and `tasks/<id> op=delete`
- `para-zk:read-project key=references` with paged items, `references/<i>`,
  `references/<i>/<field>`, `ref_kind` filters, and numeric index keys
- `para-zk:update-project key=references op=insert`, 0-based positional insert,
  duplicate insert no-op, `references/<i>/{link|description} op=set`,
  description clears, duplicate link rejection, and `references/<i> op=delete`
- `para-zk:read-area`, `para-zk:read-resource`, `para-zk:read-zk`,
  `para-zk:read-journal`, and `para-zk:read-retro` using the same stable map
  key algorithm
- `para-zk:update-project`, `update-area`, `update-resource`, `update-zk`,
  `update-journal`, and `update-retro` using writable stable map keys and
  scoped set/append/replace operations
- project archive and restore through `update-project key=frontmatter/status`
- `para-zk:rename-project`, `rename-area`, `rename-resource`, and `rename-zk`
- `para-zk:delete-project`, `delete-area`, `delete-resource`, `delete-zk`,
  `delete-journal`, and `delete-retro`, including Trash Explorer disabled
- `para-zk:add-reference` with a vault-relative source `path` and URL/file/note target
- `para-zk:create-subnote`
- `para-zk:create-subarea`
- `para-zk:create-resource` with `path` and link insertion
- `para-zk:create-retro`
- `para-zk:create-zk`
- `para-zk:capture-journal`
- `para-zk:promote-resource`
- `para-zk:promote-fleeting`
- `para-zk:setup dryRun=true` after initialization

Always run `npm run lint` and `npm run build` before considering behavior
changes complete.

## Development Rules

Use the disposable `para-zk` vault for destructive testing, initialization tests,
and smoke-test notes. Its contents are not authoritative.

Prefer extending existing workflow functions and adapters over creating parallel
logic. If GUI and CLI drift, move the shared behavior down into `workflows.ts`
and keep each adapter focused on input and output shape.

Update `docs/CHANGELOG.md` for notable behavior, workflow, CLI, template,
dashboard, or dependency changes.
