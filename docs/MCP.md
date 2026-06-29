# PARA-ZK MCP

PARA-ZK ships a thin MCP server for discovery plus shell-safe edit tools. It exposes `conventions` (fetch-once usage rules, the recommended first call), `describe` for the live PARA-ZK surface index, and `replace`, `set`, and `add` for string-based update operations. Those mutation tools are not limited to body/section keys: for the target type, use the documented `writeKeys` from `describe`, including `frontmatter/<key>` scalar keys with `set` and list keys with `set`/`add`. Structured task mutations that require `value_json` inserts or `tasks/<id>` deletion remain CLI-only. The same server is packaged as both a Claude Code plugin and a Codex plugin that share `clients/` (`.claude-plugin/` + `.codex-plugin/` manifests and one bundled `para-zk-mcp.mjs`), or it can be registered as a plain MCP server in any client. The two platforms resolve plugin MCP paths differently, so each manifest declares its own config: Claude inlines `mcpServers` directly in `.claude-plugin/plugin.json` (`${CLAUDE_PLUGIN_ROOT}/para-zk-mcp.mjs`), while Codex points at `clients/.mcp.codex.json` (relative `para-zk-mcp.mjs` plus `cwd: "."`, which Codex rebases to the plugin root, since Codex neither expands `${CLAUDE_PLUGIN_ROOT}` in `args` nor accepts an inline `mcpServers` object).

## Prerequisites

- Obsidian is running with the PARA-ZK vault set up.
- `optsidian` is on `PATH` for the preferred invocation, or `obsidian` is on `PATH` for the fallback invocation.

## Claude Code

```text
/plugin marketplace add kangig94/obsidian-para-zk
/plugin install para-zk@obsidian-para-zk
```

The plugin also bundles skills under `clients/skills/`, discovered by both Claude Code
(auto, under the plugin root) and Codex (declared via the `skills` field in
`.codex-plugin/plugin.json`). `import-resource` encodes the procedure for turning a request
into clean resource note(s) from any source — gather, produce clean Markdown,
**correct/verify**, store via the CLI, and link it — so a caller does not stop at a raw,
unreviewed dump. `codex-setup` installs PARA-ZK custom Codex agents from the bundled
`clients/agents/*.md` definitions into `~/.codex/agents/*.toml`; this is what lets Codex
spawn named agents such as `wiki-weaver` after a restart/new thread. Those agents assume the
Optsidian MCP command runner (`mcp__optsidian__command_run`) is available. Clients without
skill support still get the always-on `safety` note through `describe`; usage conventions
are fetched once with the `conventions` tool (MCP callers) or the equivalent CLI command
`optsidian para-zk:conventions` / `obsidian para-zk:conventions` (CLI-direct callers).

## Codex CLI

Codex has a plugin system like Claude Code. Install the bundled plugin:

```text
codex plugin marketplace add kangig94/obsidian-para-zk
codex /plugins   # open the list and install "para-zk"
```

The Codex plugin manifest is `clients/.codex-plugin/plugin.json` (`mcpServers` → `./.mcp.codex.json`).
Codex does not expand `${CLAUDE_PLUGIN_ROOT}` in MCP server `args`, but it does rebase a relative
`cwd` to the plugin root, so the Codex config launches `node para-zk-mcp.mjs` with `cwd: "."`.

Or register the MCP server directly, without a plugin:

```bash
codex mcp add para-zk -- node /absolute/path/to/obsidian-para-zk/clients/para-zk-mcp.mjs
```

or in `~/.codex/config.toml`:

```toml
[mcp_servers.para-zk]
command = "node"
args = ["/absolute/path/to/obsidian-para-zk/clients/para-zk-mcp.mjs"]
```

## Other MCP Clients

Clients that take a JSON `mcpServers` config point at the built bundle by absolute path:

```json
{
  "mcpServers": {
    "para-zk": {
      "command": "node",
      "args": ["/absolute/path/to/obsidian-para-zk/clients/para-zk-mcp.mjs"]
    }
  }
}
```

