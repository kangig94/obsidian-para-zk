---
title: Zettelkasten Workflows
---

PARA-ZK's Zettelkasten is built around three note kinds: spark, digest, and permanent.

## ZK Note Kinds

- **Spark**: quick internal capture. Sparks are transient and can be marked `processed: true` after distillation.
- **Digest**: your own-words summary or interpretation of an external source.
- **Permanent**: a durable, atomic idea connected to the rest of your notes.

Create a ZK note from Obsidian:

```text
PARA-ZK: Create ZK note
```

Or from the CLI:

```bash
optsidian para-zk:create-zk title="Stable Interface Contracts" kind=permanent maturity=refined
```

## Create From Sources

Resources and digest notes can become new ZK notes while preserving the origin.

```bash
optsidian para-zk:create-from-resource source_title="Source Paper" title="Paper Insight" kind=digest
optsidian para-zk:create-from-digest source_title="Paper Digest" title="Compounding learning" maturity=refined
```

The new note references the origin. The source remains unchanged and later shows the new note through backlinks and *Cited by* views.

## Distill A Spark

Distill when a spark contains an idea worth keeping:

```bash
optsidian para-zk:distill-spark source_title="Raw Thought" title="Durable Thought" maturity=evergreen
```

By default, the spark stays in place, is marked `processed: true`, and records the permanent in `distilled_to`. Pass `discard=true` to move the spark to Obsidian trash instead.

## Inline Citations

Use inline citation tokens to cite the note's reference registry from the body.

````markdown
`PZ[0]`
`PZ[0, 2]`
````

`PZ[0]` renders as a `[0]` link to the note's 0-th registry reference.

`PZ[0, 2]` renders independent `[0]` and `[2]` links. Each index points to the matching reference position.

Inline citations work in both reading view and Live Preview. In Live Preview, the raw token is visible while the cursor is inside it, and the rendered citation appears otherwise.

> [!warning]
> Citation indexes are positional. If you reorder the references registry, the rendered citation targets change with the new order.

## Backlinks And Cited By

PARA-ZK relies on Obsidian-resolved links for reverse relationships. A note does not store every note that cites it.

Read backlinks from automation with:

```bash
optsidian para-zk:read-zk title="Stable Interface Contracts" kind=permanent key=backlinks
```

Use *Cited by* views to see notes that point at the current resource, digest, spark, or permanent.
