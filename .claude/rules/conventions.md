# Conventions

## Git Workflow

`main` is the only long-lived branch. Changes go through a PR; releases are cut only
by the manual Release GitHub Action. Squash PRs so each merged change is traceable to
one PR. Plugin CI validates Node 24.2 and 26.

## PR Labels

Every PR carries exactly one type label mapped from its conventional title prefix.
GitHub's generated release notes group every PR merged since the previous release by
these labels via [`.github/release.yml`](../../.github/release.yml).

| PR title prefix | Label           |
| --------------- | --------------- |
| `feat:`         | `enhancement`   |
| `fix:`          | `bug`           |
| `refactor:`     | `refactor`      |
| `docs:`         | `documentation` |
| `test:`         | `test`          |
| `ci:`           | `ci`            |
| `chore:`        | `chore`         |

The `PR Labels` workflow applies this mapping when a PR is opened or its title changes.
If no prefix matches, it leaves the labels unchanged and the type label must be applied
manually. Never leave a PR unlabeled. Use `ignore-for-release` only to omit a PR such as
a revert or pure no-op.

## Releasing

Run **Actions → Release → Run workflow** and enter a semver without a leading `v`.
The workflow validates `main`, updates every versioned manifest and marketplace ref,
rebuilds the release artifacts, creates the release commit and exact version tag, and
publishes the GitHub Release. Its GitHub App is the only actor with always-on ruleset
bypass. There is no standalone changelog; PR titles and labels are the release notes.

## Code Conventions

**Commits**: Conventional commits — `feat:`, `fix:`, `refactor:`, `docs:`, `test:`,
`ci:`, `chore:`.
**Module names**: Role-specific kebab-case files (e.g. `dashboard-actions.ts`). No
`utils.ts`/`helpers.ts`/`shared/`. Re-exports only in `index.ts`.
**TypeScript**: strict ESM, `camelCase` symbols, `PascalCase` types. Target ES2022,
`moduleResolution: Bundler`.
**CLI**: command names are kebab-case (`create-from-resource`, `update-zk`). One
canonical argument name per concept — reject aliases (camelCase/legacy) with a direct
error rather than accepting multiple spellings.
**Option values**: locale-neutral codes only at the CLI/MCP boundary
(`status=in_progress`); never localized labels.
**Tests**: Vitest (`test/**/*.test.ts`), run via `pnpm test`. `obsidian` is aliased to
the in-memory mock `test/mocks/obsidian.ts`; harnesses in `test/harness/`. Pure logic is
unit-tested here; engine-dependent behavior is covered by `pnpm run smoke:vault`.
**Formatting**: no auto-formatter configured — match surrounding style.
