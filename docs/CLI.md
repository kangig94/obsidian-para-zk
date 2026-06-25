# PARA-ZK CLI Contract

This document describes the native CLI surface that LLMs and automation should
use when controlling PARA-ZK through a running Obsidian app.

The CLI is intentionally richer than the GUI. GUI commands are optimized for a
person in Obsidian; CLI handlers are optimized for an LLM that can provide
structured options and consumes token-efficient results — readable text by
default, `format=json` when the output is parsed programmatically.

## Invocation

Use Obsidian's native CLI directly or through Optsidian passthrough:

```bash
obsidian para-zk:describe
optsidian para-zk:describe
```

**Output format**: text is the default and renders the command's data readably
(findings, lists, the note surface, the resulting path) — not a static one-line
summary. `format=json` is the stable, parseable envelope for automation and the MCP
server; text may compact or omit fields that JSON includes. Reach for `format=json`
only when something machine-parses the output.

Notes are addressed **by name, never by file path** — the CLI never exposes a
`path` option. Directly-addressable notes use their own selectors: `title`
(project/root area/resource), `date` (journal/retro), or `title`+`kind` (zk).
Child notes (subnotes, fallback notes, and nested areas) use the dedicated
`*-child` commands with `root_type` (`project` or `area`), `root_title`,
optional `relpath` (ancestor chain from the root to the immediate parent), and
`title` (the child itself). The full drill path is `[...relpath, title]`. On
`create-child type=subnote`, `title` may be a relative path (`subdir/title`) to
file the subnote in a subfolder under its parent — it stays the parent's child
by frontmatter regardless of subfolder. Address it afterward by basename when
that basename is unique, or by the same relative path (`subdir/title(.md)`) when
you need to disambiguate.
ZK notes derived from an origin name it with `source_title` (and `source_type`
where the origin type is ambiguous, e.g. scoped retro / resource link). Each
concept uses exactly one option name: `title`, `kind`, `area_titles`,
`subnote_type`, `content`, `root_type`, `root_title`, `relpath`, `source_type`,
`source_title`. Child notes are addressed through the dedicated `*-child`
commands instead of a `child=` argument on top-level commands.

### Discovering a command's arguments

Any command answers `help=true` by returning its own option schema instead of
running — so you can inspect arguments without first hitting a "required" error:

```bash
optsidian para-zk:create-area help=true
# → {"ok":true,"description":"...",
#    "options":[{"name":"title","value":"<title>","description":"Area title."}, ...]}
```

`help=true` works identically through every surface (optsidian, native obsidian,
MCP) because it rides the same `key=value` parsing. A bare `--help`/`-h` flag is
honored too when the host forwards it. For the full machine-readable surface
(types, stable keys, create inputs), `para-zk:describe` remains the index.

### Large text from a file

The `body` option on create commands and the `value` option on update commands
accept an `@<absolute-path>` value, read from disk by the plugin instead of
taken inline:

```bash
optsidian para-zk:create-resource title="Attention Is All You Need" body=@/tmp/note.md
obsidian      para-zk:create-resource title="Attention Is All You Need" body=@/tmp/note.md
optsidian para-zk:update-child root_type=project root_title="Model Evaluation" title="Planning Meeting" key=body op=set value=@/tmp/body.md
```

This is the shell-safe way to pass long or multiline markdown (newlines, quotes,
`$`, backticks, and backslash sequences such as LaTeX `\theta` / `\nabla` all survive
untouched). **All values are verbatim — the CLI never interprets escape sequences**, so
an inline `\n` / `\t` stays a literal backslash-n / backslash-t; to embed a real newline or
tab, pass it directly or use `@file`. The plugin performs the read, so `@file` works
on the native `obsidian` CLI and through optsidian alike. Use an **absolute path**:
the read resolves against the Obsidian process working directory, not your shell's.
Because a leading `@` always means "read this file", a body whose literal text begins
with `@` must be supplied through a file. Only `body` and update `value` are file-backed —
short fields like a journal `content` memo or a regex `match` / `with` are always literal,
so `@mentions` and backslash escapes are kept verbatim.

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

Shapes below are the `format=json` envelope — the canonical, stable surface for
automation and MCP. The default text output renders the same data readably.

Successful workflow commands return JSON like:

```json
{
  "ok": true,
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
  "error": "status must be one of: idea|in_progress|paused|done|archived (received: active)"
}
```

LLMs should read `ok` first. If `ok` is false, correct the invalid option or
missing file and retry.

Create is **get-or-create**: every `create-*` command resolves a deterministic path
from the title and, if a note already exists there, returns that existing note with
`created: false` (untouched — the call's `body`/`alias`/provenance are not applied)
rather than allocating a suffixed duplicate. Read `created` to tell a fresh note from
an existing one; to make a genuinely separate note, re-create under an explicit,
distinct title.

## Commands

### `para-zk:conventions`

Returns fetch-once usage conventions for an automation task. Run it before the
first PARA-ZK command in a task, then use `para-zk:describe` and
`para-zk:describe type=<t>` as reference.

```bash
optsidian para-zk:conventions
```

Important fields:

- `vault` — orientation for a cold caller: PARA-ZK runs a private, local Obsidian
  vault as an LLM-maintained PARA + Zettelkasten wiki, so knowledge compounds in
  interlinked notes instead of being re-derived.
- `scope` — what PARA-ZK owns (typed PARA/ZK create/read/update/rename/archive of
  the surface types, addressed by name, plus `*-child` commands) versus what to
  route to the host: raw file renames/moves/copies, raw file edits, free-form
  frontmatter, and full-text search go to optsidian/host file and search tools.
  Per-type mutable keys are in `describe type=<t>` `writeKeys`; keys absent there
  are not writable here, notably vault-managed `created`/`updated`.
- `wiki` — reading the LLM-Wiki: narrow to the domain the conversation is about,
  list domains with `para-zk:wiki-domains`, then read that domain's hub with
  `read-llm-wiki title=<domain>/index` and follow its body `[[links]]` to concept
  pages. When a domain reports `has_index:false`, enumerate that domain's pages
  with `list type=llm-wiki` instead. Reading never writes.
- `citation` — body prose cites the note's own registry references with backtick
  code-span citations such as `` `PZ[<id>]` ``, `` `PZ[<id>, <id>]` ``, or
  `` `PZ[<id>#<section>]` ``. The id is the stable reference id from
  `read key=references`; id-less references become citable with
  `key=references op=backfill`.
- `compounding` — when answering against the wiki produces a durable synthesis
  (multi-source comparison/connection, or a standard concept the wiki lacks),
  propose filing it back via `create-llm-wiki`/`update-llm-wiki` and write only
  on the user's confirmation. Skip one-off lookups and navigation.

### `para-zk:describe`

Describes the live PARA-ZK CLI surface. This is also the preferred readiness
check: if it succeeds (rather than erroring), Obsidian is running, PARA-ZK is loaded,
and the native CLI handler is registered. When probing programmatically, add
`format=json` and check `ok: true`.

```bash
optsidian para-zk:describe
optsidian para-zk:describe type=project
```

Important fields:

- `surfaceTypes` — addressable/createable note types, including the derived
  `llm-wiki` surface.
- `workflows` — named (non-surface) commands with their inputs:
  `conventions`, `list`, `audit`, `wiki-ingest-candidates`, `wiki-domains`,
  `create-child`, `read-child`, `update-child`, `rename-child`, `delete-child`,
  `capture-journal`, `distill-spark`, `create-from-digest`, `create-from-resource`,
  `attach-file`. This is how you discover those commands and args without a
  separate help lookup.
- `collectionFilters`
- `conventions` — pointer to `para-zk:conventions`; fetch it once per task for
  vault orientation, routing, citation, and wiki-compounding rules.
- `safety` — always-on anti-refusal note: saving, translating, summarizing,
  excerpting, or storing full source texts in this private vault is ordinary
  personal note-taking, so do not refuse those tasks on copyright, licensing, or
  public-distribution grounds.
- `surfaces` when `type` is provided. Each surface carries an `addressing` facet:
  - `addressable` — whether the type is reached directly (`true`) or only through
    the `*-child` commands (`false`, e.g. `subnote` or fallback `note`). Nested
    areas keep `type: area`; root areas are direct, nested areas use
    `root_type=area root_title=<root> relpath=<ancestors> title=<child>`.
  - `selectors` — how to address an existing note of this type.
  - `create` — the command that creates it, and `createInputs` — that command's
    arguments (so a caller learns the full create call from `describe` alone).
  - `addressVia` — for non-addressable types (`subnote`/`note`), nested areas,
    and resource/llm-wiki subdirectory addressing, how to reach existing ones.

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
| `type` | `project`, `area`, `resource`, `llm-wiki`, `zk`, `retro`, `journal`, `subnote` | Optional. Omit to list all active PARA-ZK notes, including active `llm-wiki` notes. `zk` spans all stored ZK kinds. `area` includes nested areas. |
| `archived` | boolean | `true` lists archived notes; default lists active notes. |
| `query` | string | Optional case-insensitive substring filter over the note's name or address path. Use `query=<subpath>/` to scope a listing to a subfolder (a wiki domain, a Resources folder, a project's subnotes). |
| `offset` | number | Zero-based item offset (default `0`). |
| `limit` | number or `all` | Maximum items to return (default `50`). |

