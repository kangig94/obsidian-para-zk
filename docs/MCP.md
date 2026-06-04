# PARA-ZK MCP

PARA-ZK ships a thin, describe-only MCP server. It exposes one `describe` tool; all real work goes through the `para-zk:*` CLI command line returned by that tool.

## Prerequisites

- Obsidian is running with the PARA-ZK vault set up.
- `optsidian` is on `PATH` for the preferred invocation, or `obsidian` is on `PATH` for the fallback invocation.

## Claude Code

```text
/plugin marketplace add kangig94/obsidian-para-zk
/plugin install para-zk@kangig94
```

## Codex And Other MCP Clients

Use an absolute path to this repo's built MCP bundle:

```json
{
  "mcpServers": {
    "para-zk": {
      "command": "node",
      "args": [
        "/absolute/path/to/obsidian-para-zk/clients/claude/para-zk-mcp.mjs"
      ]
    }
  }
}
```

Build the bundle with `npm run build` before registering it.
