---
title: MCP
---

PARA-ZK ships a thin MCP server that proxies the native CLI while Obsidian is running.

The server exposes fetch-once conventions, live discovery, and shell-safe string mutation tools. It does not replace the CLI contract; it gives MCP clients a small, reliable way to discover and mutate PARA-ZK notes through the same workflow surface.

## Prerequisites

- Obsidian is running.
- The vault has PARA-ZK installed and set up.
- `optsidian` is on `PATH`, or the native `obsidian` CLI is available as a fallback.

## Claude Code

Install the bundled plugin:

```text
/plugin marketplace add kangig94/obsidian-para-zk
/plugin install para-zk@obsidian-para-zk
```

## Codex

Add the marketplace, then install the plugin from Codex's plugin UI:

```bash
codex plugin marketplace add kangig94/obsidian-para-zk
codex /plugins
```

Choose **para-zk** from the plugin list.

## Other MCP Clients

Clients that accept an `mcpServers` JSON config can register the bundled server directly:

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

If you edited the MCP server source in a local checkout, rebuild the bundle before direct registration:

```bash
pnpm run build
```

Released plugin installs already include the bundled `clients/para-zk-mcp.mjs`; rebuild only when working from edited source.

## Tools

The MCP server exposes:

- `conventions`: recommended first call for tasks touching the vault. It returns ownership/routing, citation, and wiki-compounding rules.
- `describe`: returns the live PARA-ZK surface index, install guidance, vault context, workflows, and per-type schema drill-down.
- `replace`: literal replacement inside a writable key that supports `replace`, usually body or section prose.
- `set`: replace an entire writable key, including documented `frontmatter/<key>` scalar or list keys that support `set`.
- `add`: append or prepend content to body/section keys and documented list frontmatter keys that support append/prepend.

Structured operations outside those string shapes stay CLI-only, including task insertion with `value_json`, task deletion, reference insertion/backfill, and audit/list/wiki-ingest workflows. The MCP mutation tools pass the requested `key` through to the matching `update-*` command, so always check `describe type=<surface>` `writeKeys`.

## Child Notes

For MCP mutation tools, `child: ["Generation", "Vision"]` is accepted only with `type=project` or `type=area`. The server routes that internally to `para-zk:update-child` with `root_type`, `root_title`, `relpath`, and `title`. For a subfoldered subnote, pass the folder path in the final child element, such as `child: ["Notes/Plan.md"]`; a bare basename still works when unique. The `key` belongs to the addressed child note, not the root.

For non-mutation child operations, use the CLI commands returned by `describe`: `create-child`, `read-child`, `rename-child`, and `delete-child`.

## Values

MCP values use the same locale-neutral codes as the CLI:

```text
status=in_progress
priority=high
maturity=draft
kind=permanent
```

The Obsidian GUI renders localized labels in the vault.

## Citations

Within body or section prose, cite the note's own reference registry with backtick code-span citations such as `` `PZ[<id>]` `` or `` `PZ[<id>#<section>]` ``. The id is the stable reference id from `read key=references`; positional input such as `` `PZ[0]` `` is not supported. Bare `PZ[<id>]` text does not render.

## More Detail

See [docs/MCP.md](https://github.com/kangig94/obsidian-para-zk/blob/main/docs/MCP.md) for the full MCP setup notes and direct-client registration details.