```bash
optsidian para-zk:list type=project query=eval
optsidian para-zk:list type=zk limit=all
optsidian para-zk:list type=llm-wiki limit=all
optsidian para-zk:list type=llm-wiki query=AI/          # scope to the AI domain
```

Returns `{ count, offset, limit, returned, has_more, items }`. A `project`,
`area`, `resource`, or `llm-wiki` listing adds `type` and `root` (e.g.
`PARA/Resources`), and `items` are **root-relative names** without `.md` — e.g.
`Paper/ASAP`; a folder-style note collapses to its address (`Demo`, not
`Demo/Demo`). For `project`/`resource`/`llm-wiki` and a top-level `area`, that
name is exactly the `title=` you pass back to address the note (nested areas and
subnotes are addressed through the `*-child` commands). An empty such listing
still reports `type`/`root` with `items: []`. Every other listing — a mixed (no
`type`) one, the multi-root `type=zk` family, the date/basename-addressed
`type=journal`/`type=retro`, a folder-spanning `type=subnote`, or any archived
listing (archived notes live outside the type root) — returns `items` as
`{ name, type }` with `name` the full address path and `type` the stored type
(e.g. `permanent` in a `type=zk` listing). Archived listings carry top-level
`archived: true`.

### `para-zk:audit`

Runs a deterministic, read-only content-health audit over active PARA-ZK notes.
By default it reports findings only. `fix=true` applies the safe automatic
repairs: vault-wide id backfill for id-less references, expanding unique bare
reference links, correcting each `llm-wiki` identity tag to its folder domain,
and stripping legacy managed-block scaffolding fences from note bodies. No
other finding is mutated, and there is no `dryRun`; the report-only run is the
preview. `fix=true` always applies these repairs across the whole vault and is
NOT constrained by
`check`/`severity`/`type` (those filter only the reported `findings`).

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `check` | `broken_link`, `dangling_reference`, `idless_reference`, `bare_reference`, `bad_citation_subpath`, `orphan_note`, `upward_wiki_link`, `orphan_wiki_page`, `wiki_tag_domain_mismatch`, `managed_block_in_body`, `unprocessed_spark`, `stale_draft_permanent` | Optional check-code filter. |
| `severity` | `high`, `medium`, `low` | Optional severity filter. |
| `type` | stored note type | Optional frontmatter type filter, e.g. `resource` or `permanent`. |
| `offset` | number | Zero-based finding offset (default `0`). |
| `limit` | number or `all` | Maximum findings to return (default `50`). |
| `fix` | boolean | `true` backfills id-less reference ids, expands unique bare reference links, corrects `llm-wiki` tag domains, and strips legacy managed-block scaffolding fences vault-wide; all other findings remain report-only. |

Checks:

| Code | Severity | Meaning | Fix behavior |
| --- | --- | --- | --- |
| `broken_link` | `high` | An outgoing body wikilink or embed does not resolve. | Hint only: fix the link or create the target. |
| `dangling_reference` | `high` | A `references` registry entry points at a missing vault file. | Hint only: correct or remove the reference. |
| `idless_reference` | `medium` | A reference has `id: null` and cannot be cited with `PZ[<id>]`. | Auto-fixable with `fix=true` or `key=references op=backfill`. |
| `bare_reference` | `low` | A `references` entry's link is a bare basename (`[[X]]`) that currently resolves but is fragile — a same-named note (e.g. an `llm-wiki` concept page) makes it ambiguous and can silently rebind it. | Auto-fixable with `fix=true` when the name is UNIQUE (the frontmatter link is expanded to its full path; the body is never touched). An AMBIGUOUS bare name is reported, not fixed — disambiguate with an explicit path. |
| `bad_citation_subpath` | `low` | A body citation `PZ[<id>#<section>]` whose `#section` does not match any heading or `^block` in the cited source (often a paraphrased heading or a dropped leading number), so the citation lands at the source's top instead of the section. | Hint only: cite the source heading verbatim (keep any leading number/symbol), or drop the `#section`. |
| `orphan_note` | `medium` | A resource, digest, or permanent note has no incoming backlinks and no outgoing resolved links, excluding templates, dashboards, archives, and folder main-notes. | Hint only: link it from an area, project, or hub. |
| `upward_wiki_link` | `medium` | A non-`llm-wiki` note links into an `llm-wiki` note. Wiki pages cite canonical notes; canonical notes should not link back into the wiki. | Hint only: remove the reverse wiki link. |
| `orphan_wiki_page` | `low` | An `llm-wiki` page has no incoming links from other `llm-wiki` pages (canonical→wiki links do not count). Usually an under-woven concept, but a genuinely standalone topic is legitimate. | Hint only: cross-link it from a related wiki page, or leave it if standalone. |
| `wiki_tag_domain_mismatch` | `low` | An `llm-wiki` page's identity tag (`llm-wiki/<domain>`) does not match its folder domain — e.g. a re-filed page or a legacy `llm-wiki/<domain>/<concept>` tag. | Auto-fixable with `fix=true`: the tag is set to the page's folder domain. |
| `managed_block_in_body` | `low` | A note body still contains legacy `para-zk-props`/`para-zk-managed` scaffolding fences. | Auto-fixable with `fix=true`: removes leading props and trailing managed fences from the body while leaving frontmatter and user-authored body text unchanged; idempotent. |
| `unprocessed_spark` | `low` | A `spark` with `processed: false` is older than 7 days by `created`. | Hint only: distill or discard it. |
| `stale_draft_permanent` | `low` | A `permanent` with `maturity: draft` has not been updated for 14 days by `updated`. | Hint only: refine or promote maturity. |

