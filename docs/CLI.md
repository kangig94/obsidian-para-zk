# PARA-ZK CLI Contract

This document describes the native CLI surface that LLMs and automation should
use when controlling PARA-ZK through a running Obsidian app.

The CLI is intentionally richer than the GUI. GUI commands are optimized for a
person in Obsidian; CLI handlers are optimized for an LLM that can provide
structured options and needs token-efficient JSON results.

## Invocation

Use Obsidian's native CLI directly or through Optsidian passthrough:

```bash
obsidian para-zk:ping format=json
optsidian raw para-zk:ping format=json
```

Use `format=json` for automation. Text output is for humans and may omit fields
that JSON includes.

All paths are vault-relative. Use the canonical `path` option when a command
needs an existing note. Legacy aliases such as `file_path`, `filePath`,
`source`, `sourcePath`, and `file` are rejected.

## Stable Codes

CLI options store locale-neutral codes in frontmatter. The GUI and generated
Markdown render localized labels from those codes.

Project status:

```text
idea | in_progress | paused | done | archived
```

Priority:

```text
low | medium | high
```

ZK kind:

```text
fleeting | literature | permanent
```

Promotion target kind:

```text
literature | permanent
```

Maturity:

```text
draft | refined | evergreen
```

Journal energy:

```text
high | normal | low
```

Subnote type:

```text
free | checklist | todo | plan | research | meeting | decision | guide | risk | idea | settlement
```

Boolean options accept `true`, `false`, `1`, `0`, `yes`, `no`, `on`, and `off`.

## Output Shape

Successful workflow commands return JSON like:

```json
{
  "ok": true,
  "command": "para-zk:create-project",
  "path": "PARA/Projects/Example/Example.md",
  "title": "Example",
  "created": true,
  "areas": [
    {
      "title": "AI",
      "path": "PARA/Areas/AI/AI.md",
      "link": "[[PARA/Areas/AI/AI.md|AI]]",
      "created": false
    }
  ]
}
```

Errors return JSON like:

```json
{
  "ok": false,
  "command": "para-zk:create-project",
  "error": "status must be one of: idea|in_progress|paused|done|archived (received: active)"
}
```

LLMs should read `ok` first. If `ok` is false, correct the invalid option or
missing file and retry.

## Commands

### `para-zk:ping`

Checks that the plugin and native CLI handler are loaded.

```bash
optsidian raw para-zk:ping format=json
```

Important fields:

- `pluginId`
- `settings`

### `para-zk:init`

Initializes or syncs the PARA-ZK vault layout, managed templates, dashboards,
guide file, required Obsidian core settings, and required community plugins.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `locale` | `ko`, `en` | Locale for generated labels and tags. |
| `dryRun` | boolean | Plan without writing. |
| `force` | boolean | Overwrite changed managed files when allowed. |
| `installDeps` | boolean | Install and enable required plugins. |
| `format` | `json`, `text` | Use `json` for automation. |

Required dependencies:

- Dataview
- Tasks
- Tabs
- Folder Notes
- Update time on edit
- Trash Explorer
- Custom File Explorer sorting
- Homepage

Dataview JavaScript queries are enabled when Dataview is installed.
Update time on edit is configured to maintain `created` and `updated`
frontmatter fields while ignoring generated templates, dashboards, assets, and
the managed root guide.
Trash Explorer is installed and enabled so local `.trash` contents can be
reviewed or emptied through the Obsidian GUI.
Custom File Explorer sorting is configured for bookmark-based ordering with a
baseline `sortspec` bookmarks group. Existing `sortspec` groups are preserved.
Homepage is configured to open `Dashboard/HomePage` on startup and when the
workspace is empty.

Obsidian core settings are merged into existing config files without deleting
unrelated user settings:

- `.obsidian/app.json`: enables automatic link updates, uses `assets` for
  attachments, moves deleted files to local Obsidian trash, hides document
  properties, and excludes generated/reference folders from Obsidian's
  ignored-file filters.
- `.obsidian/templates.json`: sets the core Templates plugin folder to
  `Templates`.

Example:

