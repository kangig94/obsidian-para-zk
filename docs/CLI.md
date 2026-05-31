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
Other concepts also use exactly one option name: for example `title`, `kind`,
`area_titles`, `subnote_type`, and `content`.

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
| `title` | string | Required. |
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
| `offset` | number | Collection key reads only. Zero-based offset, default `0`. |
| `limit` | number or `all` | Collection key reads only. Maximum items to return, default `50`. |
| `query` | string | Collection key reads only. Case-insensitive item text filter. |
| `checkbox` | string | Task collection reads only. Literal checkbox status; `space`, `blank`, `todo`, and `open` match `[ ]`. |
| `priority` | string | Task collection reads only. Parsed Tasks priority such as `high` or `medium`. |
| `due_before` | `YYYY-MM-DD` | Task collection reads only. Includes tasks due on or before this date. |
| `due_after` | `YYYY-MM-DD` | Task collection reads only. Includes tasks due on or after this date. |
| `ref_kind` | `url`, `note`, `file`, `wiki`, `markdown`, `text` | Reference collection reads only. |

Top-level keys:

```text
frontmatter | summary | goals | tasks | references | children
```

Examples:

```bash
optsidian raw para-zk:read-project title="Model Evaluation" format=json
optsidian raw para-zk:read-project title="Model Evaluation" key=frontmatter/status format=json
optsidian raw para-zk:read-project title="Model Evaluation" key=tasks limit=20 format=json
optsidian raw para-zk:read-project title="Model Evaluation" key=tasks checkbox=/ query="blocked" format=json
optsidian raw para-zk:read-project title="Model Evaluation" key=references ref_kind=url format=json
optsidian raw para-zk:read-project title="Model Evaluation" key=children format=json
optsidian raw para-zk:read-project title="Model Evaluation" key="children/Planning Meeting/body" format=json
```

Full read responses include `mode: "compact"` and `omits_empty: true`. Static
schema keys, `archived: false`, null frontmatter values, empty sections, and
template-only placeholders are omitted.
Frontmatter wikilinks are shown by display title in full reads; read the exact
`frontmatter/<key>` when the stored wikilink path is needed.
Use a `key` read when you need to distinguish an explicitly empty section from
an omitted one. Key reads include `mode: "exact"`.

`children` is a map keyed by child note title. Child entries include only the
selector and type information needed for follow-up reads:

```json
{
  "children": {
    "Planning Meeting": {
      "path": "PARA/Projects/Model Evaluation/Planning Meeting.md",
      "type": "doc",
      "subnote_type": "meeting"
    }
  }
}
```

Task and reference surfaces are structured collections rather than raw Markdown.
Full compact reads return only `count`; collection items are omitted by design.
Blank template checkboxes are ignored. Exact collection root reads such as
`key=tasks` and `key=references` return a paged collection object:

```json
{
  "value": {
    "count": 42,
    "offset": 0,
    "limit": 20,
    "returned": 20,
    "has_more": true,
    "items": {
      "task-abc123": {
        "checkbox": "/",
        "name": "Review evaluation set",
        "priority": "high"
      }
    }
  }
}
```

Use `key=<collection>/<id>` or `key=<collection>/<id>/<field>` to read one
item or one item field without the page wrapper. When filters are provided,
`count` is the number of matching items before pagination.

```json
{
  "mode": "compact",
  "tasks": {
    "count": 42
  },
  "references": {
    "count": 12
  }
}
```

Important fields:

- `archived`: true when the selected note is under `PARA/Archives`.
- `frontmatter`: editable project fields only, such as `status`, `priority`,
  `areas`, `start_date`, `due_date`, and `done_date`.
- `tasks`: structured project task collection. Item keys are task ids.
  `checkbox` is the literal status character from `[ ]`, `[x]`, `[-]`, `[/]`,
  and other Tasks-compatible statuses.
- `references`: structured reference collection. Items expose `kind`, `label`,
  `target`, `path`, or `text` depending on the source line.
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
| `para-zk:read-area` | `title` or `path` | `frontmatter`, `overview`, `tasks`, `references`, `children` |
| `para-zk:read-resource` | `title` or `path` | `frontmatter`, `overview`, `body`, `references` |
| `para-zk:read-zk` | `title` plus optional `kind`, or `path` | depends on ZK type |
| `para-zk:read-journal` | `date` or `path` | `frontmatter`, `focus`, `quick_memo`, `timeline`, `tasks`, `short_review`, `references` |
| `para-zk:read-retro` | `title` plus optional `date`, or `path` | `frontmatter`, `week_progress`, `good`, `improve`, `risks`, `tasks`, `retro_summary`, `references` |