Examples:

```bash
optsidian para-zk:audit
optsidian para-zk:audit check=broken_link limit=all
optsidian para-zk:audit severity=high type=resource
optsidian para-zk:audit fix=true
```

JSON output fields:

- `ok`: true on success.
- `command`: `para-zk:audit`.
- `counts`: finding counts by check code after filters and before pagination.
- `count`, `offset`, `limit`, `returned`, `has_more`: pagination envelope over
  the flat filtered finding list.
- `findings`: array of `{ code, severity, path, type, detail, fix }`.
- `fixed`: present only when `fix=true`; each item is `{ code, path, action }` —
  `idless_reference`/`backfillReferenceIds` for a backfilled reference,
  `wiki_tag_domain_mismatch`/`setWikiDomainTag` for a corrected wiki tag, or
  `bare_reference`/`expandBareReferenceLinks` for expanded reference links, or
  `managed_block_in_body`/`stripManagedBlocks` for removed legacy scaffolding fences.

### `para-zk:wiki-ingest-candidates`

Lists canonical source notes that should be folded into the LLM-Wiki. This is a
body-read-free discovery primitive: it uses frontmatter and Obsidian's
resolved-link graph, but does not read canonical or wiki note bodies.

Ingestable sources are active, non-template notes with `type` equal to
`resource`, `digest`, `permanent`, or `subnote`.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `mode` | `per-import`, `delta`, `init`, `re-ingest` | Required candidate discovery mode. |
| `source_path` | vault path | Single source note path. Required for `per-import` and `re-ingest` when `source_paths` is omitted; rejected for `delta` and `init`. |
| `source_paths` | JSON array or comma list | Multiple source note paths. Required for `per-import` and `re-ingest` when `source_path` is omitted; rejected for `delta` and `init`. |
| `offset` | number | Zero-based candidate offset (default `0`). |
| `limit` | number or `all` | Maximum candidates to return (default `50`). |
| `format` | `json`, `text` | Default `text` renders the data readably; use `json` when the output is machine-parsed. |

```bash
optsidian para-zk:wiki-ingest-candidates mode=init limit=all
optsidian para-zk:wiki-ingest-candidates mode=delta limit=50
optsidian para-zk:wiki-ingest-candidates mode=per-import source_paths='["PARA/Resources/Source Paper.md","ZK/Permanent/Stable Interfaces.md"]'
optsidian para-zk:wiki-ingest-candidates mode=re-ingest source_path="PARA/Resources/Source Paper.md"
```

JSON output fields:

- `ok`: true on success.
- `command`: `para-zk:wiki-ingest-candidates`.
- `count`, `offset`, `limit`, `returned`, `has_more`: pagination envelope over
  the candidate list.
- `candidates`: array of
  `{ path, type, title, updated, updated_ms, stale_llm_wikis, reason }`.

Reason codes:

- `missing_wiki_citation`: in `init` or `delta`, an ingestable source has no
  incoming citation from an `llm-wiki` note.
- `source_newer_than_wiki`: in `delta`, the source is cited and its current
  `updated` value is newer than the minimum `updated` value of the LLM-Wiki
  pages citing it.
- `per_import`: targeted `per-import` source requested by `source_path` or
  `source_paths`.
- `reingest_requested`: targeted `re-ingest` source requested by `source_path`
  or `source_paths`.

`stale_llm_wikis` is always present. For `source_newer_than_wiki` it lists the older
citing wiki pages as `{ path, title, updated_ms }`; for every other reason it is
an empty array.

### `para-zk:wiki-domains`

Lists the LLM-Wiki domains — the folders directly under the wiki root — as the
entry-point roster for reading the wiki. Each domain's `<domain>/index` hub is the
deterministic per-domain entry point, so the read flow is: narrow to the domain
the conversation is about, run this to confirm it exists, read
`read-llm-wiki title="<domain>/index"`, then follow its body `[[links]]`. This is
frontmatter/path-only discovery; it does not read note bodies.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `offset` | number | Zero-based domain offset (default `0`). |
| `limit` | number or `all` | Maximum domains to return (default `50`). |
| `format` | `json`, `text` | Default `text` renders the data readably; use `json` when the output is machine-parsed. |

```bash
optsidian para-zk:wiki-domains
optsidian para-zk:wiki-domains limit=all
```

JSON output fields:

- `ok`: true on success.
- `command`: `para-zk:wiki-domains`.
- `count`, `offset`, `limit`, `returned`, `has_more`: pagination envelope over the
  domain list.
- `domains`: array of `{ domain, pages, has_index }`, sorted by `domain`. `domain`
  is the name to pass back as `read-llm-wiki title="<domain>/index"`; `pages` is the
  count of concept pages in the domain, **excluding** the `index` hub; `has_index` is
  whether the `<domain>/index` hub exists. When `has_index` is `false`, enumerate
  that domain's pages with `list type=llm-wiki query=<domain>/` instead of reading
  an index.

### `para-zk:setup`

Sets up or syncs the PARA-ZK vault layout, managed templates, dashboards,
guide file, required Obsidian core settings, and selected community plugins.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `locale` | `ko`, `en` | Locale for generated labels and tags. |
| `dryRun` | boolean | Plan without writing. |
| `deps` | `none`, `required`, `enhancements`, `all` | Install and enable a dependency group. Default: `none`. |
| `format` | `json`, `text` | Default `text` renders the data readably; use `json` when the output is machine-parsed. |

Managed scaffolding (templates, dashboards, READMEs) is plugin-owned. Setup
overwrites those files when generated content differs and leaves matching files
alone; user content notes are never touched by setup.

Required dependencies:

- Dataview
- Folder Notes
- Update time on edit
- Custom File Explorer sorting

UX enhancement dependencies:

- Tasks
- Trash Explorer
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
optsidian para-zk:setup deps=required locale=ko
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

### `para-zk:attach-file`

