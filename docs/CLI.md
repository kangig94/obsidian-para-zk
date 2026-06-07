# PARA-ZK CLI Contract

This document describes the native CLI surface that LLMs and automation should
use when controlling PARA-ZK through a running Obsidian app.

The CLI is intentionally richer than the GUI. GUI commands are optimized for a
person in Obsidian; CLI handlers are optimized for an LLM that can provide
structured options and needs token-efficient JSON results.

## Invocation

Use Obsidian's native CLI directly or through Optsidian passthrough:

```bash
obsidian para-zk:describe format=json
optsidian para-zk:describe format=json
```

Use `format=json` for automation. Text output is for humans and may omit fields
that JSON includes.

Notes are addressed **by name, never by file path** — the CLI never exposes a
`path` option. Address a note by its `title` (project/area/resource), `date`
(journal/retro), or `title`+`kind` (zk). An existing child note (subnote/subarea)
is reached through its container plus a `child=["<title>", ...]` drill (left to
right). New children name their parent with `parent_type`+`parent_title`; ZK
notes derived from an origin name it with `source_title` (and `source_type` where
the origin type is ambiguous, e.g. scoped retro / resource link). Each concept
uses exactly one option name: `title`, `kind`, `area_titles`, `subnote_type`,
`content`, `child`, `parent_type`, `parent_title`, `source_type`, `source_title`.

### Discovering a command's arguments

Any command answers `help=true` by returning its own option schema instead of
running — so you can inspect arguments without first hitting a "required" error:

```bash
optsidian para-zk:create-area help=true format=json
# → {"ok":true,"command":"para-zk:create-area","description":"...",
#    "options":[{"name":"title","value":"<title>","description":"Area title."}, ...]}
```

`help=true` works identically through every surface (optsidian, native obsidian,
MCP) because it rides the same `key=value` parsing. A bare `--help`/`-h` flag is
honored too when the host forwards it. For the full machine-readable surface
(types, stable keys, create inputs), `para-zk:describe` remains the index.

### Large body from a file

The `body` option on create commands accepts an `@<absolute-path>` value, read from
disk by the plugin instead of taken inline:

```bash
optsidian para-zk:create-resource title="Attention Is All You Need" body=@/tmp/note.md
obsidian      para-zk:create-resource title="Attention Is All You Need" body=@/tmp/note.md
```

This is the shell-safe way to pass long or multiline markdown (newlines, quotes,
`$`, backticks survive untouched). The plugin performs the read, so `@file` works
on the native `obsidian` CLI and through optsidian alike. Use an **absolute path**:
the read resolves against the Obsidian process working directory, not your shell's.
Because a leading `@` always means "read this file", a body whose literal text begins
with `@` must be supplied through a file. Only `body` is file-backed — short fields
like a journal `content` memo are always literal, so `@mentions` are kept verbatim.

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
spark | digest | permanent
```

Resource-create target kind:

```text
digest | permanent
```

Resource kind (source type):

```text
paper | article | book | video | web | code | guide | other
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

### `para-zk:describe`

Describes the live PARA-ZK CLI surface. This is also the preferred readiness
check: if it returns JSON with `ok: true`, Obsidian is running, PARA-ZK is loaded,
and the native CLI handler is registered.

```bash
optsidian para-zk:describe format=json
optsidian para-zk:describe type=project format=json
```

Important fields:

- `vault` — orienting context for a cold caller: the store is one user's private,
  local, single-user Obsidian "second brain", never published or shared. Saving source
  material (notes, excerpts, full texts the user is studying) is personal-use storage,
  not redistribution — so a caller should not refuse it on public-distribution grounds.
- `scope` — what PARA-ZK owns (typed PARA/ZK create/read/update/rename/archive of the
  surface types, addressed by name) versus what to route to the host: raw file edits,
  free-form frontmatter, and full-text search go to optsidian (`edit`/`apply_patch`/`write`,
  `grep`/`search`), not PARA-ZK.
- `surfaceTypes` — addressable/createable note types.
- `workflows` — named (non-surface) commands with their inputs:
  `capture-journal`, `distill-spark`, `create-from-digest`, `create-from-resource`,
  `add-reference`, `attach-file`. This is how you discover those commands and args
  without a separate help lookup.
- `collectionFilters`
- `surfaces` when `type` is provided. Each surface carries an `addressing` facet:
  - `addressable` — whether the type is reached directly (`true`) or only through a
    container + `child=` (`false`, e.g. `subnote`/`subarea`).
  - `selectors` — how to address an existing note of this type.
  - `create` — the command that creates it, and `createInputs` — that command's
    arguments (so a caller learns the full create call from `describe` alone).
  - `addressVia` — for non-addressable types (`subnote`/`subarea`/`note`), how to reach
    existing ones: through the parent project/area with `child=["title"]`. There is no
    `update-subnote`; read/update/delete it via `read-`/`update-`/`delete-project|area`.

