<!--
Release history lives in GitHub Releases.

Use this file only as the pending release-note draft for the next release. Replace the placeholder
below with the release body before tagging; after publishing, clear it back to the placeholder.
-->

### Fixed

- Position memory now repairs an unreadable `position-memory.json` immediately on load
  by overwriting it with valid empty data, instead of leaving the corrupt file on disk
  until the next capture. A failed repair is reported as an error.
