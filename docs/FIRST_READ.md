# First Read: PARA-ZK Project Intent

This is the first context an LLM or contributor should read before changing this
repository. It covers the product intent, the test vaults, the GUI/CLI design
contract, and the architecture. The exhaustive CLI reference lives in
[CLI.md](CLI.md); this document is the *why* behind it.

## Purpose

PARA-ZK is a native Obsidian plugin that turns a hand-built PARA and Zettelkasten
vault setup into repeatable, plugin-owned workflows. It owns the vault layout,
generated templates, dashboards, workflow commands, view toolbars, frontmatter
controls, dependency configuration, and the native CLI surface.

The goal is not only a nicer Obsidian for a person. It is to let an LLM create and
maintain knowledge-work structures in the vault — create a project, attach it to
areas, add child notes, create resources, capture journal memos, create ZK notes,
create ZK notes from resources/sources, distill sparks into permanents, and maintain
LLM-Wiki synthesis pages — and keep the resulting frontmatter and backlinks coherent.

LLM-Wiki is a derived layer, not a second canonical knowledge base. Canonical
knowledge lives in Resources, PARA, and ZK notes that a person may curate. Wiki
pages live under `LLM-Wiki/`, are LLM-owned and regenerable, and are optimized as
LLM-for-LLM summaries: concise pages that future automation can read before
working. The link direction is single-way: wiki pages cite canonical notes through
their `references` registry and `` `PZ[<id>]` `` code-span citations, while
wiki-to-wiki concept links use body `[[link]]`; canonical notes should not link
back to the wiki or depend on it.

Phase 2 adds an LLM-owned ingest loop for that derived layer. The `wiki-ingest`
skill is the sole orchestrator: it resolves `mode`, calls
`para-zk:wiki-ingest-candidates`, gathers a bounded neighborhood of candidates,
then runs **Plan → Fill → Synthesize** — the orchestrator itself reads the
candidates' structure (heads) and the existing wiki and forms one global page
plan (page set, domains, source→page assignments, cross-links, and the spine);
one `para-zk:wiki-weaver` per planned page fills it in parallel; a final hub pass
builds the navigable spine. Planning the page set globally first — in the
conversation-aware orchestrator, rather than letting per-source weavers each
invent pages — is what keeps the wiki cohesive.
The `wiki-weaver` is the direct writer: it uses `create-llm-wiki` and
`update-llm-wiki key=references op=insert` to write wiki pages and cite sources
with `` `PZ[<id>]` ``; it never edits source notes and never asks the user.
`import-resource` calls `wiki-ingest mode=per-import` at completion. The
single-direction rule stays intact. The page-body re-weave is the freshness
event: re-integrating a source updates the wiki page body and bumps the page
`updated` timestamp. References are inserted to obtain stable ids for
`` `PZ[<id>]` `` code-span citations, and `by=<model-id>` stamps
`created_by`/`updated_by`.

The vault is a single user's private, local Obsidian "second brain" — local-first and
personal by design, not a shared, published, or collaborative medium like Notion. A
cold automation caller can misread it as web/public content and over-refuse (e.g.,
declining to save a paper the user is studying on "redistribution" grounds). To prevent
that, the MCP tool description/fallback and lean `describe` carry an always-on `safety`
line: saving, translating, summarizing, excerpting, or storing full source texts here is
ordinary personal note-taking, so callers should not refuse on copyright, licensing, or
public-distribution grounds. The fuller orientation and usage rules are fetched once per
task with `para-zk:conventions`; `describe` stays the lightweight surface reference.

## Test Vaults

- The disposable test vault is for destructive testing: it may be cleared, rebuilt,
  and filled with smoke-test notes. Prefer `$PARA_ZK_TEST_VAULT`; otherwise infer it
  from local context (a vault with `.obsidian` and a `para-zk` plugin install). Do
  not treat its current contents as a specification — older generated files may not
  match the current source.
- This repository is the implementation source of truth. Judge generated vault
  output against current source code, not against stale test-vault artifacts.

## GUI And CLI Contract

GUI and CLI share the same canonical workflow logic but not the same input surface.

- **GUI** commands are for people inside Obsidian: direct, pleasant, low-friction. A
  command may ask only for a title or a simple choice, infer context from the active
  file, and open the created note.
