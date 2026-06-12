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

`pnpm run build` produces **two** esbuild bundles plus the stylesheet:

1. `src/main.ts` → `build/main.js` (cjs, browser, es2022, minified; externals: `obsidian`,
   `electron`, `@codemirror/*`, node builtins) — the Obsidian plugin.
2. `src/mcp/server.ts` → `clients/para-zk-mcp.mjs` (esm, node18, `#!/usr/bin/env node`
   banner) — the MCP server.
3. `assets/styles.css` → `build/styles.css`.

`build/` is the Obsidian deployment shape (`main.js`, `manifest.json` — staged from the
committed root copy — and `styles.css`); it is **gitignored** and shipped as GitHub
Release assets (BRAT installs from those). The MCP bundle is the exception: it stays
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
optsidian para-zk:setup installDeps=true format=json
```

For a clean run, preserve `.obsidian`, clear the rest of the vault, and remove
`$PARA_ZK_TEST_VAULT/.obsidian/plugins/para-zk/data.json` before `para-zk:setup`.

## Setup Managed Files

`para-zk:setup` treats generated templates, dashboards, and vault guide files as
managed artifacts. The persisted `managedFiles` hash is the ownership record used to
separate safe regeneration from user-managed or user-modified content.

| Managed-file state | Default run | `force=true` | `dryRun=true` |
|--------------------|-------------|--------------|---------------|
| Missing path | Create file and record the generated hash; no warning | Same as default; no warning | Report `created`; write nothing; no warning |
| Existing file already matches generated content, tracked or untracked | Report `existing` and refresh the managed hash; no warning | Same as default; no warning | Report `existing`; write nothing; no warning |
| Known managed file, current hash matches the recorded hash, generated content changed | Overwrite with current generated content and record the new hash; no warning | Same as default; no warning | Report `updated`; write nothing; no warning |
| Existing untracked file with different content | Skip and warn `Skipped user-managed file at <path>` | Overwrite and record the generated hash; no warning | Skip, write nothing, and warn `Skipped user-managed file at <path>` |
| Known managed file, current hash differs from the recorded hash | Skip and warn `Skipped user-modified PARA-ZK file at <path>; pass force=true to overwrite` | Overwrite and record the generated hash; no warning | Skip, write nothing, and warn `Skipped user-modified PARA-ZK file at <path>; pass force=true to overwrite` |
| Path is a folder or unsupported vault item | Skip and warn that the path cannot be created or is unsupported | Same as default | Same as default; write nothing |

When `dryRun=true` is combined with `force=true`, setup reports the forced overwrite as
`updated` but still does not write files or managed hashes.

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
- `.claude-plugin/marketplace.json` plugin version
- `clients/.claude-plugin/plugin.json` version
- `clients/.codex-plugin/plugin.json` version
- the MCP server bundle, via the esbuild `__VERSION__` define — `src/mcp/server.ts`
  reads that injected global, never a hardcoded literal

A same-version rebuild is a no-op, and CI's post-build `git diff --exit-code` fails if any
manifest drifts from `package.json`. To release, bump the single source and let the build
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
5. Update `docs/CHANGELOG.md` for notable changes.
