# PARA-ZK (with LLM-Wiki)

An LLM-maintained PARA + Zettelkasten knowledge wiki for Obsidian.

You curate the sources and ask the questions; PARA-ZK's workflows ingest them into
interlinked notes and keep frontmatter, references, and backlinks coherent, so
knowledge compounds in the vault instead of being re-derived on each query.

PARA-ZK runs as an Obsidian plugin (GUI commands + ribbon shortcuts) and, while
Obsidian is running, exposes the full workflow contract through a native CLI.
Its thin MCP server discovers that CLI contract and exposes shell-safe edit
tools (`replace`/`set`/`add`) so scripts and LLMs can drive the vault.

## Installation

### Obsidian plugin

Install the beta with [BRAT](https://github.com/TfTHacker/obsidian42-brat): install
**BRAT** from community plugins, then BRAT → **Add beta plugin** → enter
`https://github.com/kangig94/obsidian-para-zk`. BRAT downloads the latest published
release and keeps it updated; enable **PARA-ZK** under Settings → Community plugins.

The official install path is always a published **release**: BRAT (above), or a manual
download of `manifest.json`, `main.js`, and `styles.css` from the
[latest release](https://github.com/kangig94/obsidian-para-zk/releases) into
`<vault>/.obsidian/plugins/para-zk/`. Build outputs are no longer committed to the repo.

For local development only, build first (`pnpm build`) and deploy the generated `build/`
folder — e.g. with [`optsidian`](https://github.com/kangig94/optsidian):
`optsidian plugin:install path=build enable`.

Then scaffold the vault with the **PARA-ZK: Set up PARA-ZK vault** command (or
`para-zk:setup`). Setup is idempotent: it creates the PARA/ZK layout, templates,
and dashboards, overwrites plugin-owned scaffolding when generated content differs,
and offers to install the required community plugins
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
rules, and the GUI/CLI contract. [docs/CHANGELOG.md](docs/CHANGELOG.md) is only the
pending GitHub release-note draft; published history lives in GitHub Releases.

```bash
pnpm install
pnpm run lint      # architecture guard + tsc
pnpm run test      # Vitest unit suite against an in-memory Obsidian mock
pnpm run build
```

The build treats the repo root as the Obsidian deployment shape (`manifest.json`,
`main.js`, `styles.css`); CSS source lives in `assets/styles.css` and is copied to
root on build.

`pnpm run smoke:vault -- --vault /path/to/test-vault` runs the checks that need a
real Obsidian engine (dependency config, ribbon/command labels, rename link
rewriting, backlink resolution, live renderers). It always wipes and
re-initializes the vault from scratch each run, so point it only at a disposable
test vault.

## Cutting a release (maintainers)

The version lives in **one** place — `package.json`. The build propagates it into
`manifest.json`, `versions.json`, and the Claude Code / Codex plugin manifests, and
injects it into the MCP server bundle, so there is nothing else to hand-edit.

```bash
pnpm version patch        # bumps package.json, rebuilds + syncs every manifest, commits, tags
git push --follow-tags    # the release workflow builds and creates a DRAFT GitHub release
```

Then review the draft release on GitHub and **publish** it (BRAT only sees published
releases). The tag must equal `manifest.json` version exactly, with no `v` prefix; the
workflow enforces this.