`describe type=<t>` is the self-contained contract for one type: address selectors,
create command + inputs, collections, and read/write keys. `readKeys` are the readable
keys; `writeKeys` carry each mutable key with its op(s) — e.g. `frontmatter/{…}=set`,
`tasks=insert`, `references/<i>/{link|description}=set`, `body=set|append|prepend|replace`.
Keys absent from `writeKeys` are not writable here: `created`/`updated` are vault-managed,
so set them (and run raw edits/search) through the host (optsidian).

### `para-zk:list`

Structured enumeration of PARA-ZK notes by type — use it to find a note (and its
title) before addressing it by name. `list` filters by type and frontmatter only.
**For content/full-text search, use `optsidian grep` or `optsidian search`** (these
are optsidian-implemented; the Obsidian native CLI does not provide them).

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `type` | `project`, `area`, `subarea`, `resource`, `zk`, `retro`, `journal`, `subnote` | Optional. Omit to list all PARA-ZK notes. `zk` spans all stored ZK kinds. |
| `archived` | boolean | `true` lists archived notes; default lists active notes. |
| `query` | string | Optional case-insensitive title substring filter. |
| `offset` | number | Zero-based item offset (default `0`). |
| `limit` | number or `all` | Maximum items to return (default `50`). |

```bash
optsidian para-zk:list type=project query=eval format=json
optsidian para-zk:list type=zk limit=all format=json
```

Returns `{ count, offset, limit, returned, has_more, items }`; each item is
`{ title, type, path }` (plus `archived: true` in archived listings). `type` is
the stored type (e.g. `zk_permanent` for a `type=zk` listing).

### `para-zk:setup`

Sets up or syncs the PARA-ZK vault layout, managed templates, dashboards,
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
- Folder Notes
- Update time on edit
- Trash Explorer
- Custom File Explorer sorting
- Homepage
- Open Tab Settings
- Remember cursor position

Dataview JavaScript queries are enabled when Dataview is installed.
Update time on edit is configured to maintain `created` and `updated`
frontmatter fields while ignoring generated templates, dashboards, the managed
task registry, assets, and the managed root guide.
Trash Explorer is installed and enabled so local `.trash` contents can be
reviewed or emptied through the Obsidian GUI.
Custom File Explorer sorting is configured for bookmark-based ordering with a
baseline `sortspec` bookmarks group. Existing `sortspec` groups are preserved.
Homepage is configured to open `Dashboard/HomePage` on startup and when the
workspace is empty.
Open Tab Settings is installed and enabled so PARA-ZK navigation (ribbon,
dashboard, and view toolbar actions) opens notes with consistent open-in-new-tab and
no-duplicate-tab behavior. PARA-ZK configures it to open in new tabs, prevent
duplicates, and focus explicitly-created new tabs.
Remember cursor position is installed and enabled so each note restores its last
cursor and scroll position after navigation. It is installed/enabled only; no
settings are forced.

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
optsidian para-zk:setup installDeps=true locale=ko format=json
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
| `open` | boolean | Default `false`. |

Example:

```bash
optsidian para-zk:create-area title="Software" open=false format=json
```

Side effects:

- Creates `PARA/Areas/<title>/<title>.md`.
- Sets `type: area`.
- Sets a localized area tag.

To nest an area under another area, use `para-zk:create-subarea` (it creates the
folder-style child). A root area has no parent.

### `para-zk:read-project`

Reads a project note through PARA-ZK's stable editable-surface map. This is not
a raw file read. It returns the parts that LLMs should reason about without
requiring locale-specific headings or template internals.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `title` | string | Project title. |
| `archived` | boolean | When selecting by title, `true` restricts lookup to `PARA/Archives`; `false` restricts lookup to the active PARA folder. |
| `key` | map path | Optional stable key path. |
| `offset` | number | Collection key reads only. Zero-based offset, default `0`. |
| `limit` | number or `all` | Collection key reads only. Maximum items to return, default `50`. |
| `query` | string | Collection key reads only. Case-insensitive item text filter. |
| `type` | note type | Backlink collection reads only. Filters source notes by frontmatter `type`. |
| `checkbox` | string | Task collection reads only. Literal checkbox status; `space`, `blank`, `todo`, and `open` match `[ ]`. |
| `priority` | string | Task collection reads only. Parsed Tasks priority such as `high` or `medium`. |
| `due_before` | `YYYY-MM-DD` | Task collection reads only. Includes tasks due on or before this date. |
| `due_after` | `YYYY-MM-DD` | Task collection reads only. Includes tasks due on or after this date. |
| `ref_kind` | `url`, `note`, `file`, `wiki`, `text` | Reference collection reads only. |

