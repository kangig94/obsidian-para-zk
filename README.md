# PARA-ZK

Native Obsidian plugin for PARA and Zettelkasten workflows.

When Obsidian is running, the plugin can expose native CLI handlers through Obsidian's own CLI.

## Commands

GUI commands:

- `PARA-ZK: Set up PARA-ZK vault`
- `PARA-ZK: Check plugin status`
- `PARA-ZK: Create project`
- `PARA-ZK: Create area`
- `PARA-ZK: Create resource`
- `PARA-ZK: Create subnote`
- `PARA-ZK: Create subarea`
- `PARA-ZK: Create retro`
- `PARA-ZK: Create ZK note`
- `PARA-ZK: Open daily note`
- `PARA-ZK: Quick memo`
- `PARA-ZK: Promote resource to ZK`
- `PARA-ZK: Promote fleeting note`

PARA-ZK also adds left-ribbon shortcuts for the main human workflows:
project, area, resource, ZK, daily note, and quick memo. It adds a file-explorer
header shortcut for Trash Explorer's empty-trash command, replacing the old
Commander explorer button.

`PARA-ZK: Set up PARA-ZK vault` opens an options modal in the Obsidian GUI.
When invoked through Obsidian's command passthrough, it also accepts command
arguments. Use `force=true` to regenerate managed files instead of exposing a
separate sync command.

Native CLI handlers, when supported by the running Obsidian app:

```bash
obsidian para-zk:describe format=json
obsidian para-zk:describe type=project format=json
obsidian para-zk:setup format=json
obsidian para-zk:setup dryRun=true force=true locale=en format=json
obsidian para-zk:setup locale=ko format=json
obsidian para-zk:setup installDeps=true format=json
obsidian para-zk:attach-file source="/tmp/image.png" format=json
obsidian para-zk:attach-file sources='["/tmp/image.png","/tmp/spec.pdf"]' format=json
obsidian para-zk:attach-file source="/tmp/media" recursive=true format=json
obsidian para-zk:create-project title="Project name" area_titles='["AI","Software"]' status=in_progress priority=high format=json
obsidian para-zk:read-project title="Project name" key=frontmatter/status format=json
obsidian para-zk:read-project title="Finished project" archived=true key=summary format=json
obsidian para-zk:read-project title="Project name" key="children/Meeting notes/body" format=json
obsidian para-zk:read-area title="AI" key=children format=json
obsidian para-zk:read-area title="AI" key=backlinks type=project format=json
obsidian para-zk:read-resource title="Source" key=body format=json
obsidian para-zk:read-zk title="Idea" kind=fleeting key=memo format=json
obsidian para-zk:read-journal date=2026-05-30 key=quick_memo format=json
obsidian para-zk:update-project title="Project name" key=summary op=replace match="old" with="new" format=json
obsidian para-zk:update-project title="Project name" key="children/Meeting notes/body" op=append value="Decision: continue." format=json
obsidian para-zk:update-project title="Project name" key=frontmatter/status op=set value=archived format=json
obsidian para-zk:rename-project title="Project name" new_title="Renamed project" format=json
obsidian para-zk:add-reference path="PARA/Projects/Project name/Project name.md" target="https://example.com/source" label="Source" format=json
obsidian para-zk:create-resource path="PARA/Projects/Project name/Project name.md" title="Source" format=json
obsidian para-zk:rename-resource title="Source" new_title="Renamed source" format=json
obsidian para-zk:delete-resource title="Source" format=json
obsidian para-zk:create-subnote path="PARA/Projects/Project name/Project name.md" title="Meeting notes" subnote_type=meeting format=json
obsidian para-zk:create-zk title="Idea" kind=fleeting format=json
obsidian para-zk:delete-zk title="Idea" kind=fleeting format=json
obsidian para-zk:promote-fleeting path="ZK/Fleeting/Idea.md" kind=permanent maturity=evergreen title="Evergreen idea" format=json
obsidian para-zk:capture-journal content="Quick memo" energy=normal format=json
```

CLI option values use locale-neutral codes only. For example, pass
`status=in_progress` instead of `status="1. 진행중"`; the plugin renders the
localized label inside the generated note.
Use `para-zk:describe` to inspect supported surface types, stable read/write
keys, and collection filters in compact JSON form.
Use `para-zk:attach-file` to copy local files or directories into the vault
attachment folder (`assets` by default); it returns both `link` and `embed`
strings for Markdown insertion. Single file sources return one attached file.
Multiple sources or directory sources return `count` and `files`; directory
sources are copied under `assets/<directory-name>/...` and include nested files
unless `recursive=false`.
Read commands use the same rule: `key=frontmatter/status`, `key=summary`, and
`key="children/Meeting notes/body"` are stable CLI map paths and do not depend
on the generated Markdown locale. Read commands also support
`key=backlinks`, a paged inbound resolved-link collection; pass `type=project`
or another source note frontmatter type to filter backlinks by source type.
Update commands use the same stable keys, but only for writable leaves:
frontmatter keys use `op=set`, while section/body keys support `set`, `append`,
`prepend`, and exact literal `replace`.
Changing a project with `key=frontmatter/status op=set value=archived` moves the
project into `PARA/Archives/Projects`; setting a non-archived status on the
archived copy restores it to the active Projects folder.
Delete commands move notes or folder-style note containers to Obsidian trash
using core APIs, not Trash Explorer. Body backlinks are preserved and reported;
PARA-ZK only cleans owned frontmatter relationships and standalone References
section link lines.