- **CLI** handlers are for LLMs and automation: richer than the GUI, accepting
  explicit paths, dates, status/priority/maturity codes, subnote types, links, and
  flags so an LLM can satisfy a request in one call. Output is token-efficient JSON
  with stable fields (`ok`, `path`, `created`, `archived`, `warnings`, `error`).

"GUI and CLI behave the same" means they call the same core workflow functions and
produce the same vault side effects — not that the CLI copies GUI prompts.

Each CLI concept has one canonical argument name; reject legacy/camelCase aliases
with a direct error rather than accepting multiple spellings. CLI option values are
locale-neutral codes (`status: in_progress`, `priority: high`, `maturity: draft`);
localized labels are rendered in the GUI and generated Markdown.

Read and update commands expose PARA-ZK editable surfaces, not raw Markdown.
Structured types (`project`, `area`, `journal`, `retro`) use load-bearing
template sections as stable keys such as `summary` or `quick_memo`; section reads
include lower-level subheadings inside that section, such as a Decision-1
subsection, and section writes use a split guard so an inserted heading cannot
accidentally create a sibling section.
Directly-addressable notes use their own selectors (`title`, `date`, `kind`).
Child notes — subnotes, fallback notes, and nested areas — use the dedicated
`create/read/update/rename/delete-child` CLI family with `root_type`,
`root_title`, optional `relpath` (ancestor chain to the immediate parent), and
`title` (the child). Parent CRUD commands do not accept `child=`.
Free-form types (`resource`, `llm-wiki`, child `subnote`, fallback `note`, and
the ZK kinds `spark`/`digest`/`permanent`) expose
prose as one `body` key for the whole editable Markdown body before the managed
tail. Literal `set`, `append`, `prepend`, and `replace` edits target that body;
H1 headings are allowed there, and there are no enforced prose-section keys.
`llm-wiki` is LLM-owned but still managed: its template includes props and a
compact tail rendering Cited-by scoped to `LLM-Wiki/`, then References.
Raw file reads, arbitrary patches, and generic vault search are Optsidian's
responsibility, not PARA-ZK's. Structural changes stay domain-specific
(`rename-*`, status-driven archive/restore, core-trash deletes) rather than
generic move/edit commands.

The exact key semantics, compact-read payload shape, task/reference structural
rules, and per-type `key=` roots are specified in [CLI.md](CLI.md) and surfaced live
by `para-zk:describe`.

## Architecture

Core behavior belongs in `src/workflows/` (the canonical workflow layer). GUI commands, inline buttons, dashboard
action blocks, and native CLI handlers call this workflow layer instead of
duplicating business logic.

- `src/workflows/` — canonical PARA/ZK operations and vault side effects (create, read, update, rename, delete, promote, references, backlinks, tasks, describe).
- `src/templates.ts` — managed templates, vault guide, dashboard artifacts.
- `src/cli/handlers.ts` — LLM-friendly native CLI adapter over workflows.
- `src/ux/workflow-commands.ts` — human-friendly Obsidian command adapter.
- `src/ux/managed-sections.ts` — `para-zk-managed` wrapper for template UI tails.
- `src/ux/dataview-views.ts` — native `para-zk-view` wrappers + toolbar actions.
- `src/ux/latest-retro-summary.ts` — project latest-retro summary widget.
- `src/ux/workflow-buttons.ts` — shared GUI workflow button creation.
- `src/ux/props-controls.ts` — native `para-zk-props` frontmatter controls.
- `src/ux/dashboard-actions.ts` / `dashboard-summary.ts` — Home dashboard blocks.
- `src/runtime/setup.ts` — idempotent vault setup and managed file writes.
- `src/runtime/dependencies/index.ts` — community-plugin dependency handling.
- `src/vault/` — Obsidian file/frontmatter/section/path primitives the workflow layer builds on. See `docs/ARCHITECTURE.md` for the full six-layer model.

The architecture lint rejects content-blank modules (`utils.ts`, `shared/`,
non-`index.ts` re-exports) and enforces layer boundaries: keep core
workflow/template modules independent from CLI, UX, and runtime adapters.

## Behavioral Expectations

`para-zk:setup` is idempotent. It creates the PARA/ZK layout, managed templates
under `Templates/para-zk`, dashboards under `Dashboard`, the derived
`LLM-Wiki/` folder, and a root vault guide.
Existing non-managed files are skipped; managed files update only when safe or with
`force=true`.

