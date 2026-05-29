# Overmind Mapping

This document maps the read-only Overmind reference vault to the current
PARA-ZK plugin implementation.

Overmind is not a 1:1 copy target. It is the reference for the user's original
intent and manual PARA/ZK behavior. PARA-ZK should preserve that intent while
improving reliability, native integration, automation support, and LLM-facing
CLI ergonomics.

## Status Legend

| Status | Meaning |
| --- | --- |
| `ported` | The behavior exists in PARA-ZK with the same practical side effect. |
| `improved` | PARA-ZK intentionally does more or uses a better native/plugin-owned mechanism. |
| `different` | PARA-ZK intentionally differs from Overmind. The difference is part of the design. |
| `partial` | The main path exists, but a known piece remains. |
| `pending` | Not implemented yet. |

## Reference Rules

- Overmind path: `/home/kang/documents/Overmind`
- Overmind access mode: read-only
- Disposable test vault: usually `/home/kang/documents/para-zk`, but infer the
  exact local path from context when it differs.
- Current source code is authoritative for generated output; stale test-vault
  files are not authoritative.

## Plugin And Dependency Mapping

| Overmind dependency | Overmind role | PARA-ZK handling | Status | Notes |
| --- | --- | --- | --- | --- |
| QuickAdd | Human commands, prompts, capture, template creation, user scripts | Native GUI commands plus LLM-facing native CLI handlers | improved | CLI accepts explicit structured options instead of prompt-only flows. |
| Templater | Template variable expansion and hooks | `src/templates.ts` and `src/workflows.ts` render and post-process managed files | improved | Generated vault no longer requires Templater. |
| Meta Bind | Buttons and inline/frontmatter controls | `PZK[...]`, `PZK_INPUT[...]`, and `para-zk-props` | improved | Native renderers call the same workflow layer as CLI. |
| js-engine | Runs Overmind button scripts | Native TypeScript workflow functions | improved | Scripts are absorbed into plugin code. |
| Commander | Adds QuickAdd choices to the left ribbon and Trash Explorer empty-trash to file explorer | Native PARA-ZK ribbon actions plus native file-explorer empty-trash action | improved | Project, area, resource, ZK, daily note, quick memo, and trash cleanup shortcuts are plugin-owned; unrelated command hiding stays out of scope. |
| Dataview | Lists, tables, dashboards | Required dependency; query blocks remain Dataview/DataviewJS | ported | PARA-ZK configures DataviewJS when needed. |
| Tasks | Task queries | Required dependency; task blocks remain Tasks queries | ported | PARA-ZK does not replace Tasks. |
| Tabs | Split open/done task views | Required dependency; generated area task sections may use Tabs | ported | Kept where it matches Overmind UX. |
| Folder Notes | Folder-style project/area navigation | Required dependency | ported | Needed because projects and areas are folder-style notes. |
| Update time on edit | Maintain `created` and `updated` frontmatter on human edits | Required dependency; `para-zk:init` configures its frontmatter keys and ignored paths | ported | Runtime hash state is preserved when settings are merged; managed generated files are excluded. |
| Trash Explorer | Restore and permanently delete files in `.trash` | Required dependency; PARA-ZK adds a native file-explorer empty-trash button | ported | Replaces Commander's explorer shortcut for `obsidian-trash-explorer:empty-trash`. |
| Custom File Explorer sorting | Stable explorer ordering through bookmark-based sortspec | Required dependency; `para-zk:init` configures Custom Sort and creates a baseline `sortspec` bookmarks group | ported | Existing user-managed `sortspec` bookmark groups are preserved. |
| Homepage | Open `Dashboard/HomePage` on startup or empty workspace | Required dependency; `para-zk:init` configures `Main Homepage` | ported | Keeps the generated Home dashboard as the vault entry point. |
| Obsidian app settings | Link updates, attachment folder, local trash, hidden properties, and ignored generated/reference paths | `para-zk:init` merges `.obsidian/app.json` | ported | Existing unrelated app settings are preserved. |
| Core Templates plugin | Default template folder | `para-zk:init` merges `.obsidian/templates.json` | ported | Sets the folder to `Templates`. |

