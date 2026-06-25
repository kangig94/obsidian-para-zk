<!--
Release history lives in GitHub Releases.

Use this file only as the pending release-note draft for the next release. Replace the placeholder
below with the release body before tagging; after publishing, clear it back to the placeholder.
-->

## 0.1.5

### Added

- Automatically reparent child notes after Obsidian file tree moves. Moving a subnote between Projects and Areas now updates its `parent` frontmatter to the nearest folder-style parent.
- Automatically reparent nested Areas after folder moves, including root/nested Area transitions and Area tag namespace updates for descendants.

### Notes

- No new `para-zk:move-child` command was added. This release keeps file moves in Obsidian/optsidian and lets PARA-ZK repair managed parent metadata after the move event.
- The existing `updated` frontmatter timestamp may change when auto-reparent writes the corrected metadata; that is expected.

### Validation

- Added workflow and listener tests for file and folder move handling.
- Passed typecheck, full Vitest suite, architecture lint, Obsidian review lint, and dead-code lint.
