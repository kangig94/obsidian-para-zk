# Changelog

Notable changes for PARA-ZK are tracked here.

## 0.0.3 - In development

### Changed

- Managed-block UI: the four per-type "cited by" Dataview views collapse into one general
  `cited-by` view on every note type except spark — a vault-wide backlink scan that classifies
  each citing note by its `type` (raw `type` shown for unlisted kinds) and renders a
  root-relative, `.md`-stripped path (fixing the `<domain>/index` filename collision where
  multiple index pages all showed as "index"). All managed-block buttons (create subnote/retro/
  subarea, distill/discard, create-from-resource/digest) move from per-view toolbars into
  declarative `para-zk-action` blocks; the legacy bare-token `para-zk-view` key fallback is removed.
- LLM-Wiki authoring surfaces now carry an explicit Obsidian-MathJax rule: the
  `wiki-weaver` agent, the `wiki-capture` skill, and `wiki-ingest`'s insight-fold step
  write formulas as `$…$`/`$$…$$` with literal single backslashes and never inside backtick
  code-spans (backticks are reserved for `PZ[id]` citations and code/identifiers) — a
  backtick-wrapped formula rendered as monospace text instead of math. `wiki-lint` gains a
  broken-math detection finding (backtick-wrapped formulas, `\(...\)`/`\[...\]` delimiters,
  doubled backslashes), reported for a `wiki-ingest` re-ingest or a manual fix.
- `import-resource` now removes dead intra-document page-anchor scaffolding — the empty
  `<span id="page-…">` anchors and the `[text](#page-…)` links that point at them, neither of
  which resolves in Obsidian (the link renders as a dead "not found" link). Anchors are stripped
  and links delinked to their plain visible text; heading-embedded anchors also broke PARA-ZK's
  `#heading` citation matching.
- `para-zk:list` `query` now matches the note's full address path, not just its
  basename, so `query=<subpath>/` scopes a listing to a subfolder — a wiki domain
  (`type=llm-wiki query=AI/`), a Resources folder, or a project's subnotes. Title
  substrings still match (the basename is part of the address), so existing queries
  are unaffected. The wiki read-flow's no-index fallback uses this to enumerate a
  single domain's pages.

## 0.0.2 - 2026-06-19

### Added

- `para-zk:wiki-domains` CLI workflow lists the LLM-Wiki domains (folders directly
  under the wiki root) as the entry-point roster for reading the wiki. Each domain
  reports `{ domain, pages, has_index }` — concept-page count excluding the `index`
  hub, and whether the `<domain>/index` hub exists — sorted by domain. Surfaced
  through `describe.workflows` (no new MCP tool; MCP reaches it as a CLI proxy).
- `para-zk:conventions` gains a `wiki` field guiding the wiki read flow: narrow to
  the conversation's domain, list domains with `wiki-domains`, read
  `<domain>/index` first, follow body `[[links]]`, and fall back to
  `list type=llm-wiki` when a domain has no index.

### Breaking

- Identity tags now classify (group) instead of being per-note slugs. LLM-Wiki pages tag
  `llm-wiki/<domain>` (domain only; the `/<concept>` leaf is dropped — was
  `llm-wiki/<domain>/<concept>`). Resources tag `리소스/<domain>` when `create-resource`
  is given the new optional `domain` flag, else a flat `리소스` (was `리소스/<title-slug>`).
  ZK notes (spark/digest/permanent) get NO auto identity tag — the template ships an empty
  `tags:` for the human to fill. `rename-llm-wiki`/`rename-resource`/`rename-zk` no longer
  mint a per-title identity tag (folder-style project/area renames still re-derive theirs);
  an llm-wiki rename keeps the domain-only tag unchanged. project/area/retro/journal tagging
  is unchanged.
- LLM-Wiki pages are now filed under a one-level domain folder. `create-llm-wiki` requires
  `title="<domain>/<concept>"` (exactly one domain folder, e.g. `AI/Diffusion Policy`) and
  rejects a bare concept or a deeper path; it writes `LLM-Wiki/<domain>/<concept>.md` with the
  identity tag `llm-wiki/<domain>` (domain only). The domain is
  the page's file-tree home, not a relationship — cross-domain links stay in the body and the
  link graph is unchanged. `create-llm-wiki` is get-or-create by concept across the whole wiki:
  re-creating a concept under a different domain returns the existing page (no duplicate);
  re-filing to another domain is a deliberate `move`/`rename`. `read`/`update`/`rename`/`delete`
  still accept either the `<domain>/<concept>` path or a bare concept (resolved by basename), so
  existing flat pages keep resolving until re-filed. The wiki-weaver/wiki-ingest prompts now emit
  `<domain>/<concept>` and reuse an existing domain from the `list type=llm-wiki` roster.
- Create is now get-or-create everywhere. A colliding title returns the existing note
  with `created: false` instead of silently allocating a suffixed duplicate (`Foo 1`).
  Affects every create command (`create-project`/`area`/`resource`/`zk`/`llm-wiki`) and
  their workflows, plus `create-from-resource`/`create-from-digest`/`distill-spark`. An
  existing note is returned untouched — the call's `body`/`alias`/provenance are NOT
  applied (no clobber); to make a distinct note, re-create under an explicit title. This
  removes the prior auto-suffix "unique folder-style container for duplicate titles"
  behavior. (`create-child` and `create-retro` already returned the existing note on
  their natural keys — subnote/nested-area path, and ISO-week + source — and are
  unchanged.)
