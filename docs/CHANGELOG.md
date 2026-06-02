# Changelog

Notable changes for PARA-ZK are tracked here.

## 0.0.1 - In development

### Added

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
  dependency and the removed `PZK[...]` workflow action token path.
- Added `para-zk-latest-retro-summary`, replacing the long project-template
  DataviewJS latest-retro callout with a native renderer.
- Added native PARA-ZK props controls with `para-zk-props` and `PZK_INPUT[...]`,
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

### Changed

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
- Fleeting ZK checklist items are now under the same generated `Tasks` heading
  and `tasks` read key instead of a separate next-actions surface.
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
- Promoting a fleeting note now keeps the source note in `ZK/Fleeting`, marks it
  `processed: true`, and records `promoted_to` instead of moving it to an
  archive folder.
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
- Creating resources and promoting resource/fleeting notes now writes
  frontmatter reference registry entries instead of body reference lines.

### Removed

- Removed the need for Meta Bind in generated PARA-ZK templates and dashboards.
- Removed DataviewJS-only card rendering for dashboard summary sections.
- Removed the separate `sync-managed-files` GUI command.
- Removed the `ZK/Fleeting/Archives` layout folder because fleeting notes are
  completed by `processed: true`, not by archive movement.
- Removed body `## References` section-line storage, `ref-*` reference ids, and
  References-section link cleanup. `ref_kind=markdown` is no longer accepted
  because markdown-link syntax is input-only and stored links are canonicalized.
