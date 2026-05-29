# Changelog

Notable changes for PARA-ZK are tracked here.

## 0.0.1 - In development

### Added

- Added native Obsidian commands and native CLI handlers for PARA/ZK workflows:
  vault initialization, project/area/resource creation, subnotes, retros, ZK notes,
  journal capture, and note promotion.
- Added idempotent vault initialization for PARA, ZK, Journal, Dashboard, Templates,
  and managed PARA-ZK template files.
- Added dependency checks for Dataview, Tasks, Tabs, and Folder notes during initialization.
  `installDeps=true` installs and enables missing dependencies, and DataviewJS is
  enabled when Dataview is present.
- Added locale-neutral workflow arguments for CLI automation while keeping localized
  labels in the Obsidian GUI.
- Added native PARA-ZK inline action buttons with `PZK[...]` tokens, replacing the
  prior Meta Bind button dependency.
- Added native PARA-ZK props controls with `para-zk-props` and `PZK_INPUT[...]`,
  replacing Meta Bind input controls while writing frontmatter directly.
- Added native PARA-ZK ribbon actions for project, area, resource, ZK, daily
  note, and quick memo workflows, replacing Commander-managed QuickAdd shortcuts.
- Added native Home dashboard action rendering with `para-zk-dashboard-actions`.
- Added native dashboard summary card rendering with `para-zk-dashboard-summary`.
- Added a first-read project intent document for LLM agents and contributors.
- Added LLM-facing CLI contract documentation and disposable-vault smoke test tooling.
- Added an Overmind reference mapping document for tracking ported behavior and intentional improvements.
- Added `area_titles` support to project creation so CLI automation can reuse or create area notes by title.
- Added a native daily journal GUI command that creates or opens today's journal
  without requiring QuickAdd.

### Changed

- Dashboard action panels now use the same responsive grid rhythm, spacing, radius,
  and shadow scale as dashboard summary cards.
- Dashboard summary metrics are now calculated by PARA-ZK instead of DataviewJS card
  snippets.
- Generated templates store workflow state as stable code values such as
  `status: in_progress`, `priority: high`, and `maturity: draft`; GUI controls render
  localized labels from those codes.
- The Home dashboard is now designed as native PARA-ZK UI instead of mirroring the
  original Overmind callout and Meta Bind implementation.
- The disposable-vault smoke test now focuses the target Obsidian vault window
  with `xdotool` when multiple vault windows are open.
- Vault initialization and managed-file regeneration now share the same GUI
  command; the GUI command opens an options modal, and command args such as
  `force=true` select the sync behavior when passed by automation.
- The default locale is now English when no locale is configured or supplied;
  Korean output is still available with `locale=ko`.
- GUI locale changes now refresh command palette and ribbon labels in place so
  the selected language is visible immediately without moving ribbon icons.
- Native PARA-ZK ribbon actions now keep a stable order below Obsidian's default
  ribbon actions even after plugin reloads.
- The disposable-vault smoke test now validates GUI command labels, ribbon
  labels, and ribbon ordering across English and Korean locale changes.

### Removed

- Removed the need for Meta Bind in generated PARA-ZK templates and dashboards.
- Removed DataviewJS-only card rendering for dashboard summary sections.
- Removed the separate `sync-managed-files` GUI command.