Top-level keys:

```text
frontmatter | summary | goals | tasks | references | backlinks | children
```

Examples:

```bash
optsidian para-zk:read-project title="Model Evaluation" format=json
optsidian para-zk:read-project title="Model Evaluation" key=frontmatter/status format=json
optsidian para-zk:read-project title="Model Evaluation" key=tasks limit=20 format=json
optsidian para-zk:read-project title="Model Evaluation" key=tasks checkbox=/ query="blocked" format=json
optsidian para-zk:read-project title="Model Evaluation" key=references ref_kind=url format=json
optsidian para-zk:read-project title="Model Evaluation" key=backlinks type=project limit=20 format=json
optsidian para-zk:read-project title="Model Evaluation" key=children format=json
optsidian para-zk:read-project title="Model Evaluation" child='["Planning Meeting"]' key=body format=json
```

Full read responses include `mode: "compact"`. Frontmatter values are inlined
(null values omitted), collections appear as `{ "count": N }`, and prose
sections appear as `{ "chars": N }`; full section text is read on demand with
`key=<section>`. The stable `key=` roots for each note type come from
`para-zk:describe`. Static schema keys, `archived: false`, empty sections, and
template-only placeholders are omitted.
Detailed nested key hints stay in CLI help and unknown-key errors.
Frontmatter wikilinks are shown by display title in full reads; read the exact
`frontmatter/<key>` when the stored wikilink path is needed.
Use a `key` read when you need to distinguish an explicitly empty section from
an omitted one. Key reads include `mode: "exact"`.

`children` is a **read-only index** keyed by child note title. To read or edit a
child, address the container and drill with `child=["<title>", ...]` (left to
right; the index basenames are exactly the `child=` values). Child entries
include only the selector and type information needed for that follow-up:

```json
{
  "children": {
    "Planning Meeting": {
      "path": "PARA/Projects/Model Evaluation/Planning Meeting.md",
      "type": "subnote",
      "subnote_type": "meeting"
    }
  }
}
```

Subnote and fallback NOTE children also expose read-only backlinks through
`child=["<title>"] key=backlinks` for paged collection reads and
`child=["<title>"] key=backlinks/<i>` for a single item.

Task, reference, and backlink surfaces are structured collections rather than raw Markdown.
Full compact reads return only `count`; collection items are omitted by design.
Tasks are stored in PARA-ZK's managed `Tasks/current` or `Tasks/archives`
registry and rendered back into root notes through `para-zk-tasks` blocks. Each
task shard is named after the root note's `id` and contains only a `# Tasks`
heading plus task lines, not duplicated root frontmatter. Exact collection root
reads such as `key=tasks`, `key=references`, and `key=backlinks` return a paged collection object.
Task items are keyed by their stable task id; reference items are keyed by their
absolute 0-based list index in frontmatter:

```json
{
  "value": {
    "count": 42,
    "offset": 0,
    "limit": 20,
    "returned": 20,
    "has_more": true,
    "items": {
      "a8f3k2m9": {
        "checkbox": "/",
        "name": "Review evaluation set",
        "priority": "high"
      }
    }
  }
}
```

Use `key=tasks/<id>` or `key=tasks/<id>/<field>` to read one task, and use
`key=references/<i>` or `key=references/<i>/<field>` to read one reference by
0-based index. When filters are provided, `count` is the number of matching
items before pagination.

Use `key=backlinks` to read notes whose Obsidian-resolved links point at the
selected note. Backlinks are computed from `metadataCache.resolvedLinks`, so
they include body links and frontmatter links after Obsidian has resolved them.
Backlink items are keyed by 0-based source-path order and expose `link`, `path`,
`title`, and source note `type`. `query=` matches backlink source title and
path; `type=` filters by the source note's frontmatter `type`, for example
`type=project`. Use `key=backlinks/<i>` or
`key=backlinks/<i>/{link|path|title|type}` to read one backlink item or field.
Backlinks are read-only.