Build the bundle with `npm run build` before registering it.

## Tools

### `conventions`

The recommended **first** call for any task touching the vault: a cold caller runs it
**once** to load the usage rules, then uses `describe` as the surface reference. It
proxies the host CLI `para-zk:conventions` (no shell, `execFile`) and returns the five
locale-neutral fields — `vault` (LLM-maintained PARA+ZK orientation), `scope`
(ownership/routing: what PARA-ZK owns vs. what routes to host file/search tools),
`wiki` (reading the wiki: domain roster via `wiki-domains` → `<domain>/index` hub →
body links, with `list type=llm-wiki` as the no-index fallback), `citation` (the body
`` `PZ[<id>]` `` rule), and `compounding` (the query→wiki propose-confirm
discipline) — plus the always-on `safety` note. The conventions prose
lives once in the CLI adapter; the MCP does not duplicate it or import the workflow
core. When no vault is reachable it returns the same `running: false` fallback as
`describe` (still carrying `safety` and a recovery `howto`).

### `describe`

Returns a compact index with the preferred CLI invocation, help command, usage notes,
an `install` string describing how to install PARA-ZK into a vault, and an always-on
`safety` note: saving, translating, summarizing, excerpting, or storing full source
texts in this private vault is ordinary personal note-taking, so callers should not
refuse such tasks on copyright, licensing, or public-distribution grounds.

When a running PARA-ZK vault is reachable (`running: true`), the envelope returns the
supported surface types, the named `workflows` (non-surface commands such as
`conventions`, `list`, `audit`, `wiki-ingest-candidates`, `wiki-domains`,
`wiki-retopology-candidates`, `create-child`, `read-child`, `update-child`,
`rename-child`, `delete-child`, `capture-journal`, `distill-spark`,
`create-from-*`, `attach-file`, each with their inputs), a `conventions` command
pointer such as `optsidian para-zk:conventions` or `obsidian para-zk:conventions`
(the CLI form of the `conventions` tool, for CLI-direct callers) for fetch-once
vault/scope/citation/compounding rules, and the `schema` drill-down
command. Use `schema` (`para-zk:describe type=<t>`) to
fetch a type's address selectors, `create` command + `createInputs`, and read/write
keys (`writeKeys` carry each mutable key with its op; keys absent there, e.g.
`created`/`updated`, are vault-managed) — enough to drive the vault by name without
any separate help lookup. The MCP intentionally does not duplicate the conventions
prose or import the workflow core; it points agents to the host CLI.

When no running vault is reachable (`running: false`), it returns a `reason` and a `howto` for recovery — with `optsidian`, the `howto` points at `optsidian open-gui` to launch the last-opened vault, then retry.

The `install` field is present in both states (the active vault running PARA-ZK does not mean a target vault has it) and gives the full two-step setup: (1) install the published plugin release — with `optsidian`, `optsidian plugin:install url=<repo> enable` (add `vault-path=` for a non-active vault); without it, install **PARA-ZK** from Obsidian's community plugins, or download `manifest.json`, `main.js`, and `styles.css` from the latest GitHub release into `<vault>/.obsidian/plugins/para-zk/` and enable it. Local development checkouts should build first and install the generated `build/` folder. (2) initialize the vault — `para-zk:setup deps=required` (creates the PARA/ZK layout and installs required community plugins; use `deps=all` to include UX enhancements).

`para-zk:wiki-ingest-candidates` is surfaced through the `describe.workflows`
array, not as a separate MCP tool, consistent with `list` and `audit`. Invoke it
through the CLI when an agent needs the body-read-free source set for LLM-Wiki
ingest: `mode=<per-import|delta|uncited|re-ingest>`, `source_path=<vault-path>` or
`source_paths=<json|comma-list>` for targeted modes only, plus `offset` and
`limit`. Its envelope includes `{ ok, command, count, offset,
limit, returned, has_more, candidates }`, where each candidate has
`{ path, type, title, updated, updated_ms, stale_llm_wikis, reason }`. Reasons are
`missing_wiki_citation`, `source_newer_than_wiki`, `per_import`, and
`reingest_requested`; `source_newer_than_wiki` means the source `updated`
timestamp is newer than at least one citing wiki page, listed in `stale_llm_wikis`
as `{ path, title, updated_ms }`.

