<!--
Release history lives in GitHub Releases.

Use this file only as the pending release-note draft for the next release. Replace the placeholder
below with the release body before tagging; after publishing, clear it back to the placeholder.
-->

### Fixed

- Reading view: fixed the recurring scroll "jump" in notes carrying the PARA-ZK props
  panel (the viewport lurched by a fixed amount on every scroll tick — earlier it drifted
  steadily downward; later it jumped and snapped back). Root cause: Reading view recycles
  its sections — the note header among them — in and out of the DOM while scrolling, so once
  the header scrolled away the props panel was orphaned and re-attached as a bare
  `.markdown-preview-sizer` child. That put unaccounted height above the viewport that
  Obsidian stripped and the plugin re-added every frame, shoving the scroll position. The
  props panel now attaches only inside its stable home (`.mod-header`) and waits, detached,
  while the header is recycled away — instead of falling back to the top of the sizer. The
  managed panel keeps its sizer fallback (it sits below the body, so it never caused the
  above-viewport thrash, and detaching it would leave its Dataview views — cited-by,
  references — unable to populate).