```json
{
  "mode": "compact",
  "tasks": {
    "count": 42
  },
  "references": {
    "count": 12
  },
  "backlinks": {
    "count": 3
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
- `references`: structured frontmatter reference collection. Items expose
  stored `link`, derived `kind`, optional `description`, and derived
  `path` or `target` where applicable.
- `backlinks`: read-only inbound resolved-link collection. Items expose the
  source note `link`, `path`, `title`, and `type`; use `type=` to filter by
  source note type.
- `children`: read-only child-note index; read or edit a child by drilling from
  the container with `child=["<title>", ...]`.
- `value`: present when `key` is provided.

The same map-path read algorithm is used by the other domain read commands. The
command selects the target note, builds that note type's stable surface map, and
then resolves `key` as a `/`-separated map path.
When selecting by `title`, `read-project`, `read-area`, `read-resource`, and
`read-retro` accept `archived=true` to select the matching note under
`PARA/Archives`.

Surface types fall into two groups. `project`, `area`, `journal`, and `retro`
are structured: their load-bearing template sections are stable keys. `resource`,
child `subnote`/fallback `note`, and `zk_*` notes are free-form: prose is exposed as
one `body` key for the whole editable Markdown body before the managed tail.
Free-form bodies may contain H1 headings; those headings are content, not extra
stable keys.

| Command | Selector | Top-level keys |
| --- | --- | --- |
| `para-zk:read-area` | `title` | `frontmatter`, `overview`, `tasks`, `references`, `backlinks`, `children` |
| `para-zk:read-resource` | `title` | `frontmatter`, `body`, `references`, `backlinks` |
| `para-zk:read-zk` | `title` plus optional `kind` | `frontmatter`, `body`, `references`, `backlinks` |
| `para-zk:read-journal` | `date` | `frontmatter`, `focus`, `quick_memo`, `timeline`, `tasks`, `short_review`, `references`, `backlinks` |
| `para-zk:read-retro` | `title` plus optional `date` | `frontmatter`, `week_progress`, `good`, `improve`, `risks`, `tasks`, `retro_summary`, `references`, `backlinks` |

Free-form top-level keys:

```text
resource: frontmatter | body | references | backlinks
zk_spark: frontmatter | body | references | backlinks
zk_digest: frontmatter | body | references | backlinks
zk_permanent: frontmatter | body | references | backlinks
```

ZK templates still start with example headings such as Summary or Key insights,
but those headings live inside `body`; read and edit them with `key=body`.
Type-specific `frontmatter/<key>` reads and writes remain available where
`para-zk:describe` lists frontmatter keys.

Examples:

```bash
optsidian para-zk:read-area title="AI" key=children format=json
optsidian para-zk:read-area title="AI" key=backlinks type=project format=json
optsidian para-zk:read-project title="Finished Project" archived=true key=summary format=json
optsidian para-zk:read-resource title="Source Paper" key=body format=json
optsidian para-zk:read-zk title="Stable Interface Contracts" kind=permanent key=body format=json
optsidian para-zk:read-zk title="Stable Interface Contracts" kind=permanent key=frontmatter/maturity format=json
optsidian para-zk:read-journal date=2026-05-30 key=quick_memo format=json
optsidian para-zk:read-retro title="Retro-General-2026_W22" key=retro_summary format=json
```

### `para-zk:update-project`

Updates a writable PARA-ZK surface by the same stable map keys used for reads.
The command is scoped to a domain note first, then applies the edit only inside
the selected key. It is not a raw file edit.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `title` | string | Project title. |
| `archived` | boolean | Same title lookup behavior as `read-project`. |
| `key` | writable map path | Required. Examples: `frontmatter/status`, `summary`, `body`. Drill into a child with `child=["<title>"]` and use the child's own key. |
| `op` | `set`, `insert`, `append`, `prepend`, `replace`, `delete` | Required update operation. |
| `value` | text | Required for scalar `set`, `append`, and `prepend`. |
| `value_json` | JSON | Structured value for frontmatter updates and task/reference inserts. |
| `match` | text | Required for `replace`. Exact literal text inside the selected key. |
| `with` | text | Replacement text for `replace`. Empty is allowed. |
| `all` | boolean | For `replace`, replace all matches. Without it, multiple matches fail. |

Writable keys are a subset of read keys. A scalar `frontmatter/<key>` supports `op=set`
only and uses Obsidian frontmatter mutation. A multi-value list frontmatter key — shown in a
type's `writeKeys` as `…=set|append|prepend|delete`, e.g. a project's `frontmatter/areas` —
also supports `append`/`prepend` (add one value) and `delete` (remove one), so you can add an
area without restating the whole list; `areas` accepts an area title (resolved to its canonical
link) or an existing `[[link]]`. Section/body keys support `set`, `append`, `prepend`, and
exact literal `replace`.
For free-form resource, child subnote/note, and ZK prose, use `key=body`; old starter
headings such as `summary`, `memo`, `insight`, or `limitations` are not writable
map keys.
Task collections are structured and do not accept raw Markdown task lines.
Insert one task with `key=tasks op=insert value_json='{...}'`, update one field
with `key=tasks/<id>/<field> op=set value=...`, and delete one task with
`key=tasks/<id> op=delete`. Supported task fields are `checkbox`, `name`,
`priority`, `due`, `scheduled`, `start`, `created`, `done`, and `cancelled`.
Task ids and metadata use the Tasks plugin's default Emoji format. Generated
task ids are 8-character lower-case base36 tokens, checked against existing
vault task ids before writing.
Use `position` in task `value_json` to insert before the 1-based task position,
or omit it to append at the end.

References are stored in the selected note's `references` frontmatter array,
not as body lines. Each stored item is either a bare canonical `link` string or
an object `{ link, description? }`. The writable collection keys are:

```text
references
references/<i>
references/<i>/link
references/<i>/description
```

Insert one reference with `key=references op=insert value_json='{...}'`.
The reference insert `position` in `value_json` is 0-based: `position: 0`
inserts before the first reference, while omitted `position` appends. This is a
different convention from task insert, where `position` is 1-based.

Reference insert values accept `link`, optional `description`, and
optional 0-based `position`. Insert returns `index`, `link`, `changed`, and
`added`. If the canonical `link` already exists, insert is a no-op: requested
`position` is ignored and the existing `index` and `link` are returned with
`changed: false` and `added: false`.

Update one stored reference field with `key=references/<i>/<field> op=set`.
Writable fields are `link` and `description`. Setting `link` keeps the item
at the same index and re-derives `kind`, `path`, and `target`. Setting `link` to
another existing canonical link is rejected as a duplicate without merging,
deleting, or reordering either item. Setting `description` to `value=""`, or
to `value_json=null`, clears that field; if only `link` remains, the item is
serialized back as a bare string. Delete one item with
`key=references/<i> op=delete`; later indices shift after deletion.

Derived reference fields are read-only. `kind`, `path`, and `target` can be read
through `key=references/<i>/<field>`, but cannot be updated.

Read-only keys include `children`, `backlinks`, `path`, `title`, `type`, and
`archived`.

Examples:

```bash
optsidian para-zk:update-project title="Model Evaluation" key=frontmatter/status op=set value=done format=json
optsidian para-zk:update-project title="Model Evaluation" key=summary op=replace match="old claim" with="new claim" format=json
optsidian para-zk:update-project title="Model Evaluation" key=tasks op=insert value_json='{"name":"Review evaluation set","due":"2026-06-05","priority":"high"}' format=json
optsidian para-zk:update-project title="Model Evaluation" key=references op=insert value_json='{"link":"https://example.com/paper","description":"Reviewed in May","position":0}' format=json
optsidian para-zk:update-project title="Model Evaluation" key=references/0/description op=set value="Important source paper" format=json
optsidian para-zk:update-project title="Model Evaluation" key=references/0/description op=set value_json=null format=json
optsidian para-zk:update-project title="Model Evaluation" key=references/0 op=delete format=json
optsidian para-zk:update-project title="Model Evaluation" key=tasks/a8f3k2m9/checkbox op=set value=x format=json
optsidian para-zk:update-project title="Model Evaluation" key=tasks/a8f3k2m9 op=delete format=json
optsidian para-zk:update-project title="Model Evaluation" child='["Planning Meeting"]' key=body op=append value="Decision: ship the baseline." format=json
optsidian para-zk:update-project title="Model Evaluation" key=frontmatter/status op=set value=archived format=json
```

For projects, `key=frontmatter/status op=set value=archived` is a structural
archive operation: it moves the folder-style project from `PARA/Projects` to
`PARA/Archives/Projects`. Updating the archived copy with `archived=true` and a
non-archived status restores it to `PARA/Projects`.

Result fields:

- `path`: the actual file that was updated. With `child=[...]`, this is the
  resolved child note path.
- `key`: the original requested key.
- `operation`: the applied operation.
- `changed`: false when the requested `set` value already matched.
- `matches`: present for `replace`.
- `index`, `link`, and `added`: present for reference insert results; `index`
  and `link` are also present for reference field updates and deletes.
- `moved`, `fromPath`, and `toPath`: present when a project status update moved
  the project between active and archived folders.

The same update algorithm is used by the other domain update commands:

| Command | Selector | Notes |
| --- | --- | --- |
| `para-zk:update-area` | `title` | Supports area surface keys; drill into children with `child=[...]`. |
| `para-zk:update-resource` | `title` | Uses free-form `body`, `references`, and frontmatter keys. |
| `para-zk:update-zk` | `title` plus optional `kind` | Uses free-form `body`, `references`, and type-specific frontmatter keys. |
| `para-zk:update-journal` | `date` | Supports journal surface keys such as `quick_memo` and `tasks`. |
| `para-zk:update-retro` | `title` plus optional `date` | Supports retro surface keys such as `tasks`. |

### Rename Commands

Renames are explicit structural commands rather than raw path edits. They update
the note path and title-derived tag while preserving the note's other metadata.
Project and area renames also rename default source-scoped retro files whose
names were deterministically generated from that project or area. Custom-titled
retros are left in place.

| Command | Selector | Notes |
| --- | --- | --- |
| `para-zk:rename-project` | `title`; optional `archived` | Renames the folder-style project folder and main note. Child notes move with the folder; default project-scoped retros are renamed with it. |
| `para-zk:rename-area` | `title`; optional `archived` | Renames the folder-style area folder and main note. Child areas move with the folder; default area-scoped retros and area tag namespaces are updated without dropping inherited parent tags. |
| `para-zk:rename-resource` | `title`; optional `archived` | Renames the resource note file in place. |
| `para-zk:rename-zk` | `title` plus optional `kind` | Renames the selected ZK note file in place. |

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `title` | string | Current note title. |
| `child` | JSON list | `rename-project`/`rename-area` only. Drill into a nested child (subnote/subarea) to rename it instead of the container, e.g. `["Hiring","Interviews"]`. |
| `new_title` | string | Required new note title. Aliases such as `newTitle` are rejected. |
| `archived` | boolean | PARA rename commands only; same title lookup behavior as reads. |
| `kind` | ZK kind code | `rename-zk` only; narrows title lookup. |

Examples:

```bash
optsidian para-zk:rename-project title="Model Evaluation" new_title="Model Evaluation 2026" format=json
optsidian para-zk:rename-area title="AI" new_title="Applied AI" format=json
optsidian para-zk:rename-resource title="Source Paper" new_title="Source Paper Notes" format=json
optsidian para-zk:rename-zk title="Stable Interface Contracts" kind=permanent new_title="Stable CLI Contracts" format=json
```

Result fields:

- `path`: final note path.
- `changed`: false when the title was already equal after sanitization.
- `fromPath` and `toPath`: source and final note paths.
- `fromTitle` and `toTitle`: source and final titles.
- `renamedRetros`: project/area rename cascades, when default source-scoped
  retro files were renamed. Each entry has `fromPath` and `toPath`.

### Delete Commands

Delete commands move notes to Obsidian trash with core Obsidian APIs. They do
not require Trash Explorer to be installed or enabled. Trash Explorer is still a
useful GUI dependency for reviewing and emptying `.trash`, but PARA-ZK delete
workflows do not call it.

Body backlinks are intentionally preserved. The JSON result reports incoming
links observed before deletion so an LLM can decide whether follow-up edits are
needed. PARA-ZK only cleans relationships it owns directly:

- frontmatter links in keys such as `areas`, `project`, and `parent`
- frontmatter `references` items that point at the deleted note

| Command | Selector | Notes |
| --- | --- | --- |
| `para-zk:delete-project` | `title`; optional `archived` | Deletes the folder-style project container. Requires `force=true` if child files are inside. |
| `para-zk:delete-area` | `title`; optional `archived` | Deletes the folder-style area container. Requires `force=true` if child files are inside. |
| `para-zk:delete-resource` | `title`; optional `archived` | Deletes the resource note and removes matching frontmatter reference items. |
| `para-zk:delete-zk` | `title` plus optional `kind` | Deletes the selected ZK note and removes matching frontmatter reference items. |
| `para-zk:delete-journal` | `date` | Deletes a daily journal note. |
| `para-zk:delete-retro` | `title` plus optional `date` | Deletes a retro note. |

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `title` | string | Current note title. |
| `child` | JSON list | `delete-project`/`delete-area` only. Drill into a nested child (subnote/subarea) to delete it instead of the container. |
| `archived` | boolean | PARA delete commands only; same title lookup behavior as reads. |
| `kind` | ZK kind code | `delete-zk` only; narrows title lookup. |
| `date` | `YYYY-MM-DD` | `delete-journal` and `delete-retro` only. |
| `force` | boolean | Required when a folder-style project or area contains child files. |

Examples:

```bash
optsidian para-zk:delete-resource title="Source Paper" format=json
optsidian para-zk:delete-area title="Unused Area" format=json
optsidian para-zk:delete-project title="Prototype" force=true format=json
optsidian para-zk:delete-zk title="Draft idea" kind=spark format=json
optsidian para-zk:delete-journal date=2026-05-30 format=json
```

Important result fields:

- `containerPath`: file or folder path moved to trash.
- `deletedPaths`: paths that were inside the deleted container before trashing.
- `incomingLinks`: backlink counts observed before deletion; body links are not
  modified.
- `cleaned.frontmatter`: count of PARA-ZK frontmatter keys cleaned.
- `cleaned.references`: count of frontmatter `references` entries removed.
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
optsidian para-zk:create-project \
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

Creates a resource note and optionally appends a frontmatter reference to it on
the source note. Use this when the reference needs its own note, body text,
metadata, or future reuse. For an existing file, note, or URL, use
`para-zk:add-reference`.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `title` | string | Required. |
| `source_type` | `project`, `area`, `resource`, `zk` | Optional source note type to link this resource from. |
| `source_title` | string | Optional source note title. |
| `link` | boolean | Defaults to `true` when `source_title` is provided. |
| `url` | string | Optional provenance: where the source came from. |
| `first_author` | string | Optional provenance: the source's first author. |
| `license` | SPDX id | Optional provenance: SPDX identifier (e.g. `MIT`, `CC-BY-4.0`); when no SPDX id fits, a short recognizable token (e.g. `arXiv`). |
| `kind` | `paper` \| `article` \| `book` \| `video` \| `web` \| `code` \| `guide` \| `other` | Optional provenance: locale-neutral source kind code. |
| `body` | markdown | Optional initial free-form body content. |
| `open` | boolean | Default `false`. |

The four provenance keys are also editable after creation via
`para-zk:update-resource key=frontmatter/<url|first_author|license|kind>` (and
surfaced by `para-zk:describe type=resource`); `kind` is validated against the code
list above. For example:

```bash
optsidian para-zk:update-resource title="Attention" key=frontmatter/kind op=set value=paper format=json
```

Example:

```bash
optsidian para-zk:create-resource \
  title="Source Paper" \
  source_type=project source_title="Model Evaluation" \
  link=true \
  format=json