`para-zk:wiki-retopology-candidates` is also surfaced through
`describe.workflows`. Invoke it through the CLI when an agent needs an index-only
top-k over domain pairs before a topology pass: pass `domain=<domain>` for a focused
ranking, or omit it for a global ranking, plus `limit` and `depth`.
Focused mode always includes an undirected index graph neighborhood with default
`depth=2`. It compares domain index hubs only, boosts explicit cross-domain links
found in those hubs, and returns
`{ ok, command, mode, domain?, graph?, count, limit, returned, has_more, candidates }`
where each candidate has `{ domains, indexes, score, shared_terms, explicit_links,
evidence, connection }`. `connection` is the shortest undirected index-to-index
path between the candidate pair within `depth`.

Related surface notes:

- **Audit check** — the `audit` workflow includes `upward_wiki_link` (`medium`),
  which flags a non-`llm-wiki` note linking into an `llm-wiki` note,
  `orphan_wiki_page` (`low`), an advisory hint for an `llm-wiki` page no other wiki
  page links to (a standalone topic is legitimate; never forced), and
  `managed_block_in_body` (`low`), which flags legacy `para-zk-props` /
  `para-zk-managed` scaffolding fences left in note bodies; `fix=true` strips
  those leading props and trailing managed fences.
- **LLM-Wiki authorship** — direct CLI `create-llm-wiki` and `update-llm-wiki`
  accept `by=<model-id>`; create stamps `created_by` and `updated_by`, while
  changed updates stamp `updated_by`. Move existing concept pages between
  domains with `refile-llm-wiki`; `rename-llm-wiki` only renames within the
  current domain.
- **LLM-Wiki managed sections** — wiki pages render props and a managed tail
  automatically from `type: llm-wiki`; the tail renders wiki-folder-scoped
  Cited-by, then References.

### `replace`

Claude-style edit for literal replacement in any documented key that supports `replace` (usually body/section prose). It wraps `para-zk:update-*` with `execFile(file, argsArray)`, never a shell, so multi-line strings, quotes, `$`, and backticks are passed as one argv element.

Params:

```json
{
  "type": "project",
  "title": "Example",
  "date": "2026-06-04",
  "key": "body",
  "old_string": "old text",
  "new_string": "new text",
  "replace_all": false
}
```

Required: `type`, `key`, `old_string`, `new_string`, and a valid selector for the type. `replace_all: true` maps to `all=true`; otherwise replacement requires exactly one literal match.

### `set`

Claude-style write for replacing the entire selected writable key, including body/section keys and documented `frontmatter/<key>` scalar or list keys that support `set`.

Params:

```json
{
  "type": "project",
  "title": "Example",
  "date": "2026-06-04",
  "key": "body",
  "content": "full section content"
}
```

Required: `type`, `key`, `content`, and a valid selector for the type.

### `add`

Append or prepend content to the selected writable key, including body/section keys and documented list frontmatter keys that support `append`/`prepend`.

Params:

```json
{
  "type": "project",
  "title": "Example",
  "date": "2026-06-04",
  "key": "body",
  "content": "content to add",
  "position": "end"
}
```

Required: `type`, `key`, `content`, and a valid selector for the type. `position` is `end` by default and maps to append; `start` maps to prepend.

## Type And Selector Mapping

