---
title: Journal
---

PARA-ZK includes a daily journal for low-friction capture and review.

## Open The Daily Note

Use the command palette:

```text
PARA-ZK: Open daily note
```

The left ribbon includes the same daily-note shortcut.

The journal note is addressed by date in the CLI:

```bash
optsidian para-zk:read-journal date=YYYY-MM-DD
```

## Quick Memo Capture

Use **PARA-ZK: Quick memo** to append a timestamped memo to the daily journal.

Automation can append a memo with:

```bash
optsidian para-zk:capture-journal content="Reviewed PARA-ZK CLI contract"
```

Optional fields include:

- `date=YYYY-MM-DD`
- `time=HH:mm`
- `energy=high|normal|low`

## How Journals Fit

Journals are the capture layer for small observations, daily context, and work-in-progress notes that do not yet belong in a project, resource, or permanent ZK note.

Journal notes can also carry tasks, references, and backlinks, so a memo captured today can later connect to a project, area, resource, or ZK note without losing its original context.

> [!tip]
> Use quick memo for capture. Move durable ideas into [[features/zettelkasten|ZK notes]] and actionable work into [[features/para|PARA projects or tasks]] when they become clear.