When `locale` is omitted, PARA-ZK defaults to English. Pass `locale=ko` when a
Korean vault UI and generated Markdown are desired.
Changing the locale from the GUI settings or setup command refreshes command
palette and ribbon labels in place, without moving existing ribbon icons.

`para-zk:setup` creates the PARA/ZK vault layout, managed template reference files under
`Templates/para-zk`, Dataview/Tasks dashboard files under `Dashboard`, and a root vault guide.
It also merges required Obsidian core settings such as automatic link updates, the
`assets` attachment folder, local Obsidian trash, excluded generated/reference folders,
hidden document properties, and the core Templates folder. It is idempotent.
Existing non-managed files are skipped, and changed managed files are only overwritten
with `force=true`.

`para-zk:setup` also checks required community plugin dependencies. It warns when
Dataview, Tasks, Folder notes, Update time on edit, Trash Explorer, Custom
File Explorer sorting, Homepage, Open Tab Settings, or Remember cursor position
is missing or disabled. Pass `installDeps=true` to install and enable those dependencies. When Dataview is installed, PARA-ZK also
enables Dataview JavaScript queries because the generated dashboards use `dataviewjs`
blocks. When Update time on edit is installed, PARA-ZK configures `created` and
`updated` frontmatter maintenance for editable notes while excluding generated
templates, dashboards, assets, and the managed root guide. When Custom File Explorer
sorting is installed, PARA-ZK configures bookmark-based sorting with a baseline
`sortspec` group. When Homepage is installed, PARA-ZK opens `Dashboard/HomePage`
on startup and when the workspace is empty. Remember cursor position is installed
and enabled so note cursor and scroll positions survive navigation.

The generated templates use a single `para-zk-managed` block for the managed UI
tail below user-authored content. It expands to native PARA-ZK view blocks for
relationship lists and task/reference widgets. Project templates keep
`para-zk-latest-retro-summary` directly under the Summary heading, replacing the
old long DataviewJS snippet without moving that summary out of context. Views
such as subnotes, retros, and ZK promotion render their workflow buttons inside
the view toolbar, so action controls live with the list they modify.

The generated Home dashboard uses a native `para-zk-dashboard-actions` block to render
grouped action buttons and dashboard navigation without Meta Bind or callout wrappers.
Dashboard summary cards use native `para-zk-dashboard-summary` blocks so card layout
and metric calculation are owned by PARA-ZK instead of DataviewJS snippets.

Generated templates also use native PARA-ZK props controls:

````markdown
```para-zk-props
type: project
```
````

These controls edit frontmatter directly through Obsidian and store locale-neutral
codes such as `status: in_progress` while rendering localized labels in the GUI.
Individual controls can be embedded with inline tokens such as
`` `PZK_INPUT[project.status]` ``.

Query/dashboard sections are generated as PARA-ZK view, Dataview, and Tasks
blocks. PARA-ZK wraps selected relationship Dataview queries with native
toolbars and owns project-local summary widgets, while Dataview remains the
query engine for broader dashboard tables.

## Development

Start with [docs/FIRST_READ.md](docs/FIRST_READ.md) for the project intent,
test-vault rules, and the GUI/CLI contract.

See [docs/CLI.md](docs/CLI.md) for the LLM-facing native CLI contract.
See [docs/CHANGELOG.md](docs/CHANGELOG.md) for the current development changelog.

```bash
npm install
npm run lint
npm run test
npm run build
```

Tests are split by what they need to run. `npm run test` runs the Vitest unit
suite (`test/`), which drives the workflow/CLI logic against an in-memory
Obsidian mock (`test/harness`, `test/mocks/obsidian.ts`) plus the pure helper
modules — no Obsidian process required. `npm run smoke:vault` keeps only the
checks that need Obsidian's real engine (dependency install/config, GUI ribbon
and command labels, Homepage runtime, rename link rewriting, backlink
resolution, and the live reference/task-block renderers).

The build treats the repository root as the Obsidian plugin deployment shape:
`manifest.json`, `main.js`, and `styles.css`. CSS source lives in
`assets/styles.css`; build copies it to root `styles.css`.

For local auto-sync, copy `.env.example` to `.env` and set `OBSIDIAN_PLUGIN_DIR`.

```bash
npm run watch
npm run sync
```

For disposable-vault smoke testing. By default it wipes the vault contents and
re-initializes from scratch so each run verifies a clean setup; pass `--no-clean`
to run against the vault's current contents instead:

```bash
npm run smoke:vault -- --vault /path/to/test-vault
npm run smoke:vault -- --vault /path/to/test-vault --no-clean
```

`npm run lint` runs the structural architecture guard and TypeScript check. The
architecture guard rejects content-blank modules such as `utils.ts`, `shared/`
catch-all folders, and non-`index.ts` convenience re-exports.