- Identity-tag slugs are now kebab-case instead of snake_case, matching the common
  Obsidian tag convention: `project/my_project` → `project/my-project`,
  `리소스/some_paper` → `리소스/some-paper`, `llm-wiki/policy_wiki` →
  `llm-wiki/policy-wiki`. `slugify` (used only to build the `<type>/<slug>` tags)
  collapses spaces and underscores to hyphens; the `/` nested-tag separator is kept.
  Affects the `tags:` frontmatter of newly created/renamed notes; existing notes keep
  their old snake_case tags until rewritten (no in-product migration).
- Dropped the `zk_` namespace prefix from ZK stored types: `zk_spark` → `spark`,
  `zk_digest` → `digest`, `zk_permanent` → `permanent`. A note's ZK-ness is carried
  by its folder (like a `resource` isn't typed `para_resource`), and the stored type
  now equals the kind code that `create-zk kind=` / MCP already speak — removing the
  prior `spark`↔`zk_spark` translation. Affects `type=` filters (`list`/`describe`/
  `audit`/MCP `set|replace|add`) and the `type:` frontmatter of generated notes. No
  migration is performed; any note written with a legacy `zk_<kind>` type reads as an
  unknown type until its `type:` is rewritten.
- Inline reference citations now use stable reference ids instead of positional
  indices. The citation token is `` `PZ[<id>]` `` or `` `PZ[<id>, <id>]` ``, where
  ids come from `read key=references` or the editor `PZ[` suggester; numeric
  positional input such as `` `PZ[0]` `` is no longer supported. Existing
  positional `PZ[n]` tokens render as unresolved `[?]`; no automatic migration is
  performed.
- Removed the LLM-Wiki ingest ledger (`LLM-Wiki/log.md`, `ingest_logged`, and
  `wiki-ledger.ts`). LLM-Wiki candidate staleness now derives from page `updated`
  timestamps: uncited sources use `missing_wiki_citation`, sources newer than
  citing wiki pages use `source_newer_than_wiki`, and candidates include
  `stale_llm_wikis` with the older citing wiki pages.
- Removed the redundant `para-zk:add-reference` CLI command. Add references via
  `para-zk:update-* key=references op=insert value_json='{"link":"..."}'`;
  child-note receivers use `para-zk:update-child ... key=references op=insert`.
- Restructured child-note CLI addressing into a dedicated `*-child` family.
  Parent CRUD commands (`read/update/delete/rename-project|area|resource`) now
  address only directly-addressable notes and reject `child=` with a migration
  hint. Child notes (subnotes, fallback notes, and nested areas) use
  `root_type` (`project|area`) + `root_title` + optional `relpath` (ancestor
  chain to the immediate parent) + `title`; for example:
  `para-zk:update-child root_type=area root_title="AI" relpath='["Generation"]' title="Vision" key=overview op=set ...`.
  `para-zk:create-subnote` was removed; use
  `para-zk:create-child type=subnote ...`. `para-zk:create-area` now creates
  root areas only; nested areas use `para-zk:create-child type=area
  root_type=area ...`. The MCP mutation tools keep their `child` parameter for
  LLM ergonomics and route child updates internally to `update-child`.
- `codex-setup` now overwrites existing Codex custom-agent TOML files for the
  generated PARA-ZK agent names by default. `--force` is retained only as a
  compatibility no-op; use `--dry-run` to preview the destructive refresh.

### Added

- New `wiki-capture` skill (`clients/skills/wiki-capture/`): folds a durable synthesis that
  emerged from a query/conversation back into the LLM-Wiki — the query→compound half of the wiki
  (`wiki-ingest` grows it from sources, `wiki-capture` from exploration). It is **propose-confirm**:
  it gates on worthiness (a multi-source comparison/connection or a standard concept the wiki
  lacks — never one-off lookups), searches for the best-fit existing page first, proposes a target
  + shape (update an existing page vs a new page), and writes only on the user's confirmation
  (reads must not write). Placement/granularity reuse `wiki-ingest`'s Plan rules so cohesion does
  not split; new pages get a light hub touch; minting a new domain is deferred to `wiki-ingest`.
  Discovered via `para-zk:conventions`' `compounding` discipline; auto-registered for Claude and
  Codex from `clients/skills/`.
- Subnotes can now be created in a subfolder under their parent: `create-child type=subnote`
  (and the GUI "create subnote" prompt) accepts a `subdir/title` path for `title`, mirroring
  `create-resource`. The subfolder(s) are created and the note is filed there, but it stays the
  parent's child by frontmatter (so the parent's subnote view is unaffected) and is still
  addressed by its basename through the `*-child` commands. A flat title equal to the parent
  still conflicts; a same-basename title inside a subfolder does not.
