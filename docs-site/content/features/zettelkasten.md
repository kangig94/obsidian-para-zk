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

By default, the spark stays in place, is marked `processed: true`, and records the permanent in `distilled_to`. Pass `discard=true` to move the spark to Obsidian trash instead. The permanent never references the ephemeral spark.

## Inline Citations

Use inline citation tokens to cite the note's reference registry from the body.

````markdown
`PZ[abc123]`
`PZ[abc123, def456]`
`PZ[abc123#Training Loop]`
````

The value inside `PZ[...]` is the reference's stable `id`, returned by `read ... key=references`. It is not the visible registry position. A section suffix such as `#Training Loop` or `#^block-id` points the citation at a heading or block inside the referenced note.

Inline citations work in both reading view and Live Preview. In Live Preview, the raw token is visible while the cursor is inside it, and the rendered citation appears otherwise.

> [!warning]
> Positional input such as `` `PZ[0]` `` is not supported. The stored id stays stable across reference reorders; only the rendered `[n]` display follows the current registry position.

## Backlinks And Cited By

PARA-ZK relies on Obsidian-resolved links for reverse relationships. A note does not store every note that cites it.

Read backlinks from automation with:

```bash
optsidian para-zk:read-zk title="Stable Interface Contracts" kind=permanent key=backlinks
```

Use *Cited by* views to see notes that point at the current resource, digest, spark, or permanent.