```bash
optsidian raw para-zk:init installDeps=true locale=ko format=json
```

When `locale` is omitted, PARA-ZK defaults to English. Pass `locale=ko` for
Korean generated labels, headings, and tags.

Important fields:

- `created`
- `updated`
- `existing`
- `skipped`
- `warnings`
- `dependencies`

### `para-zk:create-area`

Creates a folder-style area note.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `title` | string | Required. Also accepted as `name`. |
| `parent` | path | Optional parent area path. |
| `open` | boolean | Default `false`. |

Example:

```bash
optsidian raw para-zk:create-area title="Software" open=false format=json
```

Side effects:

- Creates `PARA/Areas/<title>/<title>.md`.
- Sets `type: area`.
- Sets a localized area tag.
- Sets `parent` if `parent` was provided.

### `para-zk:read-project`

Reads a project note through PARA-ZK's stable editable-surface map. This is not
a raw file read. It returns the parts that LLMs should reason about without
requiring locale-specific headings or template internals.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `title` | string | Project title. Used when `path` is omitted. |
| `path` | path | Optional exact project note path. |
| `archived` | boolean | When selecting by title, `true` restricts lookup to `PARA/Archives`; `false` restricts lookup to the active PARA folder. |
| `key` | map path | Optional stable key path. |

Top-level keys:

```text
frontmatter | summary | goals | tasks | references | children
```

Examples:

```bash
optsidian raw para-zk:read-project title="Model Evaluation" format=json
optsidian raw para-zk:read-project title="Model Evaluation" key=frontmatter/status format=json
optsidian raw para-zk:read-project title="Model Evaluation" key=children format=json
optsidian raw para-zk:read-project title="Model Evaluation" key="children/Planning Meeting/body" format=json
```

`children` is a map keyed by child note title. Child entries expose their own
stable keys, so automation can read a returned path without guessing:

```json
{
  "children": {
    "Planning Meeting": {
      "path": "PARA/Projects/Model Evaluation/Planning Meeting.md",
      "type": "doc",
      "archived": false,
      "key": "children/Planning Meeting",
      "subnote_type": "meeting",
      "keys": ["frontmatter", "body"]
    }
  }
}
```

Important fields:

- `archived`: true when the selected note is under `PARA/Archives`.
- `frontmatter`: editable project fields only, such as `status`, `priority`,
  `areas`, `start_date`, `due_date`, and `done_date`.
- `children`: child-note index; child bodies are read only when requested with
  a `children/<title>/...` key.
- `value`: present when `key` is provided.

The same map-path read algorithm is used by the other domain read commands. The
command selects the target note, builds that note type's stable surface map, and
then resolves `key` as a `/`-separated map path.
When selecting by `title`, `read-project`, `read-area`, `read-resource`, and
`read-retro` accept `archived=true` to select the matching note under
`PARA/Archives`.

| Command | Selector | Top-level keys |
| --- | --- | --- |
| `para-zk:read-area` | `title` or `path` | `frontmatter`, `overview`, `references`, `children` |
| `para-zk:read-resource` | `title` or `path` | `frontmatter`, `overview`, `body`, `references` |
| `para-zk:read-zk` | `title` plus optional `kind`, or `path` | depends on ZK type |
| `para-zk:read-journal` | `date` or `path` | `frontmatter`, `focus`, `quick_memo`, `timeline`, `today_tasks`, `short_review`, `links` |
| `para-zk:read-retro` | `title` plus optional `date`, or `path` | `frontmatter`, `week_progress`, `good`, `improve`, `risks`, `next_actions`, `retro_summary`, `links` |

ZK top-level keys:

```text
zk_fleeting: frontmatter | thought_summary | memo | references
zk_literature: frontmatter | highlight_block | summary | insight | evidence | references
zk_permanent: frontmatter | one_sentence_summary | body | limitations | related_questions | references
```

Examples:

```bash
optsidian raw para-zk:read-area title="AI" key=children format=json
optsidian raw para-zk:read-project title="Finished Project" archived=true key=summary format=json
optsidian raw para-zk:read-resource title="Source Paper" key=body format=json
optsidian raw para-zk:read-zk title="Stable Interface Contracts" kind=permanent key=frontmatter/maturity format=json
optsidian raw para-zk:read-journal date=2026-05-30 key=quick_memo format=json
optsidian raw para-zk:read-retro path="PARA/Retros/2026_W22/Retro-General-2026_W22.md" key=retro_summary format=json
```

### `para-zk:create-project`

Creates a folder-style project note.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `title` | string | Required. Also accepted as `name`. |
| `areas` | JSON array or comma list | Store area links in frontmatter. |
| `area_titles` | JSON array or comma list | Reuse or create areas by title, then store links in frontmatter. `areaTitles` is also accepted. |
| `status` | project status code | Defaults to `idea`. |
| `priority` | priority code | Defaults to `low`. |
| `open` | boolean | Default `false`. |

Example:

```bash
optsidian raw para-zk:create-project \
  title="Model Evaluation" \
  area_titles='["AI","Software"]' \
  status=in_progress \
  priority=high \
  open=false \
  format=json
```

Side effects:

- Creates `PARA/Projects/<title>/<title>.md`.
- Stores `status`, `priority`, `areas`, `type: project`, and a localized project tag.
- For each `area_titles` item, reuses an existing area when possible or creates
  `PARA/Areas/<area>/<area>.md` when missing.

### `para-zk:create-resource`

Creates a resource note and optionally links it from a source note's References
section. Use this when the reference needs its own note, summary, metadata, or
future reuse. For an existing file, note, or URL, use `para-zk:add-reference`.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `title` | string | Required. Also accepted as `name`. |
| `path` | path | Optional source note receiving the resource link. |
| `link` | boolean | Defaults to `true` when `path` is present. |
| `open` | boolean | Default `false`. |

Example:

```bash
optsidian raw para-zk:create-resource \
  title="Source Paper" \
  path="PARA/Projects/Model Evaluation/Model Evaluation.md" \
  link=true \
  format=json
```

Important fields:

- `sourcePath`
- `linkedFromSource`

### `para-zk:add-reference`

Adds an existing vault file, wikilink, markdown link, or URL to a note's
References section.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `path` | path | Required for deterministic CLI use. Source note receiving the reference. |
| `target` | path, URL, wikilink, or markdown link | Required. Existing vault files are written as wikilinks. URLs are written directly or as markdown links when `label` is present. |
| `label` | string | Optional display label for file paths and URLs. |
| `open` | boolean | Default `false`. |

Examples:

```bash
optsidian raw para-zk:add-reference \
  path="PARA/Projects/Model Evaluation/Model Evaluation.md" \
  target="assets/model-eval.pdf" \
  format=json

optsidian raw para-zk:add-reference \
  path="PARA/Projects/Model Evaluation/Model Evaluation.md" \
  target="https://example.com/paper" \
  label="Source paper" \
  format=json
```

Important fields:

- `path`
- `reference`
- `target`
- `added`

### `para-zk:create-subnote`

Creates a child document under a project or area note.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `title` | string | Required. Also accepted as `name`. |
| `path` | path | Required for deterministic CLI use. Parent project or area note. |
| `subnote_type` | subnote type code | Defaults to `free`. Also accepted as `subnoteType` or `type`. |
| `open` | boolean | Default `false`. |

Example:

```bash
optsidian raw para-zk:create-subnote \
  title="Planning Meeting" \
  path="PARA/Projects/Model Evaluation/Model Evaluation.md" \
  subnote_type=meeting \
  format=json
```

Side effects:

- Creates the note in the parent folder.
- Converts a single-note parent into folder-style layout if needed.
- Sets `parent` to the parent note link.

### `para-zk:create-subarea`

Creates a child area under an area note.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `title` | string | Required. Also accepted as `name`. |
| `path` | path | Required for deterministic CLI use. Parent area note. |
| `inheritParentTag` | boolean | Defaults to `true`. |
| `open` | boolean | Default `false`. |

Example:

```bash
optsidian raw para-zk:create-subarea \
  title="LLM Tooling" \
  path="PARA/Areas/AI/AI.md" \
  inheritParentTag=true \
  format=json
```

