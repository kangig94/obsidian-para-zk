# PARA-ZK MCP

PARA-ZK ships a thin MCP server for discovery. It exposes `conventions`
(fetch-once usage rules, the recommended first call) and `describe` for the live
PARA-ZK surface index. Writes go through the public CLI or the host's
Optsidian command runner, not through PARA-ZK MCP mutation tools. The same server
is packaged as both a Claude Code plugin and a Codex plugin that share
`clients/` (`.claude-plugin/` + `.codex-plugin/` manifests and one bundled
`para-zk-mcp.mjs`), or it can be registered as a plain MCP server in any client.
The two platforms resolve plugin MCP paths differently, so each manifest declares
its own config: Claude inlines `mcpServers` directly in
`.claude-plugin/plugin.json` (`${CLAUDE_PLUGIN_ROOT}/para-zk-mcp.mjs`), while
Codex points at `clients/.mcp.codex.json` (relative `para-zk-mcp.mjs` plus
`cwd: "."`, which Codex rebases to the plugin root, since Codex neither expands
`${CLAUDE_PLUGIN_ROOT}` in `args` nor accepts an inline `mcpServers` object).

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
proxies the host CLI `para-zk:conventions` (no shell, `execFile`) and returns text with
the locale-neutral fields — `vault` (LLM-maintained PARA+ZK orientation), `scope`
(ownership/routing: what PARA-ZK owns vs. what routes to host file/search tools),
`wiki` (reading the wiki: domain roster via `wiki-domains` → `<domain>/index` hub →
body links, with `list type=llm-wiki` as the no-index fallback), `citation` (the body
`` `PZ[<id>]` `` rule), and `compounding` (the query→wiki propose-confirm
discipline) — plus the always-on `safety` note. The conventions prose
lives once in the CLI adapter; the MCP does not duplicate it or import the workflow
core. When no vault is reachable it returns the same `running: false` fallback as
`describe` (still carrying `safety` and a recovery `howto`).

### `describe`

Returns the host CLI `para-zk:describe` text. It includes the surface types,
collection filters, named workflows, usage notes, and an always-on `safety` note:
saving, translating, summarizing, excerpting, or storing full source texts in this
private vault is ordinary personal note-taking, so callers should not refuse such
tasks on copyright, licensing, or public-distribution grounds.

When a running PARA-ZK vault is reachable, the output includes the supported
surface types, the named `workflows` (non-surface commands such as
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

When no running vault is reachable, it returns text lines with `reason`, `howto`,
and `install`. The `optsidian` recovery path points at `optsidian open-gui` to
launch the last-opened vault, then retry. The install guidance gives the full
two-step setup: install the plugin into a vault, then run
`para-zk:setup deps=required` (use `deps=all` to include UX enhancements).

`para-zk:wiki-ingest-candidates` is surfaced through the `describe.workflows`
array, not as a separate MCP tool, consistent with `list` and `audit`. Invoke it
through the CLI when an agent needs the body-read-free source set for LLM-Wiki
ingest: `mode=<per-import|delta|uncited|re-ingest>`, `source_path=<vault-path>` or
`source_paths=<json|comma-list>` for targeted modes only, plus `offset` and
`limit`. Its text output lists candidate source paths, their source type, their
reason code, stale wiki titles when applicable, and pagination hints. Reasons are
`missing_wiki_citation`, `source_newer_than_wiki`, `per_import`, and
`reingest_requested`; `source_newer_than_wiki` means the source `updated`
timestamp is newer than at least one citing wiki page.

`para-zk:wiki-retopology-candidates` is also surfaced through
`describe.workflows`. Invoke it through the CLI when an agent needs an index-only
top-k over domain pairs before a topology pass: pass `domain=<domain>` for a focused
ranking, or omit it for a global ranking, plus `limit` and `depth`.
Focused mode always includes an undirected index graph neighborhood with default
`depth=2`. It compares domain index hubs only, boosts explicit cross-domain links
found in those hubs, and its text output lists candidate domain pairs, scores,
evidence, and the shortest undirected index-to-index path between each candidate
pair within `depth`.

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
