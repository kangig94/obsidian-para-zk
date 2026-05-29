# Changelog

Notable changes for PARA-ZK are tracked here.

## 0.0.1 - In development

### Added

- Added native Obsidian commands and native CLI handlers for PARA/ZK workflows:
  vault initialization, project/area/resource creation, subnotes, retros, ZK notes,
  journal capture, and note promotion.
- Added idempotent vault initialization for PARA, ZK, Journal, Dashboard, Templates,
  and managed PARA-ZK template files.
- Added dependency checks for Dataview, Tasks, and Tabs during initialization.
  `installDeps=true` installs and enables missing dependencies, and DataviewJS is
  enabled when Dataview is present.
- Added locale-neutral workflow arguments for CLI automation while keeping localized
  labels in the Obsidian GUI.
- Added native PARA-ZK inline action buttons with `PZK[...]` tokens, replacing the
  prior Meta Bind button dependency.
- Added native PARA-ZK props controls with `para-zk-props` and `PZK_INPUT[...]`,
  replacing Meta Bind input controls while writing frontmatter directly.
- Added native Home dashboard action rendering with `para-zk-dashboard-actions`.
- Added native dashboard summary card rendering with `para-zk-dashboard-summary`.

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

### Removed

- Removed the need for Meta Bind in generated PARA-ZK templates and dashboards.
- Removed DataviewJS-only card rendering for dashboard summary sections.

