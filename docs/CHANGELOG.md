# Changelog

Notable changes for PARA-ZK are tracked here.

## 0.0.1 - In development

### Added

- Inline reference citations in note bodies: an inline code span `` `PZ[n]` `` renders as a
  `[n]` link to the note's n-th registry reference (0-based, matching the CLI's `references/n`).
  A comma-separated list `` `PZ[1, 2]` `` (spaces optional, e.g. `PZ[1,2]`) renders as
  `[1, 2]` — each number an independent link, spacing normalized to one space after each comma
  (academic `[1, 2]` style).
  Works in both reading view (markdown post-processor) and Live Preview (a CM6 editor
  extension), mirroring how the other PZ tokens (`PZ_INPUT[...]`) and the former action
  buttons are written in backticks. In Live Preview the token reveals its raw source for
  editing when the cursor is inside it and renders as `[n]` otherwise; source (raw) mode
  leaves it untouched. note/file/wiki references get native Obsidian behavior —
  click to open, hover to preview; URLs open externally; plain-text references render as a
  non-navigable link; an out-of-range index renders as an unresolved marker. Positional by
  design, so the link's tooltip always shows the resolved target — a reordered registry is
  visible at a glance. The shared reference-link rendering (anchor, hover, open) was extracted
  to `src/ux/reference-link.ts` and reused by both the references block and citations.
- Recorded source provenance in the `resource` frontmatter: `url`, `first_author`,
  `license`, and `kind` (the source's type). They render as editable fields in the resource
  props block (order: created, updated, url, first_author, license, kind) and are seeded
  empty in the generated resource template — so an imported resource carries where it came
  from as structured, queryable frontmatter rather than a free-text section. `kind` is a
  fixed dropdown over a small locale-neutral vocabulary (`paper`, `article`, `book`, `video`,
  `web`, `code`, `guide`, with `other` as the catch-all) so the field stays consistent and filterable;
  extend the list when a kind recurs. (`first_author` Korean label: 제1저자; `kind` reuses the
  existing 종류/Type label.) The four keys are now also writable from automation, not just the
  GUI: `create-resource` accepts `url`/`first_author`/`license`/`kind` options, `update-resource`
  accepts `key=frontmatter/<those>`, and `para-zk:describe type=resource` advertises them — so a
  cold LLM (e.g. the import-resource skill) learns the contract from help/describe. `kind` is
  validated against its code vocabulary; `license` is free text guided toward SPDX identifiers
  (short token like `arXiv` when no SPDX id fits).
- Bundled an `import-resource` skill in the Claude Code and Codex plugins
  (`clients/skills/import-resource/`; Claude auto-discovers it, Codex declares it via the
  `skills` field in `.codex-plugin/plugin.json`). It encodes a general procedure for turning a request
  into clean resource note(s) from any source — a local file, a web page, open web research,
  or synthesis — and any transform (verbatim import, translation, research/compilation,
  multi-note breakdowns): gather the material, produce tidy Markdown, run a
  correction/verification pass (the step LLMs tend to skip, leaving raw artifacts), store via
  `create-resource body=@file`, embed figures (web images by URL, local images attached),
  and link it. Complements `describe` (which
  advertises the unit commands).
- Added a setting to show/hide the file-explorer empty-trash button
  (`showEmptyTrashAction`, on by default), toggled live from the PARA-ZK settings tab.
- Added a `vault` context field to discovery so a cold automation caller reasons from
  the right premise. `para-zk:describe` and the MCP envelope (both `running` states)
  now state that the vault is one user's private, local, single-user Obsidian "second
  brain" — never published or shared — so saving source material (notes, excerpts, or
  full texts the user is studying) is personal-use storage, not redistribution. The MCP
  `describe` tool description carries a short form of the same. Prevents reflexive
  refusals to store content on public-distribution grounds.