### `para-zk:create-retro`

Creates a weekly retro note, optionally scoped to a project or area.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `path` | path | Optional project or area source note. |
| `name` | string | Optional retro name segment. `title` is also accepted. |
| `date` | `YYYY-MM-DD` | Date used for ISO week calculation. Defaults to today. |
| `open` | boolean | Default `false`. |

Example:

```bash
optsidian raw para-zk:create-retro \
  path="PARA/Projects/Model Evaluation/Model Evaluation.md" \
  date=2026-05-29 \
  format=json
```

Important fields:

- `sourcePath`
- `weekIso`

### `para-zk:create-zk`

Creates a ZK note.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `title` | string | Required. Also accepted as `name`. |
| `kind` | ZK kind code | Defaults to `fleeting`. `type` is also accepted. |
| `maturity` | maturity code | Used for permanent notes. Defaults to `draft`. |
| `open` | boolean | Default `false`. |

Example:

```bash
optsidian raw para-zk:create-zk \
  title="Stable Interface Contracts" \
  kind=permanent \
  maturity=refined \
  format=json
```

Important fields:

- `kind`

### `para-zk:capture-journal`

Appends a quick memo to the daily journal.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `content` | string | Required. `text` and `memo` are also accepted. |
| `date` | `YYYY-MM-DD` | Defaults to today. |
| `time` | `HH:mm` | Defaults to current local time. |
| `energy` | energy code | Defaults to `normal` when creating a journal note. |
| `open` | boolean | Default `false`. |

Example:

```bash
optsidian raw para-zk:capture-journal \
  content="Reviewed PARA-ZK CLI contract" \
  date=2026-05-29 \
  time=09:30 \
  energy=normal \
  format=json
```

Important fields:

- `path`
- `content`
- `date`
- `created`

### `para-zk:promote-resource`

Promotes a resource note into a ZK note and links the new ZK note back to the
resource.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `path` | path | Required for deterministic CLI use. Source resource note. |
| `title` | string | Optional. Defaults to source basename. `name` is also accepted. |
| `kind` | ZK kind code | Defaults to `permanent`. `type` is also accepted. |
| `maturity` | maturity code | Used for permanent notes. |
| `open` | boolean | Default `false`. |

Example:

```bash
optsidian raw para-zk:promote-resource \
  path="PARA/Resources/Source Paper.md" \
  title="Paper Insight" \
  kind=literature \
  format=json
```

Important fields:

- `sourcePath`
- `kind`

### `para-zk:promote-fleeting`

Promotes a fleeting note into Literature or Permanent and marks the source as
processed in place.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `path` | path | Required for deterministic CLI use. Source fleeting note. |
| `title` | string | Optional. Defaults to source basename. `name` is also accepted. |
| `kind` | promotion target kind code | Defaults to `permanent`. `type` is also accepted. |
| `maturity` | maturity code | Used for permanent notes. |
| `open` | boolean | Default `false`. |

Example:

```bash
optsidian raw para-zk:promote-fleeting \
  path="ZK/Fleeting/Raw Thought.md" \
  title="Durable Thought" \
  kind=permanent \
  maturity=evergreen \
  format=json
```

Important fields:

- `sourcePath`
- `kind`

Side effects:

- Creates a target ZK note.
- Links the target note back to the source fleeting note.
- Sets `processed: true` and `promoted_to` on the source fleeting note.

## Smoke Test

Use the automated smoke test against a disposable test vault:

```bash
npm run smoke:vault -- --vault /path/to/test-vault
```

Use `--clean` only for a disposable vault. It deletes all top-level vault
contents except `.obsidian` and removes the PARA-ZK plugin data file before
running the smoke test.

```bash
npm run smoke:vault -- --vault /path/to/test-vault --clean
```

On Linux, the smoke test opens the target vault with `open-gui no-wait` and
uses `xdotool` when available to focus the matching Obsidian vault window before
running native CLI commands. This keeps the test pointed at the disposable vault
even when multiple Obsidian vault windows are open.
