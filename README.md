# PARA-ZK

Native Obsidian plugin for PARA and Zettelkasten workflows.

When Obsidian is running, the plugin can expose native CLI handlers through Obsidian's own CLI.

## Commands

GUI commands:

- `PARA-ZK: Initialize PARA-ZK vault`
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

`PARA-ZK: Initialize PARA-ZK vault` opens an options modal in the Obsidian GUI.
When invoked through Obsidian's command passthrough, it also accepts command
arguments. Use `force=true` to regenerate managed files instead of exposing a
separate sync command.

Native CLI handlers, when supported by the running Obsidian app:

```bash
obsidian para-zk:ping format=json
obsidian para-zk:init format=json
obsidian para-zk:init dryRun=true force=true locale=en format=json
obsidian para-zk:init locale=ko format=json
obsidian para-zk:init installDeps=true format=json
obsidian para-zk:create-project title="Project name" area_titles='["AI","Software"]' status=in_progress priority=high format=json
obsidian para-zk:read-project title="Project name" key=frontmatter/status format=json
obsidian para-zk:read-project title="Finished project" archived=true key=summary format=json
obsidian para-zk:read-project title="Project name" key="children/Meeting notes/body" format=json
obsidian para-zk:read-area title="AI" key=children format=json
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
obsidian para-zk:create-subnote path="PARA/Projects/Project name/Project name.md" title="Meeting notes" subnote_type=meeting format=json
obsidian para-zk:create-zk title="Idea" kind=fleeting format=json
obsidian para-zk:promote-fleeting path="ZK/Fleeting/Idea.md" kind=permanent maturity=evergreen title="Evergreen idea" format=json
obsidian para-zk:capture-journal content="Quick memo" energy=normal format=json
```

CLI option values use locale-neutral codes only. For example, pass
`status=in_progress` instead of `status="1. 진행중"`; the plugin renders the
localized label inside the generated note.
Read commands use the same rule: `key=frontmatter/status`, `key=summary`, and
`key="children/Meeting notes/body"` are stable CLI map paths and do not depend
on the generated Markdown locale.
Update commands use the same stable keys, but only for writable leaves:
frontmatter keys use `op=set`, while section/body keys support `set`, `append`,
`prepend`, and exact literal `replace`.
Changing a project with `key=frontmatter/status op=set value=archived` moves the
project into `PARA/Archives/Projects`; setting a non-archived status on the
archived copy restores it to the active Projects folder.

When `locale` is omitted, PARA-ZK defaults to English. Pass `locale=ko` when a
Korean vault UI and generated Markdown are desired.
Changing the locale from the GUI settings or init command refreshes command
palette and ribbon labels in place, without moving existing ribbon icons.

`para-zk:init` creates the PARA/ZK vault layout, managed template reference files under
`Templates/para-zk`, Dataview/Tasks dashboard files under `Dashboard`, and a root vault guide.
It also merges required Obsidian core settings such as automatic link updates, the
`assets` attachment folder, local Obsidian trash, excluded generated/reference folders,
hidden document properties, and the core Templates folder. It is idempotent.
Existing non-managed files are skipped, and changed managed files are only overwritten
with `force=true`.

`para-zk:init` also checks required community plugin dependencies. It warns when
Dataview, Tasks, Tabs, Folder notes, Update time on edit, Trash Explorer, Custom
File Explorer sorting, or Homepage is missing or disabled. Pass `installDeps=true`
to install and enable those dependencies. When Dataview is installed, PARA-ZK also
enables Dataview JavaScript queries because the generated dashboards use `dataviewjs`
blocks. When Update time on edit is installed, PARA-ZK configures `created` and
`updated` frontmatter maintenance for editable notes while excluding generated
templates, dashboards, assets, and the managed root guide. When Custom File Explorer
sorting is installed, PARA-ZK configures bookmark-based sorting with a baseline
`sortspec` group. When Homepage is installed, PARA-ZK opens `Dashboard/HomePage`
on startup and when the workspace is empty.

The generated templates use native inline action tokens such as
`` `PZK[create-subnote|Create subnote]` `` instead of Meta Bind buttons. The inline action
token is rendered as a compact button inside the Markdown heading and calls the same
workflow implementation as the matching CLI handler.

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

Query/dashboard sections are generated as Dataview and Tasks blocks. PARA-ZK does not try
to replace those plugins.

## Development

Start with [docs/FIRST_READ.md](docs/FIRST_READ.md) for the project intent,
test-vault rules, and the GUI/CLI contract.

See [docs/CLI.md](docs/CLI.md) for the LLM-facing native CLI contract.
See [docs/CHANGELOG.md](docs/CHANGELOG.md) for the current development changelog.

```bash
npm install
npm run lint
npm run build
```

The build treats the repository root as the Obsidian plugin deployment shape:
`manifest.json`, `main.js`, and `styles.css`. CSS source lives in
`assets/styles.css`; build copies it to root `styles.css`.

For local auto-sync, copy `.env.example` to `.env` and set `OBSIDIAN_PLUGIN_DIR`.

```bash
npm run watch
npm run sync
```

For disposable-vault smoke testing:

```bash
npm run smoke:vault -- --vault /path/to/test-vault
npm run smoke:vault -- --vault /path/to/test-vault --clean
```

`npm run lint` runs the structural architecture guard and TypeScript check. The
architecture guard rejects content-blank modules such as `utils.ts`, `shared/`
catch-all folders, and non-`index.ts` convenience re-exports.