```

Important fields:

- `sourcePath`
- `linkedFromSource`

### `para-zk:add-reference`

Adds an existing vault file, wikilink, markdown link, URL, or text reference to
a note's frontmatter `references` array.

Options:

The receiving note is addressed **by name** (like every other command). The
`target` references another note by name too — use `[[Title]]`, which Obsidian
resolves by basename, so you never need a full path (and a just-created note's
returned `path`/title can be used directly).

| Option | Values | Notes |
| --- | --- | --- |
| `type` | `project`, `area`, `resource`, `zk`, `retro`, `journal` | Type of the note that receives the reference. |
| `title` | string | Receiving note title (project/area/resource/zk/retro). |
| `kind` | `spark`, `digest`, `permanent` | Receiving ZK kind when `type=zk`. |
| `date` | YYYY-MM-DD | Receiving note date when `type=journal`/`retro`. |
| `child` | JSON list | Optional. Drill into a nested child of the receiving container. |
| `target` | `[[wikilink]]`, URL, markdown link, or text | Required. `[[Title]]` is resolved by basename to a vault note. URLs are stored directly. Markdown-link and wikilink aliases are input syntax only and are dropped. |
| `description` | string | Optional per-reference description. |
| `open` | boolean | Default `false`. |

Examples:

```bash
optsidian para-zk:add-reference \
  type=resource title="Attention Is All You Need" \
  target="[[Telegram Clone]]" \
  description="Project that applies this" \
  format=json