- Added file-backed `body`: create commands' `body` option accepts an
  `@<absolute-path>` value, which the plugin reads from disk instead of taking
  inline. This is the shell-safe way to pass long/multiline markdown (newlines,
  quotes, `$`, backticks survive). Because the plugin performs the read, it works on
  the native `obsidian` CLI and through optsidian alike — no new MCP tool required.
  Scoped to `body` only; short fields like a journal `content` memo stay literal so
  a leading `@` (mentions) is never misread as a path.
- Added per-command help: any native CLI command answers `help=true` (and a
  forwarded `--help`/`-h`) by returning its own option schema — `{ ok, command,
  description, options }` under `format=json`, or a text listing — instead of
  running and failing on a missing required argument. Works uniformly across
  optsidian, native obsidian, and MCP since it rides the shared `key=value`
  parsing; `para-zk:describe` remains the full machine-readable index.
- Added `para-zk:list` — structured enumeration of notes by `type` with
  `archived`/`query` filters and `offset`/`limit` pagination (content search is
  left to the host CLI's grep/search). Returns `{ title, type, path }` items.
- Made `para-zk:describe` self-contained for LLM discovery: each surface's
  `addressing` facet now includes `createInputs` (the create command's
  arguments, derived from the real command spec — no drift), and the index +
  MCP envelope expose `workflows` (named non-surface commands such as
  `add-reference`, `capture-journal`, `distill-spark`, `create-from-*`,
  `attach-file`, `list`, each with its inputs). A caller can now learn the full
  create/workflow contract from `describe` alone, without a separate help lookup.
- Added native Obsidian commands and native CLI handlers for PARA/ZK workflows:
  vault setup, project/area/resource creation, subnotes, retros, ZK notes,
  journal capture, and note promotion.
- Added idempotent vault setup for PARA, ZK, Journal, Dashboard, Templates,
  and managed PARA-ZK template files.
- Added dependency checks for Dataview, Tasks, Folder notes, Update time
  on edit, Trash Explorer, Custom File Explorer sorting, and Homepage during
  setup. `installDeps=true` installs and enables missing dependencies,
  DataviewJS is enabled when Dataview is present, Update time on edit is configured
  for `created`/`updated` frontmatter, Custom File Explorer sorting is configured
  with a baseline `sortspec` bookmarks group, and Homepage opens the generated
  Home dashboard on startup and when the workspace is empty.
- Added a native file-explorer empty-trash action that calls Trash Explorer,
  replacing the Commander-managed explorer shortcut.
- Added Obsidian core configuration to vault setup, including automatic
  link updates, the `assets` attachment folder, local Obsidian trash, ignored
  generated/reference paths, hidden document properties, and the core Templates folder.
- Added locale-neutral workflow arguments for CLI automation while keeping localized
  labels in the Obsidian GUI.
- Added native PARA-ZK view toolbar actions, replacing the prior Meta Bind button
  dependency and the removed inline workflow action-token path.
- Added `para-zk-managed`, collapsing generated template UI tails into one
  compact block while preserving native task, reference, and Dataview renderers.
- Added `para-zk-latest-retro-summary`, replacing the long project-template
  DataviewJS latest-retro callout with a native renderer.
- Added native PARA-ZK props controls with `para-zk-props` and `PZ_INPUT[...]`,
  replacing Meta Bind input controls while writing frontmatter directly.
- Added native PARA-ZK ribbon actions for project, area, resource, ZK, daily
  note, and quick memo workflows, replacing Commander-managed QuickAdd shortcuts.
- Added an `add-reference` workflow/CLI command for adding existing vault files,
  wikilinks, markdown links, URLs, or text references to a note's frontmatter
  reference registry.
- Added `para-zk:read-project`, `read-area`, `read-resource`, `read-zk`,
  `read-journal`, and `read-retro` for reading editable surfaces by stable map
  keys such as `frontmatter/status`, `children`, and
  `children/<child note title>/body`.
- Added `para-zk:update-project`, `update-area`, `update-resource`, `update-zk`,
  `update-journal`, and `update-retro` for scoped template-safe updates using
  the same stable map keys as read commands.
- Added `para-zk:rename-project`, `rename-area`, `rename-resource`, and
  `rename-zk` for explicit domain-safe title/path changes.
- Added `para-zk:delete-project`, `delete-area`, `delete-resource`,
  `delete-zk`, `delete-journal`, and `delete-retro` for domain-safe trash
  deletion using Obsidian core APIs without depending on Trash Explorer.
- Added `archived=true` lookup for PARA read commands so projects, areas,
  resources, and retros can be read from `PARA/Archives` without using exact
  paths.
- Added native Home dashboard action rendering with `para-zk-dashboard-actions`.
- Added native dashboard summary card rendering with `para-zk-dashboard-summary`.
- Added a first-read project intent document for LLM agents and contributors.
- Added LLM-facing CLI contract documentation and disposable-vault smoke test tooling.
- Added `area_titles` support to project creation so CLI automation can reuse or create area notes by title.
- Added a native daily journal GUI command that creates or opens today's journal
  without requiring QuickAdd.
- Added a Vitest unit suite (`npm run test`) covering pure helper modules and the
  workflow/CLI logic through an in-memory Obsidian mock, so most behavior is
  verified without a running Obsidian.
- Added the read-only `key=backlinks` collection to PARA, ZK, journal, retro,
  document, and fallback note reads. It returns Obsidian-resolved inbound links
  with paging, `query=`, and source note `type=` filtering.
- Added `para-zk-view` blocks that render managed Dataview sections from a terse
  view key, keeping the Markdown token-efficient while the rendered output
  matches an inline Dataview block.
- Added `para-zk:describe`, a self-description command for LLMs: with no type it
  returns a compact index of surface types and collection filters; `type=<surface>`
  returns that surface's stable read/write keys and filters.
- Added a thin MCP server (`para-zk`) packaged as both a Claude Code plugin and a
  Codex plugin — they share `clients/` and one bundled `para-zk-mcp.mjs`, with
  each manifest declaring MCP its own way (Claude inlines `mcpServers` in
  `.claude-plugin/plugin.json`; Codex points `.codex-plugin/plugin.json` at
  `clients/.mcp.codex.json` with a relative `cwd` it rebases to the plugin root) —
  so any MCP client can discover the vault and drive it through the native CLI.
  Install in Claude with `/plugin marketplace add kangig94/obsidian-para-zk` then
  `/plugin install para-zk@obsidian-para-zk`, or in Codex with
  `codex plugin marketplace add kangig94/obsidian-para-zk`; the `describe` tool
  returns the live CLI contract.
- Added shell-safe MCP section-mutation tools `replace`, `set`, and `add` that
  wrap `para-zk:update-*` through `execFile` (never a shell), so multi-line,
  quoted, and `$`/backtick content edits reach the note verbatim instead of being
  mangled by shell expansion. Frontmatter and task mutations stay on the CLI.

### Changed

- `para-zk:describe` is now a more self-sufficient contract so a cold caller learns the
  boundaries up front instead of by trial-and-error: the top-level output carries a `scope`
  note (PARA-ZK owns typed PARA/ZK operations; raw file edits, free-form frontmatter, and
  full-text search route to the host — optsidian); per-type `writeKeys` now spell out each
  mutable key with its op (e.g. `frontmatter/{…}=set`, `tasks=insert`, `body=set|append|prepend|replace`)
  — matching the just-in-time update-key error — so keys absent there (notably `created`/`updated`,
  which the vault manages) are visibly not writable; and `addressVia` for `subnote`/`subarea`/`note`
  now names the parent route (`read-`/`update-`/`delete-project|area` with `child=["title"]`,
  since there is no `update-subnote`). The MCP discovery envelope carries the same `scope`.
- Workflow result envelopes now report `kind` as a locale-neutral code (`spark`/`digest`/
  `permanent`) instead of the internal display form (`Spark`/`Digest`/`Permanent`), so the
  CLI/MCP output speaks the same vocabulary as the `kind=` input. Affects `create-zk`,
  `create-from-resource`, `create-from-digest`, and `distill-spark`.
- The permanent note's `aliases` props field (Obsidian-native) now stores its value as a
  single-item YAML list instead of a bare string, the form Obsidian resolves for
  `[[ ]]`/quick-switcher/mentions. The control stays a single text input (one alias by
  intent); clearing it writes an empty list. Implemented as a new `text-list` props control.
- Normalized frontmatter key order across every managed template to a fixed prefix
  `type → tags → created → updated → <domain fields>`, with the template's domain keys
  following the props block's reading order (top-to-bottom, left-to-right). Previously
  some templates led with domain fields and trailed `created`/`updated` (`zk_digest`,
  `zk_permanent`, `subnote`, `project`, `journal`, `retro`) while others already led with
  the audit block (`area`, `resource`, `zk_spark`) — now all agree. `resource`/`zk_digest`
  share one canonical provenance order (`sourceTitle → url → first_author → published →
  license → kind`, each type rendering its subset). `project`'s two-column props layout
  (left = a choose-one field, right = a date) is preserved, and `created`/`updated` stay
  hidden in the `project`/`journal`/`retro` props (those notes surface more relevant time
  fields). Frontmatter key order is cosmetic (YAML is unordered) — no behavior change.
- Renamed the ZK literature kind from `source` to **`digest`** everywhere: the stored
  type `zk_digest`, the kind code (`kind=digest`), the folder (`ZK/Digest`), the
  `create-from-digest` command, the GUI/props/dashboard labels, and the managed
  "Created from this" view key (`digest-cited-by`). Unified its frontmatter on a single
  `first_author` (replacing `authors`, matching `resource`); `sourceTitle`/`published`/`url`
  are unchanged. No migration is performed — the plugin is pre-release, so existing vaults
  should re-run `para-zk:setup`.
- Dropped the redundant `raw` prefix from `para-zk:*` CLI invocations. optsidian
  delegates `para-zk:*` to Obsidian regardless, so `optsidian para-zk:<command>` is the
  canonical form; `raw` only matters for forcing Obsidian's version of a command declared
  by both CLIs, which no `para-zk:*` command is. Updated the `describe`/MCP advertised
  `invoke`/`schema` strings, the MCP execution argv (`buildUpdateArgs`, describe spawn),
  the `import-resource` skill, and the docs/CLI examples.
- The MCP `describe` `install` field now spells out the vault **init** step
  (`para-zk:setup installDeps=true`, which installs the required community
  plugins) after plugin install — previously it only covered installing the
  plugin, leaving a caller without the finish-setup step.
- Made the CLI/MCP surface fully **name-based** — no command exposes a vault
  file `path` anymore. Notes are addressed by `title` (project/area/resource),
  `date` (journal/retro), or `title`+`kind` (zk). Existing children are reached
  through their container with a single list-valued `child=["a","b"]` drill;
  new children name their parent with `parent_type`+`parent_title` (+ optional
  `child=` to nest at any depth); transforms/scoped-retro/resource links name
  their origin with `source_type`/`source_title`; `add-reference` addresses the
  receiving note by `type`+`title` and its target by `[[Title]]` wikilink.
  Removed-path aliases (`path`, `file_path`, `sourcePath`, …) are now rejected
  with a direct error instead of being silently ignored. `attach-file` keeps its
  filesystem `source`/`sources` (external file import, not note addressing).
- Renamed stored child types for finder correctness: child documents
  `doc` → **`subnote`**, child areas `type: area` → **`subarea`** (so the area
  finder resolves only root areas). The `children` map is now a read-only index;
  read/edit a child via `child=` rather than a `children/<title>/<key>` key.
- `describe` now reports an `addressing` facet per type (`addressable`,
  `selectors`, `addressVia`, `create` command, `rename`) so an LLM can learn how
  to reach and create each type before acting. `delete-journal` dropped its
  no-op `force` option.
- Trimmed the live smoke harness to scenarios that need Obsidian's real engine
  (link rewriting, backlink resolution, live renderers); pure workflow logic
  (CRUD, template shapes, references incl. subpath dedupe, promotion, attach,
  reference cleanup on delete) is now covered only by the Vitest unit suite.
- Reworked the ZK model around its original Zettelkasten intent. Renamed the
  three kinds to **spark** (`zk_spark`, transient capture), **digest**
  (`zk_digest`, your own-words digest of an external source), and **permanent**
  (`zk_permanent`, your atomic connected idea — the common, primary output).
  Split the old single "promote" path into two operations: **distill**
  (`distill-spark`, spark → permanent, consuming) and **create**
  (`create-from-digest` from a digest, `create-from-resource` for digest/permanent).
  ZK creation now uses single-direction links (the new note references its origin;
  the origin surfaces it via a derived backlink view — a "Created from this" list
  on spark/digest/resource, "Cited by" on permanent) and no longer writes reverse
  body links or `promoted_to` frontmatter. Sparks no longer get auto-inserted task
  items; a kept spark records what it became via `distilled_to`.
- Full (no-key) reads now summarize prose sections as `{ chars: N }` (mirroring
  collections' `{ count: N }`) instead of inlining full section text, so a
  compact read stays bounded for long-form notes; full text is read with
  `key=<section>`. The `available_keys` and `omits_empty` fields were dropped —
  the per-type key set comes from `para-zk:describe`.
- Renamed the vault setup action to `para-zk:setup` (GUI command "Set up
  PARA-ZK vault" / "PARA-ZK vault 구성", settings button "Set up" / "구성").
  It both creates the vault layout and re-applies the current settings — e.g.
  a locale change — to managed files, so the previous "Initialize" / "초기화"
  name no longer fit. Managed files PARA-ZK owns that the user has not edited
  now regenerate to match the current settings without `force=true`; files the
  user modified still require it.
- The disposable-vault smoke test now wipes the vault contents and
  re-initializes from scratch by default (including the custom-sort
  sortspec), so every run verifies a clean setup; pass `--no-clean` to
  run against the vault's current contents.
- Trimmed the disposable-vault smoke test to live-only checks (dependency
  install/config, GUI labels, Homepage runtime, rename link rewriting, backlink
  resolution, and the live reference/task-block renderers); CRUD, references,
  tasks, archive, rename, delete, and argument validation now run in the Vitest
  unit suite instead.
- Added Open Tab Settings (`open-tab-settings`) to the required community plugin
  dependencies so PARA-ZK navigation opens notes with consistent
  open-in-new-tab / no-duplicate-tab behavior; `installDeps=true` installs,
  enables, and configures it, including focused explicitly-created new tabs.
- Added Remember cursor position (`remember-cursor-position`) to the required
  community plugin dependencies so frequent movement across dashboards, root
  notes, and child notes restores note cursor and scroll position; `installDeps=true`
  installs and enables it (options are not forced).
- `unknown read key` and `unknown update key` CLI errors now list the valid keys for
  the selected note type (read errors list readable keys; update errors list writable
  keys with their supported operations), so callers can self-correct without docs.
- Read and update command `key` option descriptions are now derived from each note
  type's surface, so per-command help lists that type's actual keys instead of a
  generic project-flavored hint. ZK key help is listed per kind.
- Dashboard action panels now use the same responsive grid rhythm, spacing, radius,
  and shadow scale as dashboard summary cards.
- Dashboard summary metrics are now calculated by PARA-ZK instead of DataviewJS card
  snippets.
- Generated templates store workflow state as stable code values such as
  `status: in_progress`, `priority: high`, and `maturity: draft`; GUI controls render
  localized labels from those codes.
- Task collection reads now return structured task items with literal checkbox
  status characters, names, and parsed Tasks metadata instead of returning raw
  Markdown task sections.
- Task registry writes now use the Tasks plugin's default Emoji format for task
  ids and metadata.
- Task blocks now render a compact toolbar with task counts, add, order, status,
  due, and priority controls.
- Props controls, prompt controls, dashboard buttons, inline workflow buttons,
  and task controls now use Obsidian native UI components where applicable.
- Full read responses now omit static schema keys, `archived: false`, null
  frontmatter values, empty sections, and template-only scaffold content to
  reduce LLM token waste.
- Full read responses now mark compact mode and summarize large task/reference
  collections with `count`; exact collection root reads return paged `items`
  with `offset`, `limit`, `returned`, and `has_more`.
- Journal and retro task collections now use the same stable `tasks` key as
  project and area task collections.
- Journal and retro references now use the same stable `references` key and
  generated heading as project, area, resource, and ZK notes.
- CLI compatibility aliases such as `name`, `type`, `areaTitles`,
  `subnoteType`, `text`, and `memo` are now rejected in favor of one canonical
  argument name per concept.
- The Home dashboard is now designed as native PARA-ZK UI instead of mirroring
  legacy callout and Meta Bind implementations.
- The disposable-vault smoke test now focuses the target Obsidian vault window
  with `xdotool` when multiple vault windows are open.
- Vault setup and managed-file regeneration now share the same GUI
  command; the GUI command opens an options modal, and command args such as
  `force=true` select the sync behavior when passed by automation.
- The default locale is now English when no locale is configured or supplied;
  Korean output is still available with `locale=ko`.
- GUI locale changes now refresh command palette and ribbon labels in place so
  the selected language is visible immediately without moving ribbon icons.
- Native PARA-ZK ribbon actions now keep a stable order below Obsidian's default
  ribbon actions even after plugin reloads.
- Vault setup now writes managed dashboard files before dependency
  runtime activation, so Homepage can open `Dashboard/HomePage.md` immediately
  after a clean init.
- The disposable-vault smoke test now validates GUI command labels, ribbon
  labels, and ribbon ordering across English and Korean locale changes.
- Distilling a spark creates a Permanent note and marks the source spark
  `processed: true`, keeping it in `ZK/Spark` for manual discard (a spark may
  yield several permanents). The permanent does not link back to the spark.
- Updating a project's `frontmatter/status` to `archived` now moves the project
  into `PARA/Archives/Projects`; updating the archived copy to a non-archived
  status restores it to the active Projects folder.
- Delete workflows now preserve body backlinks, report incoming links, and only
  clean PARA-ZK-owned frontmatter relationships and frontmatter reference
  registry entries.
- Project and area rename workflows now cascade to default source-scoped retro
  files, keeping `Retro-Project-*` and `Retro-Area-*` filenames aligned with the
  renamed source without adding a standalone retro rename command.
- Task updates now use the same structured collection shape exposed by reads:
  `value_json` task inserts, `tasks/<id>/<field>` scalar updates, and
  `tasks/<id> op=delete`; raw Markdown task-line updates are rejected.
- Tasks now live in PARA-ZK's managed `Tasks/current` and `Tasks/archives`
  registries and are rendered into root notes with `para-zk-tasks` blocks,
  keeping root note bodies compact while preserving stable task ids for CLI
  reads and updates.
- Generated root ids are now plain UUIDs without PARA-ZK-specific prefixes;
  root notes store the id in `id`.
- Generated task ids are now 8-character lower-case base36 tokens with a
  vault-wide collision check before writing.
- Task registry files now omit duplicated root frontmatter; each shard is only
  `# Tasks` plus task lines.
- References are now stored in each note's frontmatter `references` array as
  ordered canonical links or `{ link, description? }` objects, and rendered in
  notes through the native `para-zk-references` block.
- Reference reads now expose a derived, index-addressed collection:
  `references`, `references/<i>`, and `references/<i>/<field>`, with derived
  read-only `kind`, `path`, and `target` fields.
- Reference updates now use `key=references op=insert` with optional 0-based
  `position`, `references/<i>/{link|description} op=set`, and
  `references/<i> op=delete`. Inserts and `add-reference` return `index` and
  canonical `link`; duplicate canonical links are no-op inserts or rejected link
  updates.
- Reference duplicate detection now resolves links to their vault target instead of
  comparing link text, so a stored link still dedupes after Obsidian's rename
  auto-update normalizes it to a different textual form (distinct Obsidian subpaths
  stay distinct; URLs and unresolved links fall back to normalized text).
- Reference free text is now a single optional `description` field. Input
  wikilink aliases and markdown link text are dropped during canonicalization;
  the rendered title is always the target filename or URL.
- Creating resources and creating ZK notes from resources/sources now write
  frontmatter reference registry entries instead of body reference lines.

### Fixed

- `para-zk:setup` now also adds the managed templates subfolder (`Templates/para-zk`)
  to Obsidian's excluded-files (`userIgnoreFilters`). Those filters are not recursive,
  so excluding `Templates/` did not hide the nested managed-templates folder from search
  and link suggestions.
- The references block now re-renders live when the host note's frontmatter
  references change from outside the block — e.g. `add-reference` or
  `create-resource` run from the CLI/MCP, or an edit in another view. Previously
  the list only refreshed when the note was closed and reopened. The renderer now
  subscribes to vault modify/delete/rename events for its host note, matching the
  retro-summary and Dataview renderers.
- The props panel (`para-zk-props`) now re-renders live when the host note's frontmatter
  changes from outside the block — e.g. `update-resource` from the CLI/MCP, Obsidian's own
  properties editor, or sync. Previously the rendered controls kept the stale value until the
  note was closed and reopened (switching source/reading mode reuses Obsidian's cached render).
  Because the panel reads the metadata cache, the renderer subscribes to `metadataCache`
  "changed" for its host note — that fires once the new frontmatter is reparsed, so the
  re-read sees the new value.
- Made the plugin bundle mobile-load-safe: the desktop-only CLI adapter
  (`src/cli/`) now loads Node modules (`node:fs/promises`, `node:path`) lazily inside
  its handlers instead of importing them at the top level. The eager top-level imports
  (used by `attach-file` and file-backed `body`) previously put `require("node:fs")`
  into `main.js`, which could stop the plugin from loading on Obsidian mobile
  (iPad/Android) despite `isDesktopOnly: false`. `main.js` now carries no eager Node
  `require`. On desktop the modules load via Electron's `window.require` (a plain
  dynamic `import()` is rejected by the Electron renderer); a dynamic import is used
  only off-Electron (the Node test runner).
- `para-zk:list` no longer returns managed template files: notes under the templates
  folders are excluded even though the templates carry a `type` frontmatter.
- The file-explorer "empty trash" action now reports failure instead of silently
  doing nothing: it respects Obsidian's `executeCommandById` result and shows a Notice
  when the Trash Explorer command is unavailable or did not run.
- Fixed the empty-trash button going dead ("dangling") after a plugin reload. The button
  is injected into the core file-explorer DOM, which outlives the plugin instance;
  `registerDomEvent` removed its click listener on unload but not the element, so the
  orphaned button blocked a fresh listener from being attached on reload. The action now
  clears orphaned buttons on load and removes its buttons on unload.

### Removed

- Removed the need for Meta Bind in generated PARA-ZK templates and dashboards.
- Removed DataviewJS-only card rendering for dashboard summary sections.
- Removed the separate `sync-managed-files` GUI command.
- Removed the `ZK/Spark/Archives` layout folder because sparks are
  completed by `processed: true`, not by archive movement.
- Removed body `## References` section-line storage, `ref-*` reference ids, and
  References-section link cleanup. `ref_kind=markdown` is no longer accepted
  because markdown-link syntax is input-only and stored links are canonicalized.