## QuickAdd Choice Mapping

| Overmind QuickAdd choice | Overmind behavior | PARA-ZK command/workflow | Status | Notes |
| --- | --- | --- | --- | --- |
| `새 프로젝트 만들기` | Create `PARA/Projects/<name>/<name>.md` from `template_project.md` | `para-zk:create-project`; GUI `Create project`; `createProject()` | improved | CLI also accepts `areas`, `area_titles`, `status`, and `priority`; missing `area_titles` are created automatically. |
| `새 영역 만들기` | Create `PARA/Areas/<name>/<name>.md` from `template_area.md` | `para-zk:create-area`; GUI `Create area`; `createArea()` | improved | CLI can set `parent`. |
| `새 회고 만들기` | Create weekly retro under `PARA/Retros/<week>` | `para-zk:create-retro`; GUI `Create retro`; `createRetro()` | improved | CLI can set `file_path`, `name`, and `date`. |
| `새 자료 만들기` | Create resource under `PARA/Resources` | `para-zk:create-resource`; GUI `Create resource`; `createResource()` | improved | CLI can link from a source note in one call. |
| `새 ZK 만들기` | Run `Templates/qa-new-zk.js` to choose ZK type and create note | `para-zk:create-zk`; GUI `Create ZK note`; `createZk()` | improved | CLI accepts `kind` and `maturity`. |
| `일일노트` | Create/open daily journal note from template | GUI `Open daily note`; `openJournal()` | ported | Native command palette action creates or opens today's journal without QuickAdd. |
| `빠른 메모` | Append memo under `# 빠른 메모` | `para-zk:capture-journal`; GUI `Quick memo`; `captureJournal()` | improved | CLI accepts `content`, `date`, `time`, and `energy`. |

## Template Mapping

| Overmind template | PARA-ZK managed template | Status | Major differences |
| --- | --- | --- | --- |
| `Templates/template_project.md` | `Templates/para-zk/template_project.md` | improved | Meta Bind props table replaced by `para-zk-props`; buttons replaced by `PZK[...]`; frontmatter uses stable codes. |
| `Templates/template_area.md` | `Templates/para-zk/template_area.md` | improved | Meta Bind buttons replaced by `PZK[...]`; area props and parent links are written by workflows. |
| `Templates/template_resource.md` | `Templates/para-zk/template_resource.md` | improved | `promote-to-zk.js` replaced by native `promoteResource()`. |
| `Templates/template_journal.md` | `Templates/para-zk/template_journal.md` | improved | QuickAdd capture replaced by `captureJournal()` and native props controls. |
| `Templates/template_retro.md` | `Templates/para-zk/template_retro.md` | improved | Templater date logic replaced by workflow ISO week calculation. |
| `Templates/template_subnote.md` | `Templates/para-zk/template_subnote.md` | improved | Parent and subnote type are written by `createSubnote()`. |
| `Templates/template_zk_fleeting.md` | `Templates/para-zk/template_zk_fleeting.md` | improved | Promotion button uses `PZK[promote-fleeting]`; `processed` is updated by workflow. |
| `Templates/template_zk_literature.md` | `Templates/para-zk/template_zk_literature.md` | improved | Native props controls replace Meta Bind inputs. |
| `Templates/template_zk_permanent.md` | `Templates/para-zk/template_zk_permanent.md` | improved | `maturity` uses `draft/refined/evergreen` stable codes instead of localized/display values. |

## Script Mapping