ZK top-level keys:

```text
zk_fleeting: frontmatter | thought_summary | memo | tasks | references
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

### `para-zk:update-project`

Updates a writable PARA-ZK surface by the same stable map keys used for reads.
The command is scoped to a domain note first, then applies the edit only inside
the selected key. It is not a raw file edit.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `title` | string | Project title. Used when `path` is omitted. |
| `path` | path | Optional exact project note path. |
| `archived` | boolean | Same title lookup behavior as `read-project`. |
| `key` | writable map path | Required. Examples: `frontmatter/status`, `summary`, `children/Planning Meeting/body`. |
| `op` | `set`, `append`, `prepend`, `replace` | Required update operation. |
| `value` | text | Required for `set`, `append`, and `prepend`. |
| `value_json` | JSON | Structured value for frontmatter updates. |
| `match` | text | Required for `replace`. Exact literal text inside the selected key. |
| `with` | text | Replacement text for `replace`. Empty is allowed. |
| `all` | boolean | For `replace`, replace all matches. Without it, multiple matches fail. |

Writable keys are a subset of read keys. `frontmatter/<key>` supports `op=set`
only and uses Obsidian frontmatter mutation. Section/body keys support
`set`, `append`, `prepend`, and exact literal `replace`.
`update-project key=tasks` still edits the underlying Tasks section text. Use
the structured `read-project key=tasks` collection page for inspection until
dedicated task lifecycle commands exist.

Read-only keys include `children`, `path`, `title`, `type`, and `archived`.

Examples:

```bash
optsidian raw para-zk:update-project title="Model Evaluation" key=frontmatter/status op=set value=done format=json
optsidian raw para-zk:update-project title="Model Evaluation" key=summary op=replace match="old claim" with="new claim" format=json
optsidian raw para-zk:update-project title="Model Evaluation" key=tasks op=append value="- [ ] Review evaluation set" format=json
optsidian raw para-zk:update-project title="Model Evaluation" key="children/Planning Meeting/body" op=append value="Decision: ship the baseline." format=json
optsidian raw para-zk:update-project title="Model Evaluation" key=frontmatter/status op=set value=archived format=json
```

For projects, `key=frontmatter/status op=set value=archived` is a structural
archive operation: it moves the folder-style project from `PARA/Projects` to
`PARA/Archives/Projects`. Updating the archived copy with `archived=true` and a
non-archived status restores it to `PARA/Projects`.

Result fields:

- `path`: the actual file that was updated. For `children/<title>/...`, this is
  the child note path.
- `key`: the original requested key.
- `operation`: the applied operation.
- `changed`: false when the requested `set` value already matched.
- `matches`: present for `replace`.
- `moved`, `fromPath`, and `toPath`: present when a project status update moved
  the project between active and archived folders.

The same update algorithm is used by the other domain update commands:

| Command | Selector | Notes |
| --- | --- | --- |
| `para-zk:update-area` | `title` or `path` | Supports area surface keys and `children/<title>/...`. |
| `para-zk:update-resource` | `title` or `path` | Supports resource surface keys such as `overview`, `body`, and `references`. |
| `para-zk:update-zk` | `title` plus optional `kind`, or `path` | Supports the selected ZK type's surface keys. |
| `para-zk:update-journal` | `date` or `path` | Supports journal surface keys such as `quick_memo` and `tasks`. |
| `para-zk:update-retro` | `title` plus optional `date`, or `path` | Supports retro surface keys such as `tasks`. |

### Rename Commands

Renames are explicit structural commands rather than raw path edits. They update
the note path and title-derived tag while preserving the note's other metadata.

| Command | Selector | Notes |
| --- | --- | --- |
| `para-zk:rename-project` | `title` or `path`; optional `archived` | Renames the folder-style project folder and main note. Child notes move with the folder. |
| `para-zk:rename-area` | `title` or `path`; optional `archived` | Renames the folder-style area folder and main note. Child areas move with the folder; area tag namespaces are updated without dropping inherited parent tags. |
| `para-zk:rename-resource` | `title` or `path`; optional `archived` | Renames the resource note file in place. |
| `para-zk:rename-zk` | `title` plus optional `kind`, or `path` | Renames the selected ZK note file in place. |

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `title` | string | Current note title. Used when `path` is omitted. |
| `path` | path | Optional exact note path. |
| `new_title` | string | Required new note title. Aliases such as `newTitle` are rejected. |
| `archived` | boolean | PARA rename commands only; same title lookup behavior as reads. |
| `kind` | ZK kind code | `rename-zk` only; narrows title lookup. |

Examples:

```bash
optsidian raw para-zk:rename-project title="Model Evaluation" new_title="Model Evaluation 2026" format=json
optsidian raw para-zk:rename-area title="AI" new_title="Applied AI" format=json
optsidian raw para-zk:rename-resource title="Source Paper" new_title="Source Paper Notes" format=json
optsidian raw para-zk:rename-zk title="Stable Interface Contracts" kind=permanent new_title="Stable CLI Contracts" format=json
```

Result fields:

- `path`: final note path.
- `changed`: false when the title was already equal after sanitization.
- `fromPath` and `toPath`: source and final note paths.
- `fromTitle` and `toTitle`: source and final titles.

### Delete Commands

Delete commands move notes to Obsidian trash with core Obsidian APIs. They do
not require Trash Explorer to be installed or enabled. Trash Explorer is still a
useful GUI dependency for reviewing and emptying `.trash`, but PARA-ZK delete
workflows do not call it.

Body backlinks are intentionally preserved. The JSON result reports incoming
links observed before deletion so an LLM can decide whether follow-up edits are
needed. PARA-ZK only cleans relationships it owns directly:

- frontmatter links in keys such as `areas`, `project`, `parent`, and
  `promoted_to`
- standalone wikilink lines inside generated References sections

| Command | Selector | Notes |
| --- | --- | --- |
| `para-zk:delete-project` | `title` or `path`; optional `archived` | Deletes the folder-style project container. Requires `force=true` if child files are inside. |
| `para-zk:delete-area` | `title` or `path`; optional `archived` | Deletes the folder-style area container. Requires `force=true` if child files are inside. |
| `para-zk:delete-resource` | `title` or `path`; optional `archived` | Deletes the resource note and removes safe References-section links to it. |
| `para-zk:delete-zk` | `title` plus optional `kind`, or `path` | Deletes the selected ZK note and removes safe References-section links to it. |
| `para-zk:delete-journal` | `date` or `path` | Deletes a daily journal note. |
| `para-zk:delete-retro` | `title` plus optional `date`, or `path` | Deletes a retro note. |

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `title` | string | Current note title. Used when `path` is omitted. |
| `path` | path | Optional exact note path. |
| `archived` | boolean | PARA delete commands only; same title lookup behavior as reads. |
| `kind` | ZK kind code | `delete-zk` only; narrows title lookup. |
| `date` | `YYYY-MM-DD` | `delete-journal` and `delete-retro` only. |
| `force` | boolean | Required when a folder-style project or area contains child files. |

Examples:

```bash
optsidian raw para-zk:delete-resource title="Source Paper" format=json
optsidian raw para-zk:delete-area title="Unused Area" format=json
optsidian raw para-zk:delete-project title="Prototype" force=true format=json
optsidian raw para-zk:delete-zk title="Draft idea" kind=fleeting format=json
optsidian raw para-zk:delete-journal date=2026-05-30 format=json
```

Important result fields:

- `containerPath`: file or folder path moved to trash.
- `deletedPaths`: paths that were inside the deleted container before trashing.
- `incomingLinks`: backlink counts observed before deletion; body links are not
  modified.
- `cleaned.frontmatter`: count of PARA-ZK frontmatter keys cleaned.
- `cleaned.references`: count of standalone References-section lines removed.
- `trashMethod`: core Obsidian method used, normally `fileManager.trashFile`.

### `para-zk:create-project`

Creates a folder-style project note.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `title` | string | Required. |
| `areas` | JSON array or comma list | Store area links in frontmatter. |
| `area_titles` | JSON array or comma list | Reuse or create areas by title, then store links in frontmatter. |
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
| `title` | string | Required. |
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
| `title` | string | Required. |
| `path` | path | Required for deterministic CLI use. Parent project or area note. |
| `subnote_type` | subnote type code | Defaults to `free`. |
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
| `title` | string | Required. |
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
| `title` | string | Optional retro title segment. |
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
| `title` | string | Required. |
| `kind` | ZK kind code | Defaults to `fleeting`. |
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
| `content` | string | Required. |
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
| `title` | string | Optional. Defaults to source basename. |
| `kind` | ZK kind code | Defaults to `permanent`. |
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
| `title` | string | Optional. Defaults to source basename. |
| `kind` | promotion target kind code | Defaults to `permanent`. |
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