optsidian para-zk:add-reference \
  type=project title="Model Evaluation" \
  target="https://example.com/paper" \
  description="Source paper" \
  format=json
```

Important fields:

- `path`
- `index`
- `link`
- `added`

`index` is the 0-based position of the affected reference. If the canonical
`link` already exists, the command returns that existing index with
`added: false` and does not rewrite the stored description.

Canonical stored links are label-free: vault note/file targets are stored as
`[[path]]` or `[[path#subpath]]`, URLs are stored as raw URLs, unresolved
wikilinks are stored as normalized `[[target]]`, and plain non-link text remains
text. Input aliases such as `[[Note|alias]]` and markdown text such as
`[text](url)` are dropped; the displayed title is always the target filename or
URL, and `description` is set only when explicitly supplied. `kind`, `path`, and
`target` are derived on read and never stored. The
accepted read kinds are `url`, `note`, `file`, `wiki`, and `text`; `markdown` is
not a stored or derived kind.

Hand-authored bare-string `references` entries must use wikilink or URL syntax
when they should behave as links. A frontmatter entry such as
`references: ["folder/note.md"]` is read as `kind: "text"` and does not produce
a backlink. Path-to-wikilink canonicalization runs only through write paths such
as `add-reference` and `update ... key=references op=insert`.

### `para-zk:create-subnote`

Creates a child document under a project or area note.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `title` | string | Required. |
| `parent_type` | `project`, `area` | Parent note type. |
| `parent_title` | string | Parent note title. |
| `child` | JSON list | Optional. Drill from the named parent into a nested child container to create under it, e.g. `["Hiring","Interviews"]`. |
| `subnote_type` | subnote type code | Defaults to `free`. |
| `body` | markdown | Optional initial free-form body content. |
| `open` | boolean | Default `false`. |

Example:

```bash
optsidian para-zk:create-subnote \
  title="Planning Meeting" \
  parent_type=project parent_title="Model Evaluation" \
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
| `parent_title` | string | Parent area title. |
| `child` | JSON list | Optional. Drill from the named parent area into a nested subarea to create under it. |
| `inheritParentTag` | boolean | Defaults to `true`. |
| `open` | boolean | Default `false`. |

Example:

```bash
optsidian para-zk:create-subarea \
  title="LLM Tooling" \
  parent_title="AI" \
  inheritParentTag=true \
  format=json
```

### `para-zk:create-retro`

Creates a weekly retro note, optionally scoped to a project or area.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `source_type` | `project`, `area` | Optional scope note type. |
| `source_title` | string | Optional scope note title. |
| `title` | string | Optional retro title segment. |
| `date` | `YYYY-MM-DD` | Date used for ISO week calculation. Defaults to today. |
| `open` | boolean | Default `false`. |

Example:

```bash
optsidian para-zk:create-retro \
  source_type=project source_title="Model Evaluation" \
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
| `kind` | ZK kind code | Defaults to `spark`. |
| `maturity` | maturity code | Used for permanent notes. Defaults to `draft`. |
| `body` | markdown | Optional initial free-form body content. |
| `open` | boolean | Default `false`. |

Example:

```bash
optsidian para-zk:create-zk \
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
optsidian para-zk:capture-journal \
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

ZK notes are created with **single-direction links**: the new note references its
origin; the origin is preserved and gets no reverse link written into it — the new
note surfaces in the origin's *Cited by* view via Obsidian backlinks.

### `para-zk:create-from-resource`

Creates a Digest or Permanent ZK note from a resource and writes a frontmatter
reference on the new ZK note back to the resource. The resource is preserved and
left unchanged.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `source_title` | string | Source resource title. |
| `title` | string | Optional. Defaults to source basename. |
| `kind` | `digest` \| `permanent` | Defaults to `permanent`. |
| `maturity` | maturity code | Used for permanent notes. |
| `body` | markdown | Optional initial free-form body content. |
| `open` | boolean | Default `false`. |

Example:

```bash
optsidian para-zk:create-from-resource \
  source_title="Source Paper" \
  title="Paper Insight" \
  kind=digest \
  format=json
```

Important fields:

- `sourcePath`
- `kind`

### `para-zk:create-from-digest`

Creates a Permanent note from a digest note and writes a frontmatter reference on
the new permanent note back to the digest. The digest is preserved.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `source_title` | string | Digest note title. |
| `title` | string | Optional. Defaults to the digest note's basename. |
| `maturity` | maturity code | Permanent-note maturity. |
| `body` | markdown | Optional initial free-form body content. |
| `open` | boolean | Default `false`. |

Example:

```bash
optsidian para-zk:create-from-digest \
  source_title="Paper Digest" \
  title="Compounding learning" \
  maturity=refined \
  format=json
```

Important fields:

- `sourcePath`
- `kind` (always `permanent`)

### `para-zk:distill-spark`

Distills a spark into a new Permanent note. By default the spark is **kept**,
marked `processed: true`, with a `distilled_to` pointer to the new note (a spark
may yield several permanents, so discard is left manual). Pass `discard=true` to
move the spark to trash instead. The permanent never references the ephemeral
spark — the `distilled_to` pointer lives on the spark, so discarding it (by any
means) leaves no dangling link.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `source_title` | string | Source spark title. |
| `title` | string | Optional. Defaults to source basename. |
| `maturity` | maturity code | Permanent-note maturity. |
| `discard` | boolean | Move the spark to trash instead of keeping it processed. Default `false`. |
| `body` | markdown | Optional initial free-form body content for the new permanent. |
| `open` | boolean | Default `false`. |

Example:

```bash
optsidian para-zk:distill-spark \
  source_title="Raw Thought" \
  title="Durable Thought" \
  maturity=evergreen \
  format=json
```

Important fields:

- `sourcePath`
- `kind` (always `permanent`)

Side effects:

- Creates a Permanent note.
- Without `discard`: marks the spark `processed: true` and appends the new note
  to the spark's `distilled_to`.
- With `discard=true`: moves the spark to trash (recoverable).

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
