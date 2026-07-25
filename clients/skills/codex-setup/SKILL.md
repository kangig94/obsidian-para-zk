---
name: codex-setup
description: Install or refresh PARA-ZK Codex custom agents from the plugin's bundled Claude-style agent definitions. Use when a Codex user wants PARA-ZK workflows such as wiki-ingest to spawn named agents like wiki-weaver, or after installing/upgrading the PARA-ZK plugin in Codex.
---

# Codex Setup

Install PARA-ZK custom agents into the user's Codex agent directory. This bridges
the plugin's shared `clients/agents/*.md` agent definitions into Codex's
`~/.codex/agents/*.toml` custom-agent format.

## Workflow

1. Run the bundled installer. Do not block installation on Optsidian or its MCP
   server: those are runtime command transports, not installer dependencies.

   ```bash
   node clients/skills/codex-setup/scripts/install-codex-agents.mjs
   ```

   When running from an installed plugin cache, resolve the path relative to this
   `SKILL.md` file:

   ```bash
   node <this-skill-dir>/scripts/install-codex-agents.mjs
   ```

2. Check and report which runtime command transport the installed agents can use,
   without failing or undoing the installation:
   - Prefer `mcp__optsidian__command_run` when it is available in the current
     session.
   - Otherwise use `optsidian` from `PATH`.
   - Otherwise fall back to the native `obsidian` CLI from `PATH`.
   - If none is available, warn that vault-working agents such as `wiki-weaver`
     cannot run yet. The agent files are still installed successfully.
3. Report the installed, updated, unchanged, and warning lines from the script.
4. Tell the user to restart Codex or start a new thread before expecting the new
   agent names to appear.

## Installer Options

- `--dry-run`: print what would be written without modifying files.
- `--force`: accepted for compatibility with older instructions; installs now
  overwrite existing agent TOML files by default.
- `--out-dir <path>`: write to a custom Codex agent directory instead of
  `${CODEX_HOME:-~/.codex}/agents`.
- `--source-dir <path>`: read agent markdown files from a custom directory instead
  of the plugin's `clients/agents`.

Default installs are destructive for managed agent names: an existing different
TOML file at the generated target path is overwritten with the bundled agent
definition. Use `--dry-run` to preview writes.
