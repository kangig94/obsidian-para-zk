<!--
Release history lives in GitHub Releases.

Use this file only as the pending release-note draft for the next release. Replace the placeholder
below with the release body before tagging; after publishing, clear it back to the placeholder.
-->

### Distribution

- Pin the Claude Code / Codex plugin marketplace entry to the `0.2.1` git tag via a
  `git-subdir` source with `ref`, instead of tracking the marketplace repo's default
  branch. Installs now serve the frozen tag content rather than whatever has since landed
  on `main`. The redundant `version` field was dropped from the marketplace entry (the
  pinned tag's `plugin.json` is the sole version source).
- `.claude-plugin/marketplace.json` is now a hand-maintained deployment pin: the build's
  version sync and the generated-artifact drift check no longer manage it.