Generated templates do not depend on Meta Bind, QuickAdd, or Templater. Native
plugin blocks replace those mechanisms:

- `para-zk-managed` — generated template UI tails in one compact block.
- `para-zk-view` — relationship Dataview queries with matching workflow buttons.
- `para-zk-latest-retro-summary` — project-summary widget (replaces a DataviewJS callout).
- `para-zk-props` / `PZ_INPUT[...]` — frontmatter input controls (replace Meta Bind).
- `para-zk-dashboard-actions` / `para-zk-dashboard-summary` — Home dashboard blocks.
- `para-zk-tasks` / `para-zk-references` — render the managed task registry and
  frontmatter-backed references inside root notes.
- `` `PZ[<id>]` `` / `` `PZ[<id>, <id>]` `` — inline body citation (code span): the
  id is the stable reference id from `read key=references` or the editor `PZ[` suggester
  (search by title/alias, description, or link). It renders as the reference's current
  0-based registry position `[n]`; citing the second and third references renders
  as `[1, 2]`, in both reading view and Live Preview. The stored `<id>` is stable
  across reference reorders; only the rendered `[n]` follows the current position.
  The token must be a backtick inline code span; bare `PZ[<id>]` text does not
  render. Positional input such as `` `PZ[0]` `` is not supported. In LLM-Wiki,
  use body `[[link]]` for wiki-to-wiki concept links; use `references` plus
  `` `PZ[<id>]` `` only for canonical sources outside LLM-Wiki.

Required community plugins, configured during setup: Dataview (query engine, with
DataviewJS enabled for dashboards), Tasks (status/metadata syntax), Folder Notes
(folder-style project/area notes), Update time on edit (`created`/`updated`
frontmatter), Trash Explorer (review/empty `.trash`), Custom File Explorer sorting
(stable explorer order), Homepage (open the Home dashboard), Open Tab Settings
(consistent open-in-new-tab behavior), and Remember cursor position.

Folder-style notes are part of the workflow: projects and areas are folders
containing their main note, and children link back through frontmatter so Dataview
can discover them.

ZK creation uses single-direction links (the new note references its origin; the
origin surfaces it via backlinks / its *Cited by* view — no reverse link is stored):

- **Create from resource** (`create-from-resource`) makes a Digest or Permanent note
  that references the resource; the resource is preserved and left unchanged.
- **Create permanent from digest** (`create-from-digest`) makes a Permanent note that
  references the digest; the digest is preserved.
- **Distill spark** (`distill-spark`) moves a spark's idea into a new Permanent note,
  marks the spark `processed: true`, and leaves it for manual discard (a spark may yield
  several permanents). The permanent does not link back to the ephemeral spark.
- Sparks have no archive folder; completed work is `processed: true`.

## Verification

For local validation, use the disposable test vault:

```bash
export PARA_ZK_TEST_VAULT=/path/to/para-zk-test-vault
OBSIDIAN_PLUGIN_DIR="$PARA_ZK_TEST_VAULT/.obsidian/plugins/para-zk" npm run build
optsidian open-gui vault-path="$PARA_ZK_TEST_VAULT"
optsidian raw plugin:reload id=para-zk
optsidian para-zk:setup installDeps=true
```

For a clean run, preserve `.obsidian`, clear the rest of the vault, and remove
`$PARA_ZK_TEST_VAULT/.obsidian/plugins/para-zk/data.json` before `para-zk:setup`.
The automated smoke test wraps the same flow:

```bash
npm run smoke:vault -- --vault "$PARA_ZK_TEST_VAULT"
```

The representative CLI command checklist lives in [CLI.md](CLI.md#smoke-test). The
smoke runs in one locale (English by default); pass `--locale ko` to validate
Korean output: `npm run smoke:vault -- --locale ko`.
Always run `npm run lint` and `npm run build` before considering a change complete.

## Development Rules

- Use the disposable `para-zk` vault for destructive and initialization testing; its
  contents are not authoritative.
- Prefer extending existing workflow functions and adapters over parallel logic. If
  GUI and CLI drift, move shared behavior down into `src/workflows/` and keep each
  adapter focused on input/output shape.
- Update the changelog for notable behavior, workflow, CLI, template,
  dashboard, or dependency changes.
