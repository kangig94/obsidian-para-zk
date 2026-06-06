# Conventions

**Commits**: Conventional commits — `feat:`, `fix:`, `refactor:`, `docs:`, `test:`.
**Module names**: Role-specific kebab-case files (e.g. `dashboard-actions.ts`). No
`utils.ts`/`helpers.ts`/`shared/`. Re-exports only in `index.ts`.
**TypeScript**: strict ESM, `camelCase` symbols, `PascalCase` types. Target ES2022,
`moduleResolution: Bundler`.
**CLI**: command names are kebab-case (`create-from-resource`, `update-zk`). One
canonical argument name per concept — reject aliases (camelCase/legacy) with a direct
error rather than accepting multiple spellings.
**Option values**: locale-neutral codes only at the CLI/MCP boundary
(`status=in_progress`); never localized labels.
**Tests**: Vitest (`test/**/*.test.ts`), run via `npm test`. `obsidian` is aliased to
the in-memory mock `test/mocks/obsidian.ts`; harnesses in `test/harness/`. Pure logic is
unit-tested here; engine-dependent behavior is covered by `npm run smoke:vault`.
**Formatting**: no auto-formatter configured — match surrounding style.
**Changelog**: update `docs/CHANGELOG.md` for notable behavior, workflow, CLI, template,
dashboard, or dependency changes.
