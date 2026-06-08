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

The plugin also bundles an `import-resource` skill (`clients/skills/import-resource/`),
discovered by both Claude Code (auto, under the plugin root) and Codex (declared via the
`skills` field in `.codex-plugin/plugin.json`). Where `describe` advertises the unit
commands, the skill encodes the procedure for turning a request into clean resource note(s)
from any source — a local file, a web page, open web research, or synthesis — and any
transform (verbatim import, translation, research/compilation, multi-note breakdowns):
gather, produce clean Markdown, **correct/verify**, store via the CLI, and link it — so a
caller does not stop at a raw, unreviewed dump. (Clients without skill support still get the
`vault` orientation through `describe`.)

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

Returns a compact index with the preferred CLI invocation, help command, usage notes, and an `install` string describing how to install PARA-ZK into a vault. The envelope also carries `vault` in both running states — orienting context for a cold caller: the store is one user's private, local, single-user Obsidian "second brain", never published or shared, so saving source material into it is personal-use storage, not redistribution (a caller should not refuse content on public-distribution grounds). When a running PARA-ZK vault is reachable (`running: true`), it also returns a `scope` note (what PARA-ZK owns — typed PARA/ZK operations — versus raw file edits, free-form frontmatter, and full-text search, which route to the host), the supported surface types, the named `workflows` (non-surface commands such as `create-child`, `read-child`, `update-child`, `rename-child`, `delete-child`, `capture-journal`, `distill-spark`, `create-from-*`, `attach-file`, each with their inputs), and the `schema` drill-down command. Use `schema` (`para-zk:describe type=<t>`) to fetch a type's address selectors, `create` command + `createInputs`, and read/write keys (`writeKeys` carry each mutable key with its op; keys absent there, e.g. `created`/`updated`, are vault-managed) — enough to drive the vault by name without any separate help lookup.

When no running vault is reachable (`running: false`), it returns a `reason` and a `howto` for recovery — with `optsidian`, the `howto` points at `optsidian open-gui` to launch the last-opened vault, then retry.

The `install` field is present in both states (the active vault running PARA-ZK does not mean a target vault has it) and gives the full two-step setup: (1) install the prebuilt plugin — with `optsidian`, `optsidian plugin:install url=<repo> enable` (add `vault-path=` for a non-active vault); without it, copy the committed `manifest.json`/`main.js`/`styles.css` into `<vault>/.obsidian/plugins/para-zk/` and enable it. (2) initialize the vault — `para-zk:setup installDeps=true` (creates the PARA/ZK layout and installs required community plugins).

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
| `zk_digest` | `update-zk` | `title` | `kind=digest` |
| `zk_permanent` | `update-zk` | `title` | `kind=permanent` |

The MCP mutation tools keep a convenient `child: ["<Child Title>", ...]` parameter for LLM callers. When `child` is omitted, the server invokes the direct `update-*` command above. When `child` is present for `type=project` or `type=area`, the server routes internally to `para-zk:update-child`:

```text
type=area title="AI" child=["Generation","Vision"]
→ para-zk:update-child root_type=area root_title="AI" relpath=["Generation"] title="Vision"
```

The `key` is the addressed child's own key (for example `body` for subnotes/fallback notes or `overview` for nested areas). Child updates on non-project/area roots are rejected because the public CLI child family requires `root_type=project|area`.

Structured types (`project`, `area`, `journal`, `retro`) use template section
keys. Free-form types (`resource`, `zk_spark`, `zk_digest`,
`zk_permanent`, child `subnote`, and fallback `note`) use `key=body` for prose;
their Markdown headings are content, not enforced keys. `describe` remains the
source of truth for each type's read/write keys and collections.

Within body/section prose, cite the note's own registry references inline with a
code span whose whole content is `` `PZ[n]` `` (0-based, matching
`key=references/<i>`; `` `PZ[1, 2]` `` for several). The `describe` scope note
states this too.

## Shell Safety

The mutation tools receive JSON params and invoke `optsidian` or `obsidian` with `execFile(file, argsArray)`. Content is passed as single argv elements such as `value=<raw content>` or `with=<raw content>`, not interpolated into a shell command.

CLI JSON results use the same compact envelope as the native commands: `ok` plus result fields such as `path`, or `ok: false` plus `error`. They do not echo the invoked command name.

Only body/section edits are exposed through MCP mutation tools. Frontmatter updates, task insertion/deletion, and other mutation commands remain available through the CLI returned by `describe`.
