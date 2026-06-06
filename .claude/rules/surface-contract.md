---
paths:
  - "src/cli/**"
  - "src/mcp/**"
  - "clients/**"
  - "docs/CLI.md"
  - "docs/MCP.md"
---
# Surface Contract Checklist — CLI / MCP / GUI

The CLI and MCP are the LLM/automation surfaces. They must stay behavior-consistent with
the GUI by sharing `src/workflows/`, and their documented contracts must match the code.

## BLOCKING (must pass)
- CLI handlers call `src/workflows/` functions — no business logic in `cli/handlers.ts`
  beyond input parsing and the stable output envelope.
- CLI output keeps the stable JSON shape: `ok`, `command`, `path`, plus action fields
  (`created`, `archived`, `warnings`, `error`). Errors go through the `withCliErrors`
  wrapper, never thrown raw.
- Option values are locale-neutral codes; one canonical argument name per concept;
  aliases rejected with a direct error.
- MCP `replace`/`set`/`add` map to `para-zk:update-*` argv via `execFile` (never a
  shell) — multi-line/quotes/`$`/backticks must survive untouched. Tool calls stay
  serialized to avoid same-note races.
- A change to CLI commands/flags/output is reflected in `docs/CLI.md` and surfaced by
  `para-zk:describe`; an MCP tool change is reflected in `docs/MCP.md`.

## STRONG (must document if skipped)
- New CLI command added to `NATIVE_CLI_COMMANDS` and exercised by a `test/cli/*` test.
- Structured types (`project`/`area`/`journal`/`retro`) use load-bearing section keys
  with the split guard; free-form types (`resource`/`doc`/`note`/`zk_*`) expose one
  `body` key.
- MCP `describe` fallback (`running:false` + recovery `howto`) preserved when Obsidian is
  not running.

## MINOR (should document)
- `para-zk:describe` descriptors updated for new surface types/keys.