Copies local desktop files or directories into the vault attachment folder. This
is a desktop-only CLI workflow: sources are local paths on the machine running
Obsidian, and the handler reads them through the desktop CLI runtime before
creating vault files.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `source` | local path | One local file or directory. Required unless `sources` supplies at least one path. |
| `sources` | JSON list or comma-list | Additional local file or directory paths. Multiple sources always return a collection result. |
| `folder` | vault-relative path | Target attachment folder. Defaults to `assets`. Rejects `.` and `..` path segments. |
| `name` | filename | Optional destination filename for a single file source only. When omitted, the source filename is used; when supplied without an extension, the source extension is appended. Rejects `.` and `..` path segments. |
| `recursive` | boolean | Directory sources include nested files by default (`true`). Use `false` to copy only files directly inside each directory. |
| `format` | `json`, `text` | Default `text` renders the data readably; use `json` when the output is machine-parsed. |

Directory sources copy files under `<folder>/<directory-name>/`. Nested
directories keep their relative folder names when `recursive=true`. `name` is
invalid for directory sources and for calls with more than one source.

If the destination filename already exists, PARA-ZK keeps the extension and
tries a numeric suffix before it, such as `image 1.png`, until it finds a free
vault path.

Examples:

```bash
optsidian para-zk:attach-file source=/home/me/Pictures/diagram.png folder=assets/research
optsidian para-zk:attach-file sources='["/home/me/Pictures/a.png","/home/me/Pictures/b.png"]'
optsidian para-zk:attach-file source=/home/me/Downloads/papers recursive=false
```

Single-file result fields:

- `source`: original local path.
- `path`: created vault path.
- `name`: created vault filename.
- `kind`: attachment kind (`image`, `video`, `audio`, `pdf`, or `file`).
- `size`: byte length of the copied file.
- `link`: wikilink to the vault file.
- `embed`: embedded wikilink form.

Multi-source or directory result fields:

- `count`: number of files copied.
- `files`: array of the same file objects returned by a single-file attach.

### `para-zk:create-area`

Creates a root folder-style area note.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `title` | string | Required. |
| `open` | boolean | Default `false`. |

Example:

```bash
optsidian para-zk:create-area title="Software" open=false
```

Side effects:

- Creates `PARA/Areas/<title>/<title>.md`.
- Sets `type: area`.
- Sets a localized root area tag.

Root areas have no parent; bare-title area lookups resolve root areas only. Create
or address nested areas with the `*-child` commands.

### `para-zk:create-child`

Creates a child under a project or root area. `relpath` is the ancestor chain
from the root to the immediate parent; omit it to create directly under the root.
`title` is the new child.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `type` | `subnote` or `area` | Required. `type=area` requires `root_type=area`; `type=subnote` allows project or area roots. |
| `root_type` | `project` or `area` | Required directly-addressable root ancestor type. |
| `root_title` | string | Required directly-addressable root ancestor title. |
| `relpath` | JSON list | Optional ancestor chain from root to immediate parent. Empty or omitted means directly under the root. |
| `title` | string | Required child title. Full drill path is `[...relpath, title]`. For `type=subnote`, may be a `subdir/title` path to file the note in a subfolder under the parent; it stays the parent's child by frontmatter. Existing subfoldered subnotes may be addressed by basename when unique or by `subdir/title(.md)` to disambiguate. |
| `subnote_type` | subnote type code | `type=subnote` only. Defaults to `free`. |
| `body` | markdown | `type=subnote` only. Optional initial free-form body content. Accepts `@<absolute-path>`. |
| `inherit_parent_tag` | boolean | `type=area` only. Include the parent area tag too. Default `true`. |
| `open` | boolean | Default `false`. |

Examples:

```bash
optsidian para-zk:create-child \
  type=subnote root_type=project root_title="Model Evaluation" \
  title="Planning Meeting" subnote_type=meeting

optsidian para-zk:create-child \
  type=area root_type=area root_title="AI" \
  relpath='["Generation"]' title="Vision"
```

Side effects:

- `type=subnote` creates the note in the parent folder (or a subfolder of it when
  `title` is a `subdir/title` path), converts a single-note parent into folder-style
  layout if needed, and sets `parent` to the parent note link.
- `type=area` creates a nested folder-style area inside the addressed parent
  area. Nested areas store `type: area` too; the `parent` link is the distinction.

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
optsidian para-zk:read-project title="Model Evaluation"
optsidian para-zk:read-project title="Model Evaluation" key=frontmatter/status
optsidian para-zk:read-project title="Model Evaluation" key=tasks limit=20
optsidian para-zk:read-project title="Model Evaluation" key=tasks checkbox=/ query="blocked"
optsidian para-zk:read-project title="Model Evaluation" key=references ref_kind=url
optsidian para-zk:read-project title="Model Evaluation" key=backlinks type=project limit=20
optsidian para-zk:read-project title="Model Evaluation" key=children
optsidian para-zk:read-child root_type=project root_title="Model Evaluation" title="Planning Meeting" key=body
optsidian para-zk:read-child root_type=area root_title="AI" relpath='["Generation"]' title="Vision" key=overview
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
child, use `para-zk:read-child`/`update-child`/`rename-child`/`delete-child` with
the root ancestor plus `relpath` and `title`. Child entries
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
`para-zk:read-child ... key=backlinks` for paged collection reads and
`para-zk:read-child ... key=backlinks/<i>` for a single item.

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

Reference collection reads use the absolute 0-based list index as the item key
and include the stable stored reference id:

```json
{
  "value": {
    "count": 1,
    "offset": 0,
    "limit": 20,
    "returned": 1,
    "has_more": false,
    "items": {
      "0": {
        "id": "a3k9mp",
        "link": "https://example.com/source",
        "kind": "url",
        "target": "https://example.com/source"
      }
    }
  }
}
```

A legacy id-less reference reads as `"id": null`; it is not citable until
`key=references op=backfill`, a reference insert/edit, or the editor suggester
assigns and persists an id.

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
  `aliases`, `areas`, `start_date`, `due_date`, and `done_date`. `aliases`
  is stored as a single-item list for one canonical value.
- `tasks`: structured project task collection. Item keys are task ids.
  `checkbox` is the literal status character from `[ ]`, `[x]`, `[-]`, `[/]`,
  and other Tasks-compatible statuses.
- `references`: structured frontmatter reference collection. Items expose
  stored stable `id`, stored `link`, derived `kind`, optional `description`,
  and derived `path` or `target` where applicable.
- `backlinks`: read-only inbound resolved-link collection. Items expose the
  source note `link`, `path`, `title`, and `type`; use `type=` to filter by
  source note type.
- `children`: read-only child-note index; read or edit a child with the `*-child`
  commands using `root_type/root_title/relpath/title`.
- `value`: present when `key` is provided.

The same map-path read algorithm is used by the other domain read commands. The
command selects the target note, builds that note type's stable surface map, and
then resolves `key` as a `/`-separated map path.
When selecting by `title`, `read-project`, `read-area`, `read-resource`, and
`read-retro` accept `archived=true` to select the matching note under
`PARA/Archives`.

