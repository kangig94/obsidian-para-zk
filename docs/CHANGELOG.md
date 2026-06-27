## 0.2.0

### Added

- Added optional built-in cursor and scroll position memory, disabled by default.
- Added focused tests for position memory, Dataview rendering, managed sections, note chrome core behavior, and reading-view chrome slots.

### Improved

- Reworked note chrome rendering around scoped rendering hosts for editor and reading views.
- Hardened Dataview and managed-section rendering against stale renders, races, and missing containers.
- Reduced global reading-view postprocessor work for cited-by rendering.
- Simplified cited-by render retry cleanup.
- Removed the external remember-cursor setup dependency.

### Fixed

- Fixed the reading-view cited-by render race.
- Prevented restored source cursor state from drifting upward across repeated note switches.
- Avoided persisting transient top-of-note state while restoring saved positions.
