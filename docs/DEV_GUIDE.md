# Developer Guide

Read `docs/FIRST_READ.md` for product intent and `docs/ARCHITECTURE.md` for the layer
model before changing code. This guide is the how-to-build reference.

## Setup

```bash
pnpm install
```

No runtime dependencies — the plugin bundles everything; `obsidian`, `electron`,
`@codemirror/*`, and Node builtins are marked external.

## Build Targets

`pnpm run build` produces **two** esbuild bundles plus the stylesheet. CI and release
workflows build on Node 26:

1. `src/main.ts` → `build/main.js` (cjs, browser, es2022, minified; externals: `obsidian`,
   `electron`, `@codemirror/*`, node builtins) — the Obsidian plugin.
2. `src/mcp/server.ts` → `clients/para-zk-mcp.mjs` (esm, node18 target, `#!/usr/bin/env node`
   banner) — the MCP server, plus `clients/para-zk-mcp.mjs.sha256`.
3. `assets/styles.css` → `build/styles.css`.

`build/` is the Obsidian deployment shape (`main.js`, `manifest.json` — staged from the
committed root copy — and `styles.css`); it is **gitignored** and shipped as GitHub
Release assets (Obsidian installs the plugin from those). The MCP bundle is the exception: it stays
committed at `clients/para-zk-mcp.mjs` because the Claude Code / Codex marketplace ships
`clients/` via git clone with no install-time build.

| Task | Command | Notes |
|------|---------|-------|
| Production build | `pnpm run build` | `NODE_ENV=production node tools/build.mjs production`; minified |
| Dev build | `pnpm run dev` | Non-minified, inline sourcemaps |
| Watch | `pnpm run watch` | Rebuilds both bundles + re-syncs on change |
| Sync to a vault | `pnpm run sync` | Standalone sync helper |

Set `OBSIDIAN_PLUGIN_DIR=<vault>/.obsidian/plugins/para-zk` before a build to also copy
`main.js`/`manifest.json`/`styles.css` straight into that vault.

## Release Submission Notes

`manifest.json` keeps `isDesktopOnly: false` because mobile can load the plugin as a
pure GUI plugin. CLI handlers register only when the host injects `registerCliHandler`
(desktop `optsidian`/`obsidian-native`), the bundle has no eager Node import, and Node
access is lazy via `window.require` (Electron) with a dynamic `import()` fallback inside CLI handlers.

## Test, Typecheck, Lint

| Task | Command | What it checks |
|------|---------|----------------|
| Unit tests | `pnpm test` | `vitest run`; `test/**/*.test.ts` in node env, `obsidian` aliased to `test/mocks/obsidian.ts` |
| Tests (watch) | `pnpm run test:watch` | `vitest` |
| Typecheck | `pnpm run typecheck` | `tsc --noEmit` (strict) |
| Architecture lint | `pnpm run lint:architecture` | Layer boundaries + content-blank names + re-export rule |
| Deadcode lint | `pnpm run lint:deadcode` | `knip` (entries: `src/main.ts`, `src/mcp/server.ts`, `tools/*.mjs`) |
| All lints | `pnpm run lint` | architecture → deadcode → typecheck |

Tests are split by harness under `test/`: `test/cli/*` (CLI contract), `test/unit/*`
(pure logic incl. MCP server/args, templates, parse, records, slug, time, vocabulary,
zk-kinds, frontmatter), `test/workflows/smoke-harness.test.ts`. Shared harnesses live in
`test/harness/{cli,vault}.ts`. Pure logic is unit-tested with the Obsidian mock;
behavior that needs the real engine is covered by the smoke test.

## Live Smoke Test

`pnpm run smoke:vault` runs the checks that need a real Obsidian engine (dependency
config, locale labels, rename link rewriting, backlink resolution, live renderers). It
**always wipes and re-initializes the vault**, so point it only at a disposable vault.

