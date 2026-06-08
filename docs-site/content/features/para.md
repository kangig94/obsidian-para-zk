---
title: PARA Workflows
---

PARA-ZK gives projects, areas, resources, tasks, references, retros, and dashboards a consistent Obsidian workflow.

## Create PARA Notes

Use the command palette:

```text
PARA-ZK: Create project
PARA-ZK: Create area
PARA-ZK: Create resource
PARA-ZK: Create subnote
PARA-ZK: Create retro
```

The left ribbon also includes shortcuts for new projects, areas, resources, ZK notes, the daily note, and quick memo capture.

Automation can use the matching CLI commands:

```bash
optsidian para-zk:create-project title="Model Evaluation" area_titles='["AI","Software"]' status=in_progress priority=high
optsidian para-zk:create-area title="Software"
optsidian para-zk:create-resource title="Source Paper"
```

## Nested Areas

An area can live under another area. Nested areas are still `type: area`; the `parent` field is what makes them nested.

```bash
optsidian para-zk:create-area title="Robot" parent_title="AI"
```

For deeper nesting, use `parent_title` plus a `child=` drill into that parent:

```bash
optsidian para-zk:create-area title="Vision" parent_title="AI" child='["Generation"]'
```

This nests **Vision** inside `AI/Generation/` — `child` drills into AI's existing child *Generation*, then creates Vision there.

## Props Block

PARA-ZK notes render an inline props block for frontmatter fields. You can edit status, priority, areas, dates, resource provenance, and ZK maturity from a compact control grid instead of editing raw YAML.

Project props include fields such as:

- `status`
- `priority`
- `areas`
- `start_date`
- `due_date`
- `done_date`

> [!tip]
> The CLI uses the same stable keys, for example `key=frontmatter/status` or `key=frontmatter/areas`.

## Alias / Call-Name

Projects, resources, and permanent ZK notes can show a single editable alias in the props header.

This is backed by Obsidian's native `aliases` frontmatter as a one-item list. A short code such as `NF-MTE` can resolve through `[[NF-MTE]]`, the quick switcher, and search without renaming the file.

## References Registry

PARA-ZK stores references in a note's frontmatter `references` array and renders them through the references block.

You can:

- Add an existing note, file, URL, wikilink, markdown link, or text reference.
- Reorder references.
- Edit a link or description.
- Delete a reference.
- Create a resource note from the reference workflow when the source deserves its own note.

CLI example:

```bash
optsidian para-zk:add-reference type=project title="Model Evaluation" target="https://example.com/paper" description="Source paper"
```

## Tasks Block

Tasks live in PARA-ZK's managed task registry and render back into the root note.

The task block supports:

- Add task
- Filter by status and priority
- Change order
- Drag-reorder
- Edit and delete tasks

CLI task reads and updates use stable task IDs:

```bash
optsidian para-zk:read-project title="Model Evaluation" key=tasks priority=high
optsidian para-zk:update-project title="Model Evaluation" key=tasks op=insert value_json='{"name":"Review evaluation set","priority":"high"}'
```

## Retros

Retros are weekly notes, optionally scoped to a project or area.

```bash
optsidian para-zk:create-retro source_type=project source_title="Model Evaluation"
```

Project notes surface the latest retrospective summary with a native `para-zk-latest-retro-summary` block, so current project context stays close to recent review notes.

## Home Dashboard

Setup creates a Home dashboard under `Dashboard/HomePage`. It gives quick access to PARA-ZK actions, summary metrics, and the main project, area, resource, task, and ZK views.

The Homepage dependency can open this dashboard on startup and when the workspace is empty.
