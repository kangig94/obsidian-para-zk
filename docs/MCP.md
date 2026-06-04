# PARA-ZK MCP

PARA-ZK ships a thin MCP server for discovery plus shell-safe section edits. It exposes `describe` for the live PARA-ZK surface index, and `replace`, `set`, and `add` for section body mutations. Frontmatter and task mutations stay CLI-only. The same server is packaged as both a Claude Code plugin and a Codex plugin that share `clients/` (`.claude-plugin/` + `.codex-plugin/` manifests and one bundled `para-zk-mcp.mjs`), or it can be registered as a plain MCP server in any client. The two platforms resolve plugin MCP paths differently, so each manifest declares its own config: Claude inlines `mcpServers` directly in `.claude-plugin/plugin.json` (`${CLAUDE_PLUGIN_ROOT}/para-zk-mcp.mjs`), while Codex points at `clients/.mcp.codex.json` (relative `para-zk-mcp.mjs` plus `cwd: "."`, which Codex rebases to the plugin root, since Codex neither expands `${CLAUDE_PLUGIN_ROOT}` in `args` nor accepts an inline `mcpServers` object).

## Prerequisites

- Obsidian is running with the PARA-ZK vault set up.
- `optsidian` is on `PATH` for the preferred invocation, or `obsidian` is on `PATH` for the fallback invocation.

## Claude Code

```text
/plugin marketplace add kangig94/obsidian-para-zk
/plugin install para-zk@obsidian-para-zk
```

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

### `describe`

Returns a compact live index with the preferred CLI invocation, supported surface types, schema drill-down command, help command, and usage notes. Use `schema` from the result to fetch per-type read/write keys.

### `replace`

Claude-style edit for literal section replacement. It wraps `para-zk:update-*` with `execFile(file, argsArray)`, never a shell, so multi-line strings, quotes, `$`, and backticks are passed as one argv element.

Params:

```json
{
  "type": "project",
  "title": "Example",
  "path": "Projects/Example.md",
  "date": "2026-06-04",
  "key": "body",
  "old_string": "old text",
  "new_string": "new text",
  "replace_all": false
}
```

Required: `type`, `key`, `old_string`, `new_string`, and a valid selector for the type. `replace_all: true` maps to `all=true`; otherwise replacement requires exactly one literal match.

### `set`

Claude-style write for replacing the entire selected section.

Params:

```json
{
  "type": "project",
  "title": "Example",
  "path": "Projects/Example.md",
  "date": "2026-06-04",
  "key": "body",
  "content": "full section content"
}
```

Required: `type`, `key`, `content`, and a valid selector for the type.

### `add`

Append or prepend content to the selected section.

Params:

```json
{
  "type": "project",
  "title": "Example",
  "path": "Projects/Example.md",
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
| `project` | `update-project` | `title` or `path` | |
| `area` | `update-area` | `title` or `path` | |
| `resource` | `update-resource` | `title` or `path` | |
| `retro` | `update-retro` | `title` or `path` | optional `date` passes through |
| `journal` | `update-journal` | `date` or `path` | no title selector |
| `zk_fleeting` | `update-zk` | `title` or `path` | `kind=fleeting` |
| `zk_literature` | `update-zk` | `title` or `path` | `kind=literature` |
| `zk_permanent` | `update-zk` | `title` or `path` | `kind=permanent` |

Child doc/note sections are edited through their parent note by passing the child key, for example `children/<Child Title>/body`.

## Shell Safety

The mutation tools receive JSON params and invoke `optsidian` or `obsidian` with `execFile(file, argsArray)`. Content is passed as single argv elements such as `value=<raw content>` or `with=<raw content>`, not interpolated into a shell command.

Only section edits are exposed through MCP mutation tools. Frontmatter updates, task insertion/deletion, and other mutation commands remain available through the CLI returned by `describe`.
