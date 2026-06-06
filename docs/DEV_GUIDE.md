# Developer Guide

Read `docs/FIRST_READ.md` for product intent and `docs/ARCHITECTURE.md` for the layer
model before changing code. This guide is the how-to-build reference.

## Setup

```bash
npm install
```

No runtime dependencies — the plugin bundles everything; `obsidian`, `electron`,
`@codemirror/*`, and Node builtins are marked external.

## Build Targets

`npm run build` produces **two** esbuild bundles plus the stylesheet:

1. `src/main.ts` → `main.js` (cjs, browser, es2022, minified; externals: `obsidian`,
   `electron`, `@codemirror/*`, node builtins) — the Obsidian plugin.
2. `src/mcp/server.ts` → `clients/para-zk-mcp.mjs` (esm, node18, `#!/usr/bin/env node`
   banner) — the MCP server.
3. `assets/styles.css` → `styles.css` (copied to repo root).

The repo root is the Obsidian deployment shape (`manifest.json`, `main.js`, `styles.css`)
and these artifacts are committed, so installs need no build step.

| Task | Command | Notes |
|------|---------|-------|
| Production build | `npm run build` | `NODE_ENV=production node tools/build.mjs production`; minified |
| Dev build | `npm run dev` | Non-minified, inline sourcemaps |
| Watch | `npm run watch` | Rebuilds both bundles + re-syncs on change |
| Sync to a vault | `npm run sync` | Standalone sync helper |

Set `OBSIDIAN_PLUGIN_DIR=<vault>/.obsidian/plugins/para-zk` before a build to also copy
`main.js`/`manifest.json`/`styles.css` straight into that vault.

## Test, Typecheck, Lint

| Task | Command | What it checks |
|------|---------|----------------|
| Unit tests | `npm test` | `vitest run`; `test/**/*.test.ts` in node env, `obsidian` aliased to `test/mocks/obsidian.ts` |
| Tests (watch) | `npm run test:watch` | `vitest` |
| Typecheck | `npm run typecheck` | `tsc --noEmit` (strict) |
| Architecture lint | `npm run lint:architecture` | Layer boundaries + content-blank names + re-export rule |
| Deadcode lint | `npm run lint:deadcode` | `knip` (entries: `src/main.ts`, `src/mcp/server.ts`, `tools/*.mjs`) |
| All lints | `npm run lint` | architecture → deadcode → typecheck |

Tests are split by harness under `test/`: `test/cli/*` (CLI contract), `test/unit/*`
(pure logic incl. MCP server/args, templates, parse, records, slug, time, vocabulary,
zk-kinds, frontmatter), `test/workflows/smoke-harness.test.ts`. Shared harnesses live in
`test/harness/{cli,vault}.ts`. Pure logic is unit-tested with the Obsidian mock;
behavior that needs the real engine is covered by the smoke test.

## Live Smoke Test

`npm run smoke:vault` runs the checks that need a real Obsidian engine (dependency
config, locale labels, rename link rewriting, backlink resolution, live renderers). It
**always wipes and re-initializes the vault**, so point it only at a disposable vault.

```bash
export PARA_ZK_TEST_VAULT=/path/to/para-zk-test-vault
npm run smoke:vault -- --vault "$PARA_ZK_TEST_VAULT"
npm run smoke:vault -- --vault "$PARA_ZK_TEST_VAULT" --locale ko   # validate Korean output
```

Manual live iteration:

```bash
OBSIDIAN_PLUGIN_DIR="$PARA_ZK_TEST_VAULT/.obsidian/plugins/para-zk" npm run build
optsidian open-gui vault-path="$PARA_ZK_TEST_VAULT"
optsidian raw plugin:reload id=para-zk
optsidian para-zk:setup installDeps=true format=json
```

For a clean run, preserve `.obsidian`, clear the rest of the vault, and remove
`$PARA_ZK_TEST_VAULT/.obsidian/plugins/para-zk/data.json` before `para-zk:setup`.

## Environment Variables

| Var | Used by | Purpose |
|-----|---------|---------|
| `OBSIDIAN_PLUGIN_DIR` | `tools/build.mjs` | Copy build artifacts into a vault's plugin dir |
| `PARA_ZK_TEST_VAULT` | smoke test / manual | Disposable vault path |
| `NODE_ENV=production` | `npm run build` | Minified production bundle |
| `.env` (root) | tooling | Local overrides loaded by the build/smoke scripts |

## Version Bump Checklist

The version string appears in **seven** places — bump them together or releases drift:

1. `package.json` `version`
2. `manifest.json` `version`
3. `versions.json` (add `"<version>": "<minAppVersion>"`)
4. `.claude-plugin/marketplace.json` plugin version
5. `clients/.claude-plugin/plugin.json` version
6. `clients/.codex-plugin/plugin.json` version
7. `src/mcp/server.ts` — the `new Server({ name, version: "..." })` literal inside `createServer()` — **hardcoded**, easy to miss

## Workflow

1. Read `docs/FIRST_READ.md` + `docs/ARCHITECTURE.md`.
2. Implement in the right layer — business logic in `src/workflows/`, thin adapters elsewhere.
3. `npm run lint && npm run test` (and `npm run build`) before considering a change done.
4. Run `npm run smoke:vault` when the change touches engine behavior (links, backlinks,
   renderers, dependency config).
5. Update `docs/CHANGELOG.md` for notable changes.