| Overmind script | Original purpose | PARA-ZK replacement | Status | Notes |
| --- | --- | --- | --- | --- |
| `create-project-subnote.js` | Prompt for child note; ensure folder-style parent; set `parent` frontmatter | `createSubnote()` | ported | CLI accepts `subnote_type`. |
| `create-subarea.js` | Prompt for child area; create folder-style child; inherit tags | `createSubarea()` | ported | CLI controls `inheritParentTag`. |
| `create-resource-and-link.js` | Create resource via QuickAdd and append link to caller references | `createResource()` plus `appendReferenceLink()` | improved | No QuickAdd timing/file-discovery heuristic needed. |
| `create-retro.js` | Build retro context from current project/area and call QuickAdd | `createRetro()` | improved | Date and source are explicit in CLI. |
| `promote-to-zk.js` | Promote resource to Fleeting/Literature/Permanent | `promoteResource()` | improved | Native workflow creates target and inserts backlink. |
| `promote-fleeting.js` | Promote fleeting note, archive source, set processed metadata | `promoteFleeting()` | ported | Traceability is preserved through `archivedPath` and `promoted_to`. |
| `qa-new-zk.js` | Choose ZK type and create note | `createZk()` | improved | CLI accepts `kind` and permanent-note `maturity`. |

## Dashboard Mapping

| Overmind dashboard | PARA-ZK artifact | Status | Notes |
| --- | --- | --- | --- |
| `Dashboard/HomePage.md` | `Dashboard/HomePage.md` | improved | Meta Bind/QuickAdd buttons replaced by `para-zk-dashboard-actions`; summary cards are plugin-owned. |
| `Dashboard/Projects.md` | `Dashboard/Projects.md` | improved | Summary metrics use `para-zk-dashboard-summary`; detailed sections still use Dataview. |
| `Dashboard/Areas.md` | `Dashboard/Areas.md` | improved | Native summary block plus Dataview project/area views. |
| `Dashboard/Resources.md` | `Dashboard/Resources.md` | improved | Native summary block plus Dataview resource queues. |
| `Dashboard/ZK.md` | `Dashboard/ZK.md` | improved | Native summary block plus stale/draft ZK queues. |
| `Dashboard/Tasks.md` | `Dashboard/Tasks.md` | ported | Tasks query sections remain Tasks-owned. |
| `Dashboard/Review.md` | `Dashboard/Review.md` | improved | Native summary block plus review queues. |

## Intentional Differences

| Topic | Overmind | PARA-ZK | Why |
| --- | --- | --- | --- |
| Frontmatter values | Display/localized values such as `0. 아이디어`, `Low`, `Draft` | Locale-neutral codes such as `in_progress`, `high`, `draft` | Stable values are better for CLI, LLMs, migrations, and localization. |
| Button engine | Meta Bind + js-engine scripts | Native Markdown processors and TypeScript workflows | Reduces plugin dependencies and avoids duplicated behavior. |
| Template engine | Templater and QuickAdd expansion | Plugin-rendered managed templates plus workflow post-processing | Initialization and CLI automation become deterministic. |
| GUI vs CLI input | QuickAdd prompts are the main input surface | GUI remains simple; CLI is richer and explicit | CLI is for LLMs and should handle more intent in one call. |
| Dashboard summaries | DataviewJS snippets build cards | `para-zk-dashboard-summary` computes summary cards | Plugin-owned metrics are easier to evolve and test. |

## Known Gaps And Backlog

| Item | Status | Notes |
| --- | --- | --- |
| Automated GUI renderer screenshot checks | pending | Smoke test validates CLI side effects, not visual rendering of Obsidian Markdown processors. |
| Broader regression fixtures | pending | `tools/smoke-test-vault.mjs` is end-to-end smoke coverage; unit-level workflow fixtures could catch smaller changes faster. |

## Verification Status

Current automated coverage lives in `tools/smoke-test-vault.mjs`.

It validates:

- `para-zk:init`
- required dependency results
- native daily journal GUI command
- area/project/resource/subnote/subarea/ZK/journal/retro creation
- resource promotion
- fleeting promotion and archival
- idempotent `para-zk:init dryRun=true`
- key frontmatter and backlink side effects

Run it with:

```bash
npm run smoke:vault -- --vault /path/to/disposable-vault
npm run smoke:vault -- --vault /path/to/disposable-vault --clean
```