- Added a `bad_citation_subpath` audit check: a body citation `PZ[<id>#<section>]` whose
  `#section` matches no heading or `^block` id in the cited source (e.g. a paraphrased heading or a
  dropped leading number like `3. `) is reported, so a citation that silently lands at the
  source's top instead of the intended section is caught. Report-only — the intended heading is
  not guessed. The PZ citation-token grammar moved to `src/citation-token.ts`, shared by the GUI
  citation renderers and the audit.
- Added a Codex-only `codex-setup` skill that converts bundled `clients/agents/*.md`
  agent prompts into Codex custom-agent TOML files under `~/.codex/agents/`. This lets
  plugin users install named agents such as `wiki-weaver` without splitting the shared
  `clients/` bundle or duplicating the MCP server.
- Inline citations can now target a section of their reference: `` `PZ[<id>#<heading>]` ``
  (or `#^block-id`) renders as `[n §<heading>]` and click/hover navigates to that section,
  overriding any anchor the reference's own link carries. The section cannot contain a comma
  (the multi-cite separator) and is honored only for internal (note/file/wiki) references.
  The editor citation suggester now triggers only inside a backtick code span (bare `PZ[`
  is left alone), places the cursor before the `]` after picking a reference, and — when the
  user then types `#` — completes the reference target's headings and blocks. This also fixes
  the nested-backtick insertion when a code span was already open. The `para-zk:conventions`
  `citation` field advertises the `PZ[<id>#<section>]` form so automation surfaces know it.
- The HomePage dashboard summary now includes an LLM-Wiki count card (📖), counting pages
  with `type: llm-wiki` under the `LLM-Wiki/` folder — the same identification the rest of
  the plugin uses. Rendered after the PARA/ZK cards; localized label `llmWiki` ("LLM-Wiki").
- `key=references op=insert` now returns the reference's stable `id` in its result, so a
  caller can cite it inline as `` `PZ[<id>]` `` in the same flow without a follow-up
  `read key=references`. A no-op duplicate insert returns the existing reference's id, and
  an id-less match is backfilled with a fresh id so it stays citable.
- Added the `llm-wiki` surface type for LLM-owned derived synthesis under
  `LLM-Wiki/`: native CLI CRUD (`create/read/update/rename/delete-llm-wiki`),
  slash-path title addressing, `body`/`frontmatter/aliases`/`references` editing,
  `llm-wiki/<domain>` identity tags (domain only; unchanged on rename), list/describe/audit
  participation, MCP `type=llm-wiki` mutation mapping, and setup/smoke coverage.
- Added the LLM-Wiki ingest loop: `para-zk:wiki-ingest-candidates` lists active,
  non-template ingestable sources (`resource`, `digest`, `permanent`, `subnote`)
  for `per-import`, `delta`, `init`, and `re-ingest`; `para-zk:audit` now includes
  the `upward_wiki_link` check for reverse links from canonical notes into the
  wiki; and the bundled `wiki-ingest` skill runs **Plan → Fill → Synthesize** — the
  orchestrator reads the candidates' structure + the existing wiki and forms one global
  page plan (page set, domains, granularity, source→page assignments, cross-links,
  spine), then spawns one `wiki-weaver` per planned page in parallel to fill it, then a
  hub pass builds the navigable spine.
- `create-llm-wiki` auto-mints an empty `LLM-Wiki/<domain>/index.md` hub when a domain's first page
  is created (idempotent — only when absent; `index` is resolved per-domain by path, not the global
  concept lookup). The index is the deterministic per-domain entry point an LLM reads for the area
  map (`read-llm-wiki title="<domain>/index"`), filled by the wiki-ingest Synthesize pass as a
  relational map; `para-zk:audit` `orphan_wiki_page` exempts `<domain>/index` (intentional roots).
- `wiki-lint`'s semantic read pass now also assesses **cohesion** — over-fragmentation, duplicate /
  near-synonym pages, near-synonym domains, and `<domain>/index` hub health (empty / weak / a leaf
  unreachable from its hub). Report-only; cohesion remediation routes to a `wiki-ingest` re-plan
  (which decides the page set / domains / hubs globally) rather than piecemeal manual edits, though
  minor fixes (a cross-link, filling an empty hub) can be done directly.
- Added `by=<model-id>` to `create-llm-wiki` and `update-llm-wiki`, stamping
  `created_by`/`updated_by` on create and `updated_by` on changed updates.
- LLM-Wiki pages now use the managed template shape: props plus a managed tail
  rendering wiki-folder-scoped Cited-by and References.
- The custom-sort baseline now orders `LLM-Wiki` right after `ZK` and before
  `Journal` in the file explorer. Existing non-empty `sortspec` bookmark groups are
  still preserved (re-initialize bookmarks to pick up the new order).
- Added the `orphan_wiki_page` audit check (`low`, advisory): flags an `llm-wiki`
  page with no incoming links from other wiki pages (canonical→wiki links do not
  count). It is a hint for an under-woven concept — report-only, never forced, and a
  genuinely standalone topic is fine.
- Added the `wiki_tag_domain_mismatch` audit check (`low`, auto-fixable): flags an
  `llm-wiki` page whose identity tag (`llm-wiki/<domain>`) drifted from its folder
  domain — a re-filed page or a legacy `llm-wiki/<domain>/<concept>` tag. `audit fix=true`
  now applies two repairs vault-wide (id-less reference backfill AND wiki tag-domain
  correction), setting each flagged tag to the page's folder domain; the `fixed[]` item
  is `{ code: "wiki_tag_domain_mismatch", action: "setWikiDomainTag" }`.
