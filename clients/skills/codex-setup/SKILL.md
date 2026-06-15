---
name: codex-setup
description: Install or refresh PARA-ZK Codex custom agents from the plugin's bundled Claude-style agent definitions. Use when a Codex user wants PARA-ZK workflows such as wiki-ingest to spawn named agents like wiki-weaver, or after installing/upgrading the PARA-ZK plugin in Codex.
---

# Codex Setup

Install PARA-ZK custom agents into the user's Codex agent directory. This bridges
the plugin's shared `clients/agents/*.md` agent definitions into Codex's
`~/.codex/agents/*.toml` custom-agent format.

## Workflow

1. Confirm the Optsidian MCP dependency is available in the current session. The
   generated agents expect `mcp__optsidian__command_run`; if that tool is missing,
   stop and tell the user to enable the Optsidian MCP server, then start a new
   Codex thread.
2. Run the bundled installer:

   ```bash
   node clients/skills/codex-setup/scripts/install-codex-agents.mjs
   ```

   When running from an installed plugin cache, resolve the path relative to this
   `SKILL.md` file:

   ```bash
   node <this-skill-dir>/scripts/install-codex-agents.mjs
   ```

3. Report the installed, skipped, and warning lines from the script.
4. Tell the user to restart Codex or start a new thread before expecting the new
   agent names to appear.

## Installer Options

- `--dry-run`: print what would be written without modifying files.
- `--force`: overwrite existing agent TOML files when the generated content differs.
- `--out-dir <path>`: write to a custom Codex agent directory instead of
  `${CODEX_HOME:-~/.codex}/agents`.
- `--source-dir <path>`: read agent markdown files from a custom directory instead
  of the plugin's `clients/agents`.

Default installs are non-destructive: an existing different TOML file is skipped
unless `--force` is passed.
