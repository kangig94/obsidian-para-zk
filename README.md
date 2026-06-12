# PARA-ZK

Native Obsidian plugin for PARA and Zettelkasten workflows.

PARA-ZK runs as an Obsidian plugin (GUI commands + ribbon shortcuts) and, while
Obsidian is running, exposes the full workflow contract through a native CLI.
Its thin MCP server discovers that CLI contract and exposes shell-safe edit
tools (`replace`/`set`/`add`) so scripts and LLMs can drive the vault.

## Installation

### Obsidian plugin

With [`optsidian`](https://github.com/kangig94/optsidian) installed, install
straight from the repo in one shot:

```bash
optsidian plugin:install url=https://github.com/kangig94/obsidian-para-zk enable
```

The repo ships a prebuilt `main.js`, so this clones it, copies it into
`<vault>/.obsidian/plugins/para-zk/`, enables it, and reloads Obsidian. Add
`vault-path=<path>` to target a non-active vault, or `ref=<git-ref>` to pin a
version.

Without optsidian, just copy `manifest.json`, `main.js`, and `styles.css` from the
repo root into `<vault>/.obsidian/plugins/para-zk/` and enable **PARA-ZK** under
Settings → Community plugins — no build step needed, those artifacts are committed.

Then scaffold the vault with the **PARA-ZK: Set up PARA-ZK vault** command (or
`para-zk:setup`). Setup is idempotent: it creates the PARA/ZK layout, templates,
and dashboards, and offers to install the required community plugins
(`installDeps=true`).

### Claude Code / Codex (MCP)

With Obsidian running and `optsidian` or `obsidian` on `PATH`:

```text
# Claude Code
/plugin marketplace add kangig94/obsidian-para-zk
/plugin install para-zk@obsidian-para-zk

# Codex
codex plugin marketplace add kangig94/obsidian-para-zk
codex /plugins   # install "para-zk"
```

See [docs/MCP.md](docs/MCP.md) for details and generic MCP-client registration.

## Usage

- **GUI** — command palette (`PARA-ZK: …`) and left-ribbon shortcuts for project,
  area, resource, ZK, daily note, and quick memo.
- **CLI** — run `para-zk:describe` for the live list of surface types; add
  `type=<surface>` to drill into that surface's read/write keys. Full contract in
  [docs/CLI.md](docs/CLI.md).
- **MCP** — `describe` for the CLI contract plus shell-safe edit tools
  (`replace`/`set`/`add`); see [docs/MCP.md](docs/MCP.md).

CLI and MCP values are locale-neutral codes (e.g. `status=in_progress`); the
plugin renders localized labels in the note. Default locale is English — pass
`locale=ko` for a Korean vault.

## Development

Start with [docs/FIRST_READ.md](docs/FIRST_READ.md) for project intent, test-vault
rules, and the GUI/CLI contract. See [docs/CHANGELOG.md](docs/CHANGELOG.md) for the
development changelog.

```bash
npm install
npm run lint      # architecture guard + tsc
npm run test      # Vitest unit suite against an in-memory Obsidian mock
npm run build
```

The build treats the repo root as the Obsidian deployment shape (`manifest.json`,
`main.js`, `styles.css`); CSS source lives in `assets/styles.css` and is copied to
root on build.

`npm run smoke:vault -- --vault /path/to/test-vault` runs the checks that need a
real Obsidian engine (dependency config, ribbon/command labels, rename link
rewriting, backlink resolution, live renderers). It always wipes and
re-initializes the vault from scratch each run, so point it only at a disposable
test vault.