- Added a dedicated `para-zk:attach-file` CLI contract section covering local
  source options, single-file and multi-source result fields, unique-name
  collision behavior, directory recursion rules, desktop-local source paths,
  and target `folder`/`name` path guardrails.
- Added a setup managed-file acceptance matrix to the developer guide, covering
  missing, tracked, user-managed, user-modified, folder, `force=true`, and
  `dryRun=true` states. The same guide now records the release submission stance
  for `isDesktopOnly: false`: mobile can load the pure GUI plugin, while CLI
  handlers and Node access are desktop-only and lazy.
- Added GitHub Actions plugin CI for push/PR checks: `npm ci`, lint, tests,
  build, and a committed-artifact drift check.
- Added a tag-triggered release workflow that builds and publishes a draft
  GitHub release with the BRAT assets (`main.js`, `manifest.json`,
  `styles.css`), plus a README BRAT install path. The release tag must equal
  `manifest.json` version exactly (no `v` prefix); the workflow enforces it.
- Home dashboard "create new" panel adds a daily-note (`open-journal`) button.
  Both the dashboard panel and the left ribbon now order the create actions as
  Project, Area, Resource, ZK, Daily note, Quick memo (quick memo appends into a
  section of the daily note, so it follows it).
- Settings panel adds a "Ribbon icons" toggle (`showRibbon`, default on) to show
  or hide the PARA-ZK left-ribbon action icons. Toggling applies live without a
  reload; older saved settings default to showing the ribbon.
- `*-resource` CLI commands now accept a Resources-relative slash path in
  `title`, so `title="AI/Foo"` creates or addresses
  `PARA/Resources/AI/Foo.md` while bare titles keep flat-first then recursive
  basename lookup. Path segments are validated against empty and `.`/`..`
  traversal segments; `rename-resource` keeps renames in the current folder and
  leaves cross-folder moves to native Obsidian/optsidian file moves.
- The props block's `url` field (resource / zk-digest) now renders as a real
  clickable web link instead of a plain text box: a valid `http(s)` URL shows as
  an external link (opens in the browser) with a pencil edit button; clicking it
  swaps to an input that confirms on blur or Enter (Escape discards) and reverts
  to the link. An empty or non-`http(s)` value stays an editable input so it can
  be filled in.
- Added `key=references op=backfill` to explicitly assign stable ids to
  hand-authored or legacy id-less references from the CLI. It takes no value,
  is idempotent, returns the read-shaped reference collection with ids, and
  preserves pure `read key=references` behavior.