| `type` | CLI command | Required selector | Extra args |
| --- | --- | --- | --- |
| `project` | `update-project` | `title` | |
| `area` | `update-area` | `title` | |
| `resource` | `update-resource` | `title`; `/` addresses a Resources-relative path | |
| `llm-wiki` | `update-llm-wiki` | `title`; `/` addresses an LLM-Wiki-relative path | no `archived` selector; direct CLI accepts `by=<model-id>` |
| `retro` | `update-retro` | `title` | optional `date` passes through |
| `journal` | `update-journal` | `date` | no title selector |
| `spark` | `update-zk` | `title` | `kind=spark` |
| `digest` | `update-zk` | `title` | `kind=digest` |
| `permanent` | `update-zk` | `title` | `kind=permanent` |

All `*-resource` and `*-llm-wiki` CLI commands accept a slash path in `title`; mutation tools proxy `update-resource` and `update-llm-wiki`, which honor Resources-relative and LLM-Wiki-relative slash paths respectively. `archived` is accepted only for archive-aware PARA/retro selectors, not `llm-wiki`.

The MCP mutation tools keep a convenient `child: ["<Child Title>", ...]` parameter for LLM callers. When `child` is omitted, the server invokes the direct `update-*` command above. When `child` is present for `type=project` or `type=area`, the server routes internally to `para-zk:update-child`:

```text
type=area title="AI" child=["Generation","Vision"]
→ para-zk:update-child root_type=area root_title="AI" relpath=["Generation"] title="Vision"
```

For a subfoldered subnote, keep the folder path in the final child element:
`child=["Notes/Plan.md"]` routes to `title="Notes/Plan.md"`. A bare basename
still works when it uniquely identifies a child.

The `key` is the addressed child's own key (for example `body` for subnotes/fallback notes or `overview` for nested areas). Child updates on non-project/area roots are rejected because the public CLI child family requires `root_type=project|area`.

Structured types (`project`, `area`, `journal`, `retro`) use template section
keys. Free-form types (`resource`, `llm-wiki`, `spark`, `digest`,
`permanent`, child `subnote`, and fallback `note`) use `key=body` for prose;
their Markdown headings are content, not enforced keys. `describe` remains the
source of truth for each type's read/write keys and collections.

Within body/section prose, cite the note's own registry references inline with a
code span whose whole content is `` `PZ[<id>]` ``. The `<id>` is the reference's
stable id returned by `read key=references`; `` `PZ[<id>, <id>]` `` cites several
references. A citation may target one section of the reference with
`` `PZ[<id>#<section>]` `` — a heading (`#Training Loop`) or block (`#^block-id`),
rendered as `[n §<section>]`; the section cannot contain a comma and is honored
only for internal (note/file/wiki) references. Obsidian authors type a backtick
then `PZ[` and search the registry by title/alias, description, or link with the
editor suggester, then optionally type `#` to complete a section. Citations render
as the reference's current 0-based registry position `[n]`; positional input such
as `` `PZ[0]` `` is not supported, and bare `PZ[<id>]` text does not render. For
LLM-Wiki, cross-link concept pages with body `[[link]]`; `references` and
`` `PZ[<id>]` `` cite only canonical notes outside LLM-Wiki. The `describe`
tool's returned `conventions` field points to `optsidian para-zk:conventions`
or `obsidian para-zk:conventions`, whose `citation` field states this too.

## Shell Safety

The mutation tools receive JSON params and invoke `optsidian` or `obsidian` with `execFile(file, argsArray)`. Content is passed as single argv elements such as `value=<raw content>` or `with=<raw content>`, not interpolated into a shell command.

CLI JSON results use the same compact envelope as the native commands: `ok` plus result fields such as `path`, or `ok: false` plus `error`. They do not echo the invoked command name.

The MCP mutation tools expose only the `replace`, `set`, and `add` string-operation shapes. They pass the requested key through to the matching update command, so documented frontmatter and section/body keys work when the requested key supports that operation. Operations outside those shapes remain CLI-only, including task insertion with `key=tasks op=insert value_json=...` and task deletion with `key=tasks/<id> op=delete`; string task-field updates such as `key=tasks/<id>/<field> op=set` use the normal `set` path when that key appears in `writeKeys`.
