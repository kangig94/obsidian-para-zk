# PARA-ZK

Native Obsidian plugin for PARA and Zettelkasten workflows.

When Obsidian is running, the plugin can expose native CLI handlers through Obsidian's own CLI.

## Commands

GUI commands:

- `PARA-ZK: Initialize PARA-ZK vault`
- `PARA-ZK: Sync PARA-ZK managed files`
- `PARA-ZK: Check plugin status`
- `PARA-ZK: Create project`
- `PARA-ZK: Create area`
- `PARA-ZK: Create resource`
- `PARA-ZK: Create subnote`
- `PARA-ZK: Create subarea`
- `PARA-ZK: Create retro`
- `PARA-ZK: Create ZK note`
- `PARA-ZK: Quick memo`
- `PARA-ZK: Promote resource to ZK`
- `PARA-ZK: Promote fleeting note`

Native CLI handlers, when supported by the running Obsidian app:

```bash
obsidian para-zk:ping format=json
obsidian para-zk:init locale=ko format=json
obsidian para-zk:init dryRun=true force=true locale=en format=json
obsidian para-zk:init installDeps=true format=json
obsidian para-zk:create-project title="Project name" status=in_progress priority=high format=json
obsidian para-zk:create-resource file_path="PARA/Projects/Project name/Project name.md" title="Source" format=json
obsidian para-zk:create-subnote file_path="PARA/Projects/Project name/Project name.md" title="Meeting notes" subnote_type=meeting format=json
obsidian para-zk:create-zk title="Idea" kind=fleeting format=json
obsidian para-zk:promote-fleeting file_path="ZK/Fleeting/Idea.md" kind=permanent maturity=evergreen title="Evergreen idea" format=json
obsidian para-zk:capture-journal content="Quick memo" energy=normal format=json
```

CLI option values use locale-neutral codes only. For example, pass
`status=in_progress` instead of `status="1. 진행중"`; the plugin renders the
localized label inside the generated note.

`para-zk:init` creates the PARA/ZK vault layout, managed template reference files under
`Templates/para-zk`, Dataview/Tasks dashboard files under `Dashboard`, and a root vault guide. It
is idempotent. Existing non-managed files are skipped, and changed managed files are only
overwritten with `force=true`.

`para-zk:init` also checks required community plugin dependencies. It warns when
Dataview, Tasks, or Tabs is missing or disabled. Pass `installDeps=true` to
install and enable those dependencies. When Dataview is installed, PARA-ZK also
enables Dataview JavaScript queries because the generated dashboards use
`dataviewjs` blocks.

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

`npm run lint` runs the structural architecture guard and TypeScript check. The
architecture guard rejects content-blank modules such as `utils.ts`, `shared/`
catch-all folders, and non-`index.ts` convenience re-exports.