For `*-resource` commands, `title` may be a Resources-relative slash path.
`title="AI/Foo"` addresses or creates `PARA/Resources/AI/Foo.md`; archived
lookup mirrors it under `PARA/Archives/Resources/AI/Foo.md`. The note basename,
tag slug, tags, and visible title derive from `Foo`, not `AI/Foo`. A bare
`title="Foo"` keeps the existing behavior: flat `PARA/Resources/Foo.md` wins
first, then a unique `Foo.md` anywhere under Resources resolves recursively;
duplicate bare basenames are ambiguous. Resource title paths reject empty
segments and `.`/`..` segments (`/x`, `x/`, `a//b`, `../x`, and `..` are
invalid). `rename-resource` only changes the basename in the current folder;
use the Obsidian/optsidian native `move` or `rename` file operation to move a
resource between folders link-safely.

For `*-llm-wiki` commands, `title` is an LLM-Wiki-relative slash path. Every wiki
page is filed under exactly one domain folder, so **`create-llm-wiki` requires
`title="<domain>/<concept>"`** (exactly one level, e.g. `AI/Diffusion Policy`) and
rejects a bare concept or a deeper path. It creates `LLM-Wiki/<domain>/<concept>.md`;
the visible title and path derive from `<concept>`, and the identity tag classifies by
domain as `llm-wiki/<domain>` (no per-concept leaf). The domain is the page's file-tree home,
not a relationship — cross-domain links live in the body, and folders do not change the
link graph. A concept is a single page across the whole wiki: `create-llm-wiki` is
get-or-create by concept, so re-creating it under a different domain returns the existing
page (no duplicate); re-filing to another domain is a deliberate `move`/`rename`, not a
re-create. `read`/`update`/`rename`/`delete-llm-wiki` accept either the full
`<domain>/<concept>` path or a bare concept (resolved across domains by basename). There
is no archived wiki selector: LLM-Wiki pages are active, LLM-owned derived synthesis under
`LLM-Wiki/`, not canonical PARA/ZK records.

Surface types fall into two groups. `project`, `area`, `journal`, and `retro`
are structured: their load-bearing template sections are stable keys. `resource`,
`llm-wiki`, child `subnote`/fallback `note`, and the ZK kinds
`spark`/`digest`/`permanent` are
free-form: prose is exposed as
one `body` key for the editable Markdown body before any managed tail.
Free-form bodies may contain H1 headings; those headings are content, not extra
stable keys.

| Command | Selector | Top-level keys |
| --- | --- | --- |
| `para-zk:read-area` | `title` | `frontmatter`, `overview`, `tasks`, `references`, `backlinks`, `children` |
| `para-zk:read-resource` | `title`; `/` addresses a Resources-relative path | `frontmatter`, `body`, `references`, `backlinks` |
| `para-zk:read-llm-wiki` | `title`; `/` addresses an LLM-Wiki-relative path | `frontmatter`, `body`, `references`, `backlinks` |
| `para-zk:read-zk` | `title` plus optional `kind` | `frontmatter`, `body`, `references`, `backlinks` |
| `para-zk:read-journal` | `date` | `frontmatter`, `focus`, `quick_memo`, `timeline`, `tasks`, `short_review`, `references`, `backlinks` |
| `para-zk:read-retro` | `title` plus optional `date` | `frontmatter`, `week_progress`, `good`, `improve`, `risks`, `retro_summary`, `backlinks` |

Free-form top-level keys:

```text
resource: frontmatter | body | references | backlinks
llm-wiki: frontmatter | body | references | backlinks
spark: frontmatter | body | references | backlinks
digest: frontmatter | body | references | backlinks
permanent: frontmatter | body | references | backlinks
```

ZK templates still start with example headings such as Summary or Key insights,
but those headings live inside `body`; read and edit them with `key=body`.
Type-specific `frontmatter/<key>` reads and writes remain available where
`para-zk:describe` lists frontmatter keys.

Examples:

```bash
optsidian para-zk:read-area title="AI" key=children
optsidian para-zk:read-child root_type=area root_title="AI" title="Generation" key=children
optsidian para-zk:read-area title="AI" key=backlinks type=project
optsidian para-zk:read-project title="Finished Project" archived=true key=summary
optsidian para-zk:read-resource title="Source Paper" key=body
optsidian para-zk:read-resource title="AI/Source Paper" key=body
optsidian para-zk:read-llm-wiki title="AI/Policy" key=body
optsidian para-zk:read-zk title="Stable Interface Contracts" kind=permanent key=body
optsidian para-zk:read-zk title="Stable Interface Contracts" kind=permanent key=frontmatter/maturity
optsidian para-zk:read-journal date=2026-05-30 key=quick_memo
optsidian para-zk:read-retro title="Retro-General-2026_W22" key=retro_summary
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
| `key` | writable map path | Required. Examples: `frontmatter/status`, `summary`, `body`. Use `para-zk:update-child` for a child; the key is the child's own key. |
| `op` | `set`, `insert`, `append`, `prepend`, `replace`, `delete` | Required update operation. |
| `value` | text | Required for scalar `set`, `append`, and `prepend`. |
| `value_json` | JSON | Structured value for frontmatter updates and task/reference inserts. |
| `match` | text | Required for `replace`. Exact literal text inside the selected key. |
| `with` | text | Replacement text for `replace`. Empty is allowed. |
| `all` | boolean | For `replace`, replace all matches. Without it, multiple matches fail. |

Only `para-zk:update-llm-wiki` additionally accepts `by=<model-id>`. A changed
write stamps `updated_by`; `created_by` and `updated_by` are readable through
`read-llm-wiki` and `describe`, but are not writable keys. Use `by` as the only
mutation path for those fields.

Writable keys are a subset of read keys. A scalar `frontmatter/<key>` supports `op=set`
only and uses Obsidian frontmatter mutation. A multi-value list frontmatter key — shown in a
type's `writeKeys` as `…=set|append|prepend|delete`, e.g. a project's `frontmatter/areas` —
also supports `append`/`prepend` (add one value) and `delete` (remove one), so you can add an
area without restating the whole list; `areas` accepts an area title (resolved to its canonical
link) or an existing `[[link]]`. Section/body keys support `set`, `append`, `prepend`, and
exact literal `replace`.
For free-form resource, llm-wiki, child subnote/note, and ZK prose, use
`key=body`; old starter headings such as `summary`, `memo`, `insight`, or
`limitations` are not writable map keys.
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
not as body lines. Each stored item is an object `{ link, id, description? }`.
`id` is a short random stable token assigned by PARA-ZK, stored once, and never
derived from the title, link, or position. Legacy bare-string or id-less entries
are still read as `id: null`; use `key=references op=backfill` to assign ids
without changing the rest of the registry. The writable collection keys are:

```text
references
references/<i>
references/<i>/link
references/<i>/description
```

Add references through the update commands with
`key=references op=insert value_json='{...}'`.
The reference insert `position` in `value_json` is 0-based: `position: 0`
inserts before the first reference, while omitted `position` appends. This is a
different convention from task insert, where `position` is 1-based.

Backfill hand-authored or legacy id-less references with
`key=references op=backfill`. It takes no `value` or `value_json`, assigns ids
through the same reference write path used by inserts/edits, and returns a
`key=references`-shaped collection value with the now-citable ids; items are
keyed by 0-based index and also include `index`. It is
idempotent: when every reference already has an id, it returns `changed: false`
and the same references without writing. This is the CLI path for making an
`id: null` reference citable; the GUI editor `PZ[` suggester performs the same
intentional assignment automatically when a reference is selected for citation.

Reference insert values accept `link`, optional `description`, and
optional 0-based `position`. Insert returns `index`, `link`, `changed`,
`added`, and the reference's stable `id` — so you can cite it inline as
`` `PZ[<id>]` `` in the same flow without re-reading. If the canonical `link`
already exists, insert is a no-op: requested `position` is ignored and the
existing `index`, `link`, and `id` are returned with `changed: false` and
`added: false` (an id-less match is backfilled with a fresh id so it stays
citable). Wikilinks may include Obsidian display
text, for example `[[Note Path|PMG]]`; the target is resolved to the real vault
file while `PMG` is preserved as the displayed link text.

For child notes, use the same insert shape through `para-zk:update-child` with
`root_type`, `root_title`, optional `relpath`, `title`, `key=references`,
`op=insert`, and `value_json='{"link":"..."}'`.

Update one stored reference field with `key=references/<i>/<field> op=set`.
Writable fields are `link` and `description`. Setting `link` keeps the item
at the same index, preserves `id`, and re-derives `kind`, `path`, and `target`.
Setting `link` to another existing canonical link is rejected as a duplicate
without merging, deleting, or reordering either item. Setting `description` to
`value=""`, or to `value_json=null`, clears that field; the item still
serializes as `{ link, id }`. Delete one item with
`key=references/<i> op=delete`; later indices shift after deletion.

Derived and managed reference fields are read-only. `id`, `kind`, `path`, and
`target` can be read through `key=references/<i>/<field>`, but cannot be updated.

Canonical stored links are vault note/file wikilinks such as `[[path]]`,
`[[path#subpath]]`, or `[[path|alias]]` when Obsidian display text is supplied.
URLs are stored as raw URLs, unresolved wikilinks are stored as normalized
`[[target]]` or `[[target|alias]]`, and plain non-link text remains text.
Markdown text such as `[text](url)` is input syntax only and is dropped;
wikilink display text such as `[[Note|alias]]` is preserved. `description` is
set only when explicitly supplied. `kind`, `path`, and `target` are derived on
read and never stored. The accepted read kinds are `url`, `note`, `file`,
`wiki`, and `text`; `markdown` is not a stored or derived kind.

Hand-authored bare-string `references` entries must use wikilink or URL syntax
when they should behave as links. A frontmatter entry such as
`references: ["folder/note.md"]` is read as `kind: "text"` and does not produce
a backlink. Path-to-wikilink canonicalization runs through
`update ... key=references op=insert`. Assigning an id with
`key=references op=backfill` does not canonicalize text links; it only persists
missing stable ids.

Read-only keys include `children`, `backlinks`, `path`, `title`, `type`, and
`archived`.

Examples:

```bash
optsidian para-zk:update-project title="Model Evaluation" key=frontmatter/status op=set value=done
optsidian para-zk:update-project title="Model Evaluation" key=summary op=replace match="old claim" with="new claim"
optsidian para-zk:update-project title="Model Evaluation" key=tasks op=insert value_json='{"name":"Review evaluation set","due":"2026-06-05","priority":"high"}'
optsidian para-zk:update-project title="Model Evaluation" key=references op=insert value_json='{"link":"https://example.com/paper","description":"Reviewed in May","position":0}'
optsidian para-zk:update-project title="Model Evaluation" key=references op=backfill
optsidian para-zk:update-child root_type=project root_title="Model Evaluation" title="Planning Meeting" key=references op=insert value_json='{"link":"[[Source Paper]]"}'
optsidian para-zk:update-project title="Model Evaluation" key=references/0/description op=set value="Important source paper"
optsidian para-zk:update-project title="Model Evaluation" key=references/0/description op=set value_json=null
optsidian para-zk:update-project title="Model Evaluation" key=references/0 op=delete
optsidian para-zk:update-project title="Model Evaluation" key=tasks/a8f3k2m9/checkbox op=set value=x
optsidian para-zk:update-project title="Model Evaluation" key=tasks/a8f3k2m9 op=delete
optsidian para-zk:update-child root_type=project root_title="Model Evaluation" title="Planning Meeting" key=body op=append value="Decision: ship the baseline."
optsidian para-zk:update-child root_type=area root_title="AI" relpath='["Generation"]' title="Vision" key=overview op=set value=@/tmp/vision.md
optsidian para-zk:update-llm-wiki title="AI/Policy" key=body op=append value=@/tmp/wiki.md
optsidian para-zk:update-llm-wiki title="AI/Policy" key=references op=insert value_json='{"link":"[[PARA/Resources/Source Paper.md]]"}'
optsidian para-zk:update-project title="Model Evaluation" key=frontmatter/status op=set value=archived
```

### Inline citations (`PZ[<id>]`)

Body prose cites the note's own registry references inline with a code span whose
whole content is `` `PZ[<id>]` ``. The `<id>` is the stable `id` returned by
`read ... key=references`; it is not the visible registry position and is not
typed by hand in normal editing. In Obsidian, type a backtick then `PZ[` (the backtick opt-in keeps bare `PZ[`
prose untouched) to open the reference suggester, search by title/alias,
description, or link, and select the reference; the suggester inserts the id and
leaves the cursor just before the `]`. Typing `#` there switches the suggester to
the reference target's headings and blocks, completing a section citation.
If a hand-authored reference reads as `id: null`, run
`update ... key=references op=backfill` first; pure reads never assign ids.
The backticks are required: bare `PZ[<id>]` text does not render as a citation.
For LLM-Wiki pages, cross-link concept pages with body `[[link]]`; `references`
and `` `PZ[<id>]` `` citations are only for canonical source notes outside
LLM-Wiki.

A citation may point at one section of its reference's target with
`` `PZ[<id>#<section>]` `` — a heading (`#Training Loop`) or a block (`#^block-id`).
The section renders as `[n §<section>]` and click/hover navigates to that section.
A reference always resolves to its base note; a section is specified only at the
citation site, never stored on the reference. A section cannot contain a comma
(the multi-cite separator). Sections apply to internal references (note/file/wiki);
they are ignored for url/text references.

At render time, the citation displays the reference's current 0-based registry
position as `[n]`, matching `key=references/<i>`. Use `` `PZ[<id>, <id>]` `` for
several references (comma-separated, each an independent link). It resolves in
reading view and Live Preview; an id that is not present in the note's registry
renders as an unresolved marker. Numeric positional tokens such as `` `PZ[0]` ``
are not supported.

The stored `<id>` is stable across reference reorders; only the rendered `[n]`
follows the reference's current 0-based registry position.

For projects, `key=frontmatter/status op=set value=archived` is a structural
archive operation: it moves the folder-style project from `PARA/Projects` to
`PARA/Archives/Projects`. Updating the archived copy with `archived=true` and a
non-archived status restores it to `PARA/Projects`.

Result fields:

- `path`: the actual file that was updated.
- `key`: the original requested key.
- `operation`: the applied operation.
- `changed`: false when the requested `set` value already matched.
- `matches`: present for `replace`.
- `index`, `link`, and `added`: present for reference insert results; `index`
  and `link` are also present for reference field updates and deletes. Reference
  insert results also include the stable `id` (used to cite the reference with a
  `` `PZ[<id>]` `` backtick code-span).
- `moved`, `fromPath`, and `toPath`: present when a project status update moved
  the project between active and archived folders.

The same update algorithm is used by the other domain update commands:

| Command | Selector | Notes |
| --- | --- | --- |
| `para-zk:update-area` | `title` | Supports root area surface keys. |
| `para-zk:update-resource` | `title`; `/` addresses a Resources-relative path | Uses free-form `body`, `references`, and frontmatter keys. |
| `para-zk:update-llm-wiki` | `title`; `/` addresses an LLM-Wiki-relative path | Uses free-form `body`, `references`, and `frontmatter/aliases`; accepts `by=<model-id>` to stamp `updated_by` on changed writes. No `archived`. |
| `para-zk:update-zk` | `title` plus optional `kind` | Uses free-form `body`, `references`, and type-specific frontmatter keys. |
| `para-zk:update-journal` | `date` | Supports journal surface keys such as `quick_memo` and `tasks`. |
| `para-zk:update-retro` | `title` plus optional `date` | Uses retro writable keys: `frontmatter`, `week_progress`, `good`, `improve`, `risks`, and `retro_summary`; `backlinks` is read-only. |

Use `para-zk:update-child` for child notes:

| Option | Values | Notes |
| --- | --- | --- |
| `root_type` | `project` or `area` | Required directly-addressable root ancestor type. |
| `root_title` | string | Required root ancestor title. |
| `relpath` | JSON list | Optional ancestor chain to the immediate parent. |
| `title` | string | Required child title. Subfoldered subnotes may be addressed by basename when unique or by `subdir/title(.md)`. |
| `key`/`op`/`value`/`value_json`/`match`/`with`/`all` | same as update commands | The `key` is the addressed child's key. |

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
| `para-zk:rename-resource` | `title`; optional `archived`; `/` addresses a Resources-relative path | Renames the resource note file in its current folder. `new_title` must be a bare basename; use native `move`/`rename` to move folders. |
| `para-zk:rename-llm-wiki` | `title`; `/` addresses an LLM-Wiki-relative path | Renames the wiki note's concept in its current domain folder; the `llm-wiki/<domain>` tag is unchanged (it classifies by domain, not concept). `new_title` must be a bare basename; re-file to another domain with native `move`/`rename`. No `archived`. |
| `para-zk:rename-zk` | `title` plus optional `kind` | Renames the selected ZK note file in place. |
| `para-zk:rename-child` | `root_type` + `root_title` + optional `relpath` + `title` | Renames a subnote, fallback note, or nested area. `new_title` renames the addressed child. |

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `title` | string | Current note title. |
| `new_title` | string | Required new note title. Aliases such as `newTitle` are rejected. |
| `archived` | boolean | PARA rename commands only; same title lookup behavior as reads. |
| `kind` | ZK kind code | `rename-zk` only; narrows title lookup. |

`rename-child` uses `root_type`, `root_title`, optional `relpath`, `title`, and
`new_title` instead of the parent command selectors.

Examples:

```bash
optsidian para-zk:rename-project title="Model Evaluation" new_title="Model Evaluation 2026"
optsidian para-zk:rename-area title="AI" new_title="Applied AI"
optsidian para-zk:rename-child root_type=area root_title="AI" relpath='["Generation"]' title="Vision" new_title="Computer Vision"
optsidian para-zk:rename-resource title="Source Paper" new_title="Source Paper Notes"
optsidian para-zk:rename-resource title="AI/Source Paper" new_title="Source Paper Notes"
optsidian para-zk:rename-llm-wiki title="AI/Policy" new_title="Policy Wiki"
optsidian para-zk:rename-zk title="Stable Interface Contracts" kind=permanent new_title="Stable CLI Contracts"
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
| `para-zk:delete-resource` | `title`; optional `archived`; `/` addresses a Resources-relative path | Deletes the resource note and removes matching frontmatter reference items. |
| `para-zk:delete-llm-wiki` | `title`; `/` addresses an LLM-Wiki-relative path | Deletes the wiki note and removes matching frontmatter reference items. No `archived`. |
| `para-zk:delete-zk` | `title` plus optional `kind` | Deletes the selected ZK note and removes matching frontmatter reference items. |
| `para-zk:delete-journal` | `date` | Deletes a daily journal note. |
| `para-zk:delete-retro` | `title` plus optional `date` | Deletes a retro note. |
| `para-zk:delete-child` | `root_type` + `root_title` + optional `relpath` + `title` | Deletes a subnote, fallback note, or nested area. |

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `title` | string | Current note title. |
| `archived` | boolean | PARA delete commands only; same title lookup behavior as reads. |
| `kind` | ZK kind code | `delete-zk` only; narrows title lookup. |
| `date` | `YYYY-MM-DD` | `delete-journal` and `delete-retro` only. |
| `force` | boolean | Required when a folder-style project or area contains child files. |

`delete-child` uses `root_type`, `root_title`, optional `relpath`, `title`, and
optional `force` instead of the parent command selectors.

Examples:

```bash
optsidian para-zk:delete-resource title="Source Paper"
optsidian para-zk:delete-resource title="AI/Source Paper"
optsidian para-zk:delete-llm-wiki title="AI/Policy"
optsidian para-zk:delete-area title="Unused Area"
optsidian para-zk:delete-child root_type=project root_title="Model Evaluation" title="Planning Meeting"
optsidian para-zk:delete-project title="Prototype" force=true
optsidian para-zk:delete-zk title="Draft idea" kind=spark
optsidian para-zk:delete-journal date=2026-05-30
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
| `alias` | string or one-item string list | Optional single short Obsidian alias. Stored as a one-item `aliases` frontmatter list (`aliases:\n  - X`). Rejects more than one value. Canonical create arg is `alias`. |
| `areas` | JSON array or comma list | Store area links in frontmatter. |
| `area_titles` | JSON array or comma list | Reuse or create areas by title, then store links in frontmatter. |
| `status` | project status code | Defaults to `idea`. |
| `priority` | priority code | Defaults to `low`. |
| `open` | boolean | Default `false`. |

Alias naming is intentionally split: project, resource, and ZK create commands
take the singular `alias` input, while reading or updating an existing note uses
`key=frontmatter/aliases` because Obsidian's stored frontmatter key is literally
`aliases`.

Example:

```bash
optsidian para-zk:create-project \
  title="Model Evaluation" \
  area_titles='["AI","Software"]' \
  status=in_progress \
  priority=high \
  open=false
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
`update-* key=references op=insert value_json='{"link":"..."}'` or the
equivalent `update-child` form for child notes.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `title` | string | Required. Use `/` to create under a Resources-relative subdirectory, e.g. `AI/Foo`. |
| `alias` | string or one-item string list | Optional single short Obsidian alias. Stored as a one-item `aliases` frontmatter list (`aliases:\n  - X`). Rejects more than one value. Canonical create arg is `alias`. |
| `source_type` | `project`, `area`, `resource`, `zk` | Optional source note type to link this resource from. |
| `source_title` | string | Optional source note title. |
| `link` | boolean | Defaults to `true` when `source_title` is provided. |
| `url` | string | Optional provenance: where the source came from. |
| `first_author` | string | Optional provenance: the source's first author. |
| `license` | SPDX id | Optional provenance: SPDX identifier (e.g. `MIT`, `CC-BY-4.0`); when no SPDX id fits, a short recognizable token (e.g. `arXiv`). |
| `kind` | `paper` \| `article` \| `book` \| `video` \| `web` \| `code` \| `guide` \| `other` | Optional provenance: locale-neutral source kind code. |
| `domain` | string | Optional subject domain for the identity tag. With a domain the tag is `리소스/<domain>`; omit for a flat `리소스` tag. Reuse an existing domain vocabulary. |
| `body` | markdown | Optional initial free-form body content. |
| `open` | boolean | Default `false`. |

The identity tag classifies (groups) the note rather than naming it: `리소스/<domain>`
when `domain` is given, otherwise the flat `리소스`. The four provenance keys and `aliases` are also editable after creation via
`para-zk:update-resource key=frontmatter/<aliases|url|first_author|license|kind>`
(and surfaced by `para-zk:describe type=resource`); `kind` is validated against
the code list above. `aliases` is stored as a single-item list for one canonical
value. For example:

```bash
optsidian para-zk:update-resource title="Attention" key=frontmatter/kind op=set value=paper
```

Example:

```bash
optsidian para-zk:create-resource \
  title="Source Paper" \
  source_type=project source_title="Model Evaluation" \
  link=true
```

Important fields:

- `sourcePath`
- `linkedFromSource`

### `para-zk:create-llm-wiki`

Creates an LLM-Wiki page under `LLM-Wiki/`. Use this for derived,
LLM-owned synthesis that should be easy for future LLM calls to read and update.
The canonical knowledge remains Resources, PARA, and ZK; wiki pages cite
canonical notes through their own `references` registry and `` `PZ[<id>]` ``
code-span citations. Cross-link wiki concept pages with body `[[link]]`. Do not
write reverse links from canonical notes back into the wiki.

Options:

| Option | Values | Notes |
| --- | --- | --- |
| `title` | `<domain>/<concept>` | Required. Exactly one domain folder, e.g. `AI/Diffusion Policy`. A bare concept or a deeper path is rejected. Get-or-create by concept: reused if it already exists under any domain. |
| `alias` | string or one-item string list | Optional single short Obsidian alias. Stored as a one-item `aliases` frontmatter list. Canonical create arg is `alias`. |
| `body` | markdown | Optional initial free-form body content. Accepts `@<absolute-path>`. |
| `by` | model id | Optional. On a newly created page, stamps `created_by` and `updated_by`. |
| `open` | boolean | Default `false`. |

Creating the first page under a domain also auto-creates an empty
`LLM-Wiki/<domain>/index.md` hub (idempotent — only when absent; later pages find
it). The `index` page is the deterministic per-domain entry point (read it with
`read-llm-wiki title="<domain>/index"`); its body is left empty for the LLM to fill
as the domain's relational map. Because `index` is per-domain (not a global concept),
`create-llm-wiki title="<domain>/index"` resolves it by path within that domain.

The created note stores `type: llm-wiki` and exactly one identity tag
`llm-wiki/<domain>` (domain only — the tag classifies by domain, not concept) plus
vault-managed timestamps/id. `created_by` and
`updated_by` are readable when set through `by`, but not writable directly. It
intentionally has no resource provenance frontmatter (`url`, `first_author`,
`license`, `kind`). The note renders the frontmatter-driven props panel and
managed tail automatically; the managed tail renders Cited-by scoped to the
LLM-Wiki folder, then References. Writable
keys are `body`, `frontmatter/aliases`, and the `references` collection:

```bash
optsidian para-zk:create-llm-wiki title="AI/Policy" body=@/tmp/wiki.md by=claude-opus-4-8 open=false
optsidian para-zk:create-llm-wiki title="Models/Attention" alias="Attention Wiki" by=gpt-5.5
optsidian para-zk:update-llm-wiki title="AI/Policy" key=frontmatter/aliases op=set value="Policy Wiki" by=gpt-5.5
optsidian para-zk:update-llm-wiki title="AI/Policy" key=references op=insert value_json='{"link":"[[PARA/Resources/Source Paper.md]]"}' by=gpt-5.5
optsidian para-zk:read-llm-wiki title="AI/Policy" key=references limit=all
```

`read-llm-wiki`, `update-llm-wiki`, `rename-llm-wiki`, and `delete-llm-wiki`
all use `title`, accept the same slash-path addressing, and do not accept
`archived`.

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
  date=2026-05-29
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
| `alias` | string or one-item string list | Optional single short Obsidian alias. Stored as a one-item `aliases` frontmatter list (`aliases:\n  - X`). Rejects more than one value. Canonical create arg is `alias`. |
| `kind` | ZK kind code | Defaults to `spark`. |
| `maturity` | maturity code | Used for permanent notes. Defaults to `draft`. |
| `body` | markdown | Optional initial free-form body content. |
| `open` | boolean | Default `false`. |

ZK notes (spark/digest/permanent) get no auto identity tag; the created note ships an empty
`tags:` for the human to fill manually.

Example:

```bash
optsidian para-zk:create-zk \
  title="Stable Interface Contracts" \
  kind=permanent \
  maturity=refined
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
  energy=normal
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
  kind=digest
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
  maturity=refined
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
  maturity=evergreen
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
pnpm run smoke:vault -- --vault /path/to/test-vault
```

Use `--clean` only for a disposable vault. It deletes all top-level vault
contents except `.obsidian` and removes the PARA-ZK plugin data file before
running the smoke test.

```bash
pnpm run smoke:vault -- --vault /path/to/test-vault --clean
```

On Linux, the smoke test opens the target vault with `open-gui no-wait` and
uses `xdotool` when available to focus the matching Obsidian vault window before
running native CLI commands. This keeps the test pointed at the disposable vault
even when multiple Obsidian vault windows are open.