- Added a status-bar **editor-width slider** that widens the readable note width globally (sets
  the width variable on `<body>`), with a settings-tab on/off toggle (off removes both the slider
  and the width override, restoring the theme's own widths). Works across themes: vanilla Obsidian
  reads `--file-line-width`, but themes such as **Minimal** ignore it and drive width via
  `--line-width` / `--line-width-wide` and size custom-UI code blocks by their content — so the
  slider maps its value onto all of those (including on `<body>`, where Minimal computes its
  centering margin) and pins the plugin's own block embeds, keeping body text, props/managed
  blocks, and tables aligned and resizing together. Gated by a body class so it is fully inert
  when off.
- Added an editable **alias** (call-name) to project, resource, and ZK permanent notes, rendered
  in the props block's toolbar header (the shell `__lead` slot) so the attribute grid stays
  balanced (project/resource remain 2×3; zk_permanent's existing alias moved out of the grid into
  the header). Backed by Obsidian's native `aliases` frontmatter — a single value stored as a
  one-item list — so `[[alias]]` links, the quick switcher, and search resolve the note by its
  call-name without touching the filename or breaking links. Editable as a single text field in
  the header, and read/writable from automation: `update-project`/`update-resource`/`update-zk`
  accept `key=frontmatter/aliases` (a bare `value=` or a `value_json` list both normalize to the
  same single-item list the GUI writes; more than one value is rejected), `read-*` reads it, and
  `para-zk:describe` advertises it.
- Inline reference citations in note bodies: references now get short random stable ids stored
  in frontmatter, and an inline code span `` `PZ[<id>]` `` renders as a `[n]` link to the
  reference's current 0-based registry position. A comma-separated list
  `` `PZ[<id>, <id>]` `` citing the second and third references renders as
  `[1, 2]` — each id an independent link, spacing normalized to one space after
  each comma (academic `[1, 2]` style). The Obsidian editor has a `PZ[`
  suggester that searches references by title/alias, description, or link and
  inserts the full inline-code citation token `` `PZ[<id>]` ``.
  Works in both reading view (markdown post-processor) and Live Preview (a CM6 editor
  extension), mirroring how the other PZ tokens (`PZ_INPUT[...]`) and the former action
  buttons are written in backticks. In Live Preview the token reveals its raw source for
  editing when the cursor is inside it and renders as the current `[n]` otherwise; source (raw) mode
  leaves it untouched. note/file/wiki references get native Obsidian behavior —
  click to open, hover to preview; URLs open externally; plain-text references render as a
  non-navigable link; a missing id renders as an unresolved marker. The token remains stable
  across reference reorders while the rendered number follows the current registry position.
  The shared reference-link rendering (anchor, hover, open) was extracted
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
- Added always-on discovery safety so a cold automation caller reasons from the right
  premise. Lean `para-zk:describe`, the MCP discovery envelope, the MCP fallback, and the
  MCP `describe` tool description state that saving, translating, summarizing, excerpting,
  or storing full source texts in the private vault is ordinary personal note-taking and
  should not be refused on copyright, licensing, or public-distribution grounds. The fuller
  private-vault orientation now lives in `para-zk:conventions`.
- Added file-backed text args: create commands' `body` option and update
  commands' `value` option accept an `@<absolute-path>` value, which the plugin
  reads from disk instead of taking inline. This is the shell-safe way to pass
  long/multiline markdown (newlines, quotes, `$`, backticks survive). Because the
  plugin performs the read, it works on the native `obsidian` CLI and through
  optsidian alike — no new MCP tool required. Scoped to declared `body`/`value`
  options; short fields like a journal `content` memo stay literal so a leading
  `@` (mentions) is never misread as a path.
- Added per-command help: any native CLI command answers `help=true` (and a
  forwarded `--help`/`-h`) by returning its own option schema — `{ ok,
  description, options }` under `format=json`, or a text listing — instead of
  running and failing on a missing required argument. Works uniformly across
  optsidian, native obsidian, and MCP since it rides the shared `key=value`
  parsing; `para-zk:describe` remains the full machine-readable index.
- Added `para-zk:list` — structured enumeration of notes by `type` with
  `archived`/`query` filters and `offset`/`limit` pagination (content search is
  left to the host CLI's grep/search). Returns `{ title, type, path }` items.
- Added `para-zk:audit` — a deterministic content-health pass for broken links,
  dangling/id-less references, conservative orphan notes, stale unprocessed
  sparks, and stale draft permanent notes. It is report-only by default;
  `fix=true` performs the only automatic repair, vault-wide id-less reference
  backfill, and reports the changed files in `fixed`.
- Made `para-zk:describe` self-contained for LLM discovery: each surface's
  `addressing` facet now includes `createInputs` (the create command's
  arguments, derived from the real command spec — no drift), and the index +
  MCP envelope expose `workflows` (named non-surface commands such as
  `capture-journal`, `distill-spark`, `create-from-*`, `attach-file`, `list`,
  each with its inputs). A caller can now learn the full create/workflow
  contract from `describe` alone, without a separate help lookup.
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
- Added shell-safe MCP edit tools `replace`, `set`, and `add` that
  wrap `para-zk:update-*` through `execFile` (never a shell), so multi-line,
  quoted, and `$`/backtick content edits reach the note verbatim instead of being
  mangled by shell expansion. The tools pass documented update keys through to
  `para-zk:update-*`, including supported `frontmatter/<key>` scalar/list
  writes; structured task insertion/deletion and other non-string mutation
  shapes stay on the CLI.

### Changed

- Split fetch-once usage conventions out of no-type `para-zk:describe` into the new
  `para-zk:conventions` command. No-type `describe` is now lean (`surfaceTypes`,
  `collectionFilters`, `workflows`, a `conventions` pointer, and the always-on `safety`
  line), while `describe type=<t>` remains the per-type contract. The MCP discovery envelope
  mirrors the lean shape with a CLI-specific conventions pointer and no longer duplicates
  the large vault/scope prose; its tool description and fallback keep only the strengthened
  anti-refusal safety sentence.
- Promoted `conventions` to a first-class MCP tool (now five tools, listed first) so a cold
  client calls it once before `describe` or any read/write tool — instead of relying on a
  pointer string an agent may skip. It proxies the host CLI `para-zk:conventions format=json`
  via `execFile` (no shell, no workflow-core import, prose still lives once in the CLI adapter)
  and returns the four `vault`/`scope`/`citation`/`compounding` fields plus the always-on
  `safety` note, falling back to the same `running:false` recovery shape as `describe` when no
  vault is reachable. The former single tool description split into a `conventions` entry
  ("Call FIRST and ONCE") and a demoted `describe` reference entry; both retain the anti-refusal
  clause so it stays always-on regardless of which tool a cold agent reaches first.
- The project/area subnote views now show a `Subfolder` (`하위폴더`) column — each subnote's
  folder relative to the parent note's folder — so subnotes filed under a subdirectory
  (`create-subnote title="Notes/Plan"`) are no longer indistinguishable from same-named
  flat subnotes. Flat subnotes leave the column blank. The list now sorts by `file.path`
  so subnotes group by subfolder instead of interleaving by filename. View-only change:
  the stored managed block is still the compact `para-zk-view` token, so existing vaults
  pick this up on next render with no migration.
- CLI text output (the default format) now renders each command's data — audit findings
  grouped by path, note lists, the read surface, the resulting path, pagination hints —
  instead of echoing a static one-line summary (`vault audited`, `notes listed`). `format=json`
  is unchanged and remains the canonical machine envelope parsed by automation and the MCP
  server; reach for it only when the output is machine-parsed. The audit `check=` option now
  advertises `bare_reference` and its `fix=` description covers bare-reference expansion.
  The bundled skills and the MCP describe-surface guidance (`invoke`/`schema`/`install`
  strings) no longer prescribe `format=json`; the wiki-weaver agent (where MCP/structured
  output is the primary surface) and the MCP server's own internal JSON parsing keep it.
- `para-zk:list` output is leaner (text and `json`): a `project`/`area`/`resource`/`llm-wiki`
  listing states `type` + `root` (e.g. `PARA/Resources`) once and returns `items` as
  root-relative names without `.md` (e.g. `Paper/ASAP`; folder-style notes collapse to `Demo`,
  not `Demo/Demo`) — for those types that name is the `title=` to address the note — dropping
  the redundant per-item basename title and full path. Mixed, `type=zk`, `type=journal`/
  `type=retro`, `type=subnote`, and archived listings keep `{name, type}`; archived listings
  carry top-level `archived: true`.
- The `para-zk-props` block now renders `created`/`updated` as PARA-ZK-formatted
  read-only timestamps instead of raw frontmatter text. `created` shows an absolute
  `YYYY-MM-DD HH:MM` (the ISO `T` and any seconds dropped); `updated` shows a relative
  phrase (`방금` / `N분 전` / `N시간 M분 전` / `N일 전`) with the absolute time on hover,
  falling back to the same absolute format once it is older than 30 days. PARA-ZK formats
  the value itself, so the display is consistent regardless of how Obsidian types the
  property (previously `created` and `updated` could render differently — raw vs.
  normalized — depending on Obsidian's per-property type inference). Computed at render
  time; muted styling; locale-aware (ko/en).
- PARA-ZK no longer writes the `created` timestamp. New notes keep both
  `created:` and `updated:` as empty frontmatter keys, and update-time-on-edit
  owns filling them on create/update in its ISO timestamp format. Setup still
  enables create time and the `created`/`updated` headers, but no longer
  force-sets the plugin `dateFormat`; user/plugin formatting now remains
  authoritative.
- The plugin version is now single-sourced from `package.json`. The build injects
  it into the MCP server bundle (esbuild `__VERSION__`) and propagates it into
  `manifest.json`, `versions.json`, and the Claude Code / Codex plugin manifests,
  so a release edits one file; `src/mcp/server.ts` no longer hardcodes a version
  literal. Replaces the former seven-place manual bump checklist.
- Migrated the toolchain from npm to pnpm (`pnpm@10.20.0`): committed
  `pnpm-lock.yaml`, and switched CI and the release workflow to
  `pnpm install --frozen-lockfile`.
- Obsidian build outputs (`main.js`, `styles.css`, plus a staged `manifest.json`
  copy) now build into a gitignored `build/` folder and ship only as GitHub Release
  assets — the repo no longer commits them. A published release is the only official
  install path (BRAT or release download); local builds are development-only. The MCP
  bundle (`clients/para-zk-mcp.mjs`) stays committed, since the Claude Code / Codex
  marketplace ships `clients/` via git clone with no install-time build.
- Reframed the product positioning as an LLM-maintained PARA + Zettelkasten
  knowledge wiki (README intro and the `para-zk:conventions` `vault` field; the
  MCP keeps only the always-on safety line). Framing only — no `id`, workflow, or
  vault-data change.
- `para-zk-props` now renders vault-managed `created` and `updated`
  frontmatter as display-only wherever those fields are shown. GUI frontmatter
  edits now route through the canonical workflow update functions by note type
  (`updateProject`, `updateArea`, `updateResource`, `updateJournal`,
  `updateRetro`, `updateZk`) instead of writing frontmatter directly; child
  subnotes keep the documented direct-write exception because child updates do
  not yet have a path selector.
- Core workflow read-modify-write mutations now serialize per vault file through
  a shared write serializer. Task shard mutations, reference mutations, and
  section/frontmatter updates no longer interleave when invoked concurrently
  against the same file, such as from parallel CLI calls.
- Removed the invoked `command` field from JSON execution-result envelopes and
  per-command JSON help. Command names remain in the registered command catalog,
  `describe` workflow metadata, and text help headers.
- Update-command write-shape errors now resolve the target key first, then report
  that key's allowed ops and required value argument. `update-* body=...` is
  rejected as the legacy alias for `value=...`, while create commands still accept
  `body=...`.
- Unified the props/tasks/references/view custom UI renderers behind one shared
  `para-zk-block` shell (`src/ux/block-shell.ts`) and renamed their DOM/CSS structure to a
  single BEM-style `para-zk-block` / `--<kind>` / `__<part>` vocabulary — collapsing four
  near-duplicate toolbar/list/heading rulesets into one and dropping dead CSS. Code-block
  language names (and thus stored notes) are unchanged, but custom CSS snippets or themes
  that targeted the old per-block classes (`.para-zk-task-toolbar`, `.para-zk-reference-row`,
  `.para-zk-view-toolbar`, `.para-zk-props-block`, …) must move to the new `para-zk-block__*`
  classes.
- Relabeled the props-block mode buttons to action words — `Edit`/`Read` (ko `편집`/`읽기`)
  instead of `Live Preview`/`Reading view` (ko `실시간 미리보기`/`읽기 화면`). The buttons are
  an edit↔read action pair (pencil/eye icons) that send the note to `source`/`preview` mode,
  not references to Obsidian's rendering-mode brand: `Live Preview` clashed with the adjacent
  `Reading view` (both read as "view") and was inaccurate for users who keep Live Preview off,
  where `source` mode is plain Source. The labels now match the buttons' intent and icons.
- Hid Obsidian's "Edit this block" (`</>`) button on PARA-ZK rendered widgets in Live Preview.
  Obsidian attaches `.edit-block-button` to any code-block widget so the source can be edited,
  but PARA-ZK blocks (`para-zk-props`, `-managed`, `-view`, `-tasks`, `-references`,
  `-latest-retro-summary`, `-dashboard-*`) are plugin-managed and not hand-edited as raw text,
  so the affordance was noise. A single CSS rule scoped by the `cm-lang-para-zk-` language-class
  prefix hides it; other plugins' and normal code blocks' edit buttons are untouched, and
  reading view is unaffected (no such button there).
- Collapsed the `subarea` stored type back into `area`. A nested area is now an ordinary
  `area` that simply has a `parent` (the sole root/nested discriminator), so it renders the
  area template and managed UI, is caught by `type=area` filters/search, and behaves
  identically to a top-level area — fixing that a nested area previously rendered an empty
  managed block and was excluded from area queries. Create one with
  `para-zk:create-child type=area root_type=area root_title=<root>` plus optional `relpath`;
  the `create-subarea` CLI command is removed and the GUI "create subarea" affordance still
  creates an area with the active area as its parent. Name-based addressing is preserved — a
  bare-title area lookup resolves only root areas (gated on an empty `parent`, not a separate
  type), and nested areas are reached via the `*-child` commands. `describe` no longer lists a
  `subarea` surface type.
- `para-zk:describe` is now a more self-sufficient per-surface contract: per-type
  `writeKeys` spell out each mutable key with its op (e.g. `frontmatter/{…}=set`,
  `tasks=insert`, `body=set|append|prepend|replace`) — matching the just-in-time
  update-key error — so keys absent there (notably `created`/`updated`, which the vault
  manages) are visibly not writable; and `addressVia` for `subnote`/`note` names the
  `*-child` route (`root_type/root_title/relpath/title`, with `update-child` for writes).
  The ownership/routing boundary now lives in `para-zk:conventions`' `scope` field.
- Multi-value frontmatter list keys now accept add/remove, not just a whole-list `set`. A
  project's (and retro's) `frontmatter/areas` supports `op=append`/`prepend` (add one value) and
  `op=delete` (remove one), and resolves an area title to its canonical link (an existing
  `[[link]]` is kept as-is) — so adding an area to a project is one call, with no hand-built
  links. Scalar frontmatter keys stay `set`-only and permanent `aliases` stays single-value;
  describe's per-type `writeKeys` advertise the richer ops (`frontmatter/areas=set|append|prepend|delete`).
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
  `date` (journal/retro), or `title`+`kind` (zk). Child notes use the dedicated
  `*-child` commands with `root_type`/`root_title`/`relpath`/`title`;
  transforms/scoped-retro/resource links name their origin with
  `source_type`/`source_title`.
  Removed-path aliases (`path`, `file_path`, `sourcePath`, …) are now rejected
  with a direct error instead of being silently ignored. `attach-file` keeps its
  filesystem `source`/`sources` (external file import, not note addressing).
- Renamed the stored child document type `doc` → **`subnote`** for finder
  correctness. (Child areas were briefly typed `subarea` for the same reason, since
  collapsed back to `area` — see "Collapsed the `subarea` stored type" above.) The
  `children` map is now a read-only index; read/edit a child via the `*-child`
  commands rather than a `children/<title>/<key>` key.
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
- Journal task collections now use the same stable `tasks` key as project and
  area task collections.
- Journal references now use the same stable `references` key and generated
  heading as project, area, resource, and ZK notes.
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
  ordered `{ link, id, description? }` objects, and rendered in notes through
  the native `para-zk-references` block.
- Reference reads now expose a derived, index-addressed collection:
  `references`, `references/<i>`, and `references/<i>/<field>`, with derived
  read-only `id`, `kind`, `path`, and `target` fields.
- Reference updates now use `key=references op=insert` with optional 0-based
  `position`, `references/<i>/{link|description} op=set`, and
  `references/<i> op=delete`. Inserts return `index` and canonical `link`;
  duplicate canonical links are no-op inserts or rejected link updates.
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

- The dashboard summary cards (`para-zk-dashboard-summary`) and task lists (`para-zk-tasks`)
  now live-refresh when the vault changes, so a dashboard open in another tab no longer goes
  stale until reopened. Each block subscribes to the relevant vault/metadata events with a
  120ms debounce (so a burst of edits costs one refresh) — the same pattern the reference,
  retro-summary, and Dataview-view blocks already used. The summary cards refresh only on
  changes under counted roots (PARA / ZK / LLM-Wiki), so unrelated edits — including a task
  toggle writing its shard — don't flicker the cards. The task block ignores edits outside its
  tasks-folder shards / own note and skips refreshing while a checkbox's optimistic-UI reconcile
  is mid-flight, so it never clobbers an in-progress toggle. A task-list refresh keeps the old
  rows visible during its async fetch and swaps them in one synchronous pass, so a block reacting
  to a change made in a sibling block (e.g. toggling a task in the upcoming-7 list updating the
  due-today list) updates without flashing blank.
- Managed template frontmatter no longer makes Obsidian's metadata indexer log "Keys with
  collection values will be stringified" warnings. Whole-value placeholders like
  `status: {{status}}` parsed (unrendered) as a YAML flow-map used as a map key, so every
  `Templates/para-zk/template_*.md` tripped the warning on each index. They are now quoted
  (`status: "{{status}}"`) so the unrendered template is valid YAML; template substitution
  consumes the wrapping quotes, so created notes are byte-identical (values stay unquoted,
  `date`/`week_*` stay date-typed). Re-run `para-zk:setup` to update the template files (no
  `force` needed for unmodified templates).
- Setup now reconciles the custom-sort `sortspec` bookmarks group instead of only
  creating it when absent. The group is PARA-ZK's managed file-explorer order, and the
  baseline grows over time (e.g. `LLM-Wiki` was added after `ZK`); previously a vault
  whose group was built from an older baseline never gained the newer top-level folders,
  so `LLM-Wiki` fell to default sort and `force=true` did not help. Setup now additively
  inserts any missing baseline top-level folder at its baseline position (LLM-Wiki right
  after ZK), preserving the order of entries already present and writing nothing when the
  group is already complete. Matching is group-strict — a same-titled file bookmark no
  longer satisfies a folder entry.
- Realigned stale `smoke:vault` expectations with the current GUI: ribbon
  create-action order (resource before ZK), the subnote template's managed
  block, and the Korean `일일 노트`/`하위노트` labels.
- Corrected the MCP, README, and CLI docs to match the live contracts: MCP
  `replace`/`set`/`add` accept documented write keys including
  `frontmatter/<key>` where the operation is supported; structured task
  insertion/deletion remains CLI-only; retro read/update docs no longer list
  unsupported `tasks` or `references` keys.
- CLI/MCP values are now passed through verbatim: the update `value` and the
  `match`/`with` replacement strings are no longer escape-decoded. Previously a
  `\n`/`\t` was rewritten to a newline/tab, which silently corrupted any content
  containing LaTeX (`\theta`, `\tau`, `\nabla`, `\times`, …) or other literal
  backslash escapes written through `value=@file`. `body` was already verbatim;
  this aligns `value`/`match`/`with` with it. Multiline content uses `@file` or
  real newlines; nothing is escape-interpreted.
- Deleting the last task from a project now permanently deletes the empty
  per-root task shard note instead of leaving an orphaned `# Tasks` scaffold —
  the shard is plugin-owned with nothing to recover, so it is removed outright
  rather than cluttering the trash. Shards with remaining tasks or user-authored
  content (prose or extra headings) are preserved. (Deleting the whole project
  still trashes its shard alongside the project's other content, which is
  recoverable.)
- A nested area's props panel now labels its `parent` field "Parent area" (ko 상위 영역)
  instead of the ambiguous "Area", making clear it shows the containing area. Root areas
  (no parent) hide the field as before.
- A nested area three or more levels deep now inherits the full tag namespace
  (`area/ai/generation/vision`) instead of a flattened one (`area/ai/vision`): the
  inherited namespace is taken from the parent's deepest area tag, not its shallowest.
- `para-zk:setup` now also adds the managed templates subfolder (`Templates/para-zk`)
  to Obsidian's excluded-files (`userIgnoreFilters`). Those filters are not recursive,
  so excluding `Templates/` did not hide the nested managed-templates folder from search
  and link suggestions.
- The references block now re-renders live when the host note's frontmatter
  references change from outside the block — e.g.
  `update-* key=references op=insert` or `create-resource` run from the CLI/MCP,
  or an edit in another view. Previously the list only refreshed when the note
  was closed and reopened. The renderer now
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

- Removed reference-level heading/block anchors. A reference always resolves to its base
  note; which section you mean is expressed only at the citation site with
  `` `PZ[<id>#<section>]` ``. The reference editor's "Section or block" field is gone, and
  navigation no longer honors an anchor stored in a reference link (no legacy/back-compat
  path, no migration — clean up any existing `[[Note#Heading]]` references by hand). This
  removes the dual mechanism where a reference anchor and a citation section could disagree.
- Removed the need for Meta Bind in generated PARA-ZK templates and dashboards.
- Removed DataviewJS-only card rendering for dashboard summary sections.
- Removed the separate `sync-managed-files` GUI command.
- Removed the `ZK/Spark/Archives` layout folder because sparks are
  completed by `processed: true`, not by archive movement.
- Removed body `## References` section-line storage, `ref-*` reference ids, and
  References-section link cleanup. `ref_kind=markdown` is no longer accepted
  because markdown-link syntax is input-only and stored links are canonicalized.
