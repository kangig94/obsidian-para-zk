---
paths:
  - "src/**/*.ts"
---
# Validation Checklist — Obsidian Plugin

## BLOCKING (must pass)
- Every `addCommand`/`registerEvent`/`registerDomEvent`/`addRibbonIcon`/interval/observer
  is created in `onload()` (or a method it calls), so Obsidian's `register*` auto-cleanup
  applies. Manually-created intervals/observers/listeners have explicit teardown.
- The plugin bundle must load on mobile (`manifest.json` declares `isDesktopOnly:
  false`), so `main.js` carries **no eager (top-level) Node import**. GUI, core
  (`workflows/`, `templates.ts`), vault, and runtime code use no Node-only APIs (`fs`,
  `path`, `child_process`, `process`) at all. The desktop-only CLI adapter (`src/cli/`)
  — whose handlers are never registered on mobile — MAY use Node, but only via a lazy
  `import()` inside an async handler (never a top-level import), so no eager Node
  `require` lands in `main.js`. (The MCP server in `src/mcp/` runs in Node and is exempt.)
- Settings load tolerates missing/extra fields: `loadSettings` merges over defaults; a
  vault saved by an older version still loads.
- Vault writes are non-destructive: `para-zk:setup` stays idempotent; existing
  non-managed files are not overwritten without `force=true`.
- `npm run lint:architecture` passes — no layer-boundary or content-blank violations.
- Changed code has corresponding tests (Vitest), or a documented reason it is
  smoke-only.

## STRONG (must document if skipped)
- `manifest.json` `minAppVersion` and `versions.json` reflect any newly-used Obsidian API.
- New community-plugin dependencies are registered in `src/runtime/dependencies/`.
- New managed template blocks (`para-zk-*`) have a matching renderer registered in `onload`.

## MINOR (should document)
- Code complexity within thresholds.
- Naming conventions followed.
- No dead code introduced (`npm run lint:deadcode`).