```bash
export PARA_ZK_TEST_VAULT=/path/to/para-zk-test-vault
pnpm run smoke:vault -- --vault "$PARA_ZK_TEST_VAULT"
pnpm run smoke:vault -- --vault "$PARA_ZK_TEST_VAULT" --locale ko   # validate Korean output
```

Manual live iteration:

```bash
OBSIDIAN_PLUGIN_DIR="$PARA_ZK_TEST_VAULT/.obsidian/plugins/para-zk" pnpm run build
optsidian open-gui vault-path="$PARA_ZK_TEST_VAULT"
optsidian raw plugin:reload id=para-zk
optsidian para-zk:setup deps=required
```

For a clean run, preserve `.obsidian`, clear the rest of the vault, and remove
`$PARA_ZK_TEST_VAULT/.obsidian/plugins/para-zk/data.json` before `para-zk:setup`.

## Setup Managed Files

`para-zk:setup` treats generated templates, dashboards, and vault guide files as
plugin-owned scaffolding. Setup always reconciles those files to the current
generated content, but it stays idempotent by skipping writes when content already
matches. User content notes outside the managed scaffolding set are never touched.

| Managed path state | Default run | `dryRun=true` |
|--------------------|-------------|---------------|
| Missing path | Report `created` and create the generated file | Report `created`; write nothing |
| Existing file already matches generated content | Report `existing`; write nothing | Report `existing`; write nothing |
| Existing file differs from generated content | Report `updated` and overwrite with current generated content | Report `updated`; write nothing |
| Path is a folder or unsupported vault item | Skip and warn that the path cannot be created or is unsupported | Same as default; write nothing |

## Environment Variables

| Var | Used by | Purpose |
|-----|---------|---------|
| `OBSIDIAN_PLUGIN_DIR` | `tools/build.mjs` | Copy build artifacts into a vault's plugin dir |
| `PARA_ZK_TEST_VAULT` | smoke test / manual | Disposable vault path |
| `NODE_ENV=production` | `pnpm run build` | Minified production bundle |
| `.env` (root) | tooling | Local overrides loaded by the build/smoke scripts |

## Versioning

The version lives in **one** place — `package.json`. The build (`tools/build.mjs`) reads
it and propagates it into every artifact a release consumes, so nothing else is
hand-edited:

- `manifest.json` `version` (Obsidian)
- `versions.json` — adds `"<version>": "<minAppVersion>"` on first sight
- `clients/.claude-plugin/plugin.json` version
- `clients/.codex-plugin/plugin.json` version
- the MCP server bundle, via the esbuild `__VERSION__` define — `src/mcp/server.ts`
  reads that injected global, never a hardcoded literal
- `clients/para-zk-mcp.mjs.sha256` — SHA-256 for the committed MCP bundle

`.claude-plugin/marketplace.json` is **not** in this list. It is a hand-maintained
deployment pin: its plugin `source` points at a `git-subdir` + tag `ref`, so the served
plugin version comes from the pinned tag's `plugin.json`, not from `package.json`. Build
and version scripts never rewrite it, and it is excluded from the generated-artifact
drift check.

A same-version rebuild is a no-op, and CI's post-build generated-artifact check fails if
any artifact drifts from `package.json` or the source bundle. CI also compares the MCP
bundle against its committed SHA-256. To release, bump the single source and let the build
sync the rest:

```bash
pnpm version patch   # bumps package.json, runs the build (syncs every manifest), commits, tags
```

See "Cutting a release (maintainers)" in the README for the push + publish steps.

## Workflow

1. Read `docs/FIRST_READ.md` + `docs/ARCHITECTURE.md`.
2. Implement in the right layer — business logic in `src/workflows/`, thin adapters elsewhere.
3. `pnpm run lint && pnpm run test` (and `pnpm run build`) before considering a change done.
4. Run `pnpm run smoke:vault` when the change touches engine behavior (links, backlinks,
   renderers, dependency config).
5. Put notable pending release notes in `docs/CHANGELOG.md`; after publishing the GitHub
   release, clear it back to the placeholder.
