---
title: MCP
---

PARA-ZK ships a thin MCP server that proxies the native CLI while Obsidian is running.

The server exposes discovery plus shell-safe section edits. It does not replace the CLI contract; it gives MCP clients a small, reliable way to discover and mutate PARA-ZK notes through the same workflow surface.

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

Build the bundle before direct registration if you are using a local checkout:

```bash
pnpm run build
```

## Tools

The MCP server exposes:

- `describe`: returns the live PARA-ZK surface index, install guidance, vault context, workflows, and per-type schema drill-down.
- `replace`: literal replacement inside a body or section.
- `set`: replace an entire body or section.
- `add`: append or prepend content to a body or section.

Frontmatter updates, task mutations, and other structured operations stay available through the CLI commands returned by `describe`.

## Values

MCP values use the same locale-neutral codes as the CLI:

```text
status=in_progress
priority=high
maturity=draft
kind=permanent
```

The Obsidian GUI renders localized labels in the vault.

## More Detail

See [docs/MCP.md](https://github.com/kangig94/obsidian-para-zk/blob/main/docs/MCP.md) for the full MCP setup notes and direct-client registration details.
