# PARA-ZK MCP

PARA-ZK ships a thin MCP server for discovery plus shell-safe body/section edits. It exposes `describe` for the live PARA-ZK surface index, and `replace`, `set`, and `add` for body/section mutations. Frontmatter and task mutations stay CLI-only. The same server is packaged as both a Claude Code plugin and a Codex plugin that share `clients/` (`.claude-plugin/` + `.codex-plugin/` manifests and one bundled `para-zk-mcp.mjs`), or it can be registered as a plain MCP server in any client. The two platforms resolve plugin MCP paths differently, so each manifest declares its own config: Claude inlines `mcpServers` directly in `.claude-plugin/plugin.json` (`${CLAUDE_PLUGIN_ROOT}/para-zk-mcp.mjs`), while Codex points at `clients/.mcp.codex.json` (relative `para-zk-mcp.mjs` plus `cwd: "."`, which Codex rebases to the plugin root, since Codex neither expands `${CLAUDE_PLUGIN_ROOT}` in `args` nor accepts an inline `mcpServers` object).

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

Returns a compact index with the preferred CLI invocation, help command, usage notes, and an `install` string describing how to install PARA-ZK into a vault. When a running PARA-ZK vault is reachable (`running: true`), it also returns the supported surface types and the `schema` drill-down command; use `schema` to fetch per-type read/write keys.

When no running vault is reachable (`running: false`), it returns a `reason` and a `howto` for recovery — with `optsidian`, the `howto` points at `optsidian open-gui` to launch the last-opened vault, then retry.

The `install` field is present in both states (the active vault running PARA-ZK does not mean a target vault has it) and adapts to the CLI: with `optsidian` it suggests `optsidian plugin:install url=<repo> enable`; without it, copying the built `manifest.json`/`main.js`/`styles.css` into `<vault>/.obsidian/plugins/para-zk/` per the README.

### `replace`

Claude-style edit for literal body/section replacement. It wraps `para-zk:update-*` with `execFile(file, argsArray)`, never a shell, so multi-line strings, quotes, `$`, and backticks are passed as one argv element.

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

Claude-style write for replacing the entire selected body or section.

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

Append or prepend content to the selected body or section.

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
| `resource` | `update-resource` | `title` | |
| `retro` | `update-retro` | `title` | optional `date` passes through |
| `journal` | `update-journal` | `date` | no title selector |
| `zk_spark` | `update-zk` | `title` | `kind=spark` |
| `zk_source` | `update-zk` | `title` | `kind=source` |
| `zk_permanent` | `update-zk` | `title` | `kind=permanent` |

Child subnote/note bodies are edited through their container by passing `child: ["<Child Title>"]` (a JSON list, left to right) plus the child's own `key` (e.g. `body`).

Structured types (`project`, `area`, `journal`, `retro`) use template section
keys. Free-form types (`resource`, `zk_spark`, `zk_source`,
`zk_permanent`, child `subnote`, and fallback `note`) use `key=body` for prose;
their Markdown headings are content, not enforced keys. `describe` remains the
source of truth for each type's read/write keys and collections.

## Shell Safety

The mutation tools receive JSON params and invoke `optsidian` or `obsidian` with `execFile(file, argsArray)`. Content is passed as single argv elements such as `value=<raw content>` or `with=<raw content>`, not interpolated into a shell command.

Only body/section edits are exposed through MCP mutation tools. Frontmatter updates, task insertion/deletion, and other mutation commands remain available through the CLI returned by `describe`.
