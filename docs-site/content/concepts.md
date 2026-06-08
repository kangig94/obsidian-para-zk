---
title: Concepts
---

PARA-ZK combines two systems: PARA for organizing responsibilities and Zettelkasten for developing ideas.

## PARA

PARA keeps notes by how they are used:

- **Projects** are active outcomes with a finish line.
- **Areas** are ongoing responsibilities or domains.
- **Resources** are reusable source material.
- **Archives** hold inactive or completed PARA notes.

Projects and areas are folder-style notes: the note lives inside a folder of its own name. Child notes live in that folder and point back to their parent through frontmatter.

## Zettelkasten

PARA-ZK uses three ZK note kinds:

- **Spark**: a fast, raw thought to process later.
- **Digest**: your own-words notes from an external source.
- **Permanent**: an atomic idea that belongs in your long-term knowledge web.

Spark and digest notes are inputs. Permanent notes are the durable output.

## Single-Direction Links

When PARA-ZK creates a ZK note from another note, the new note references its origin. The origin is not edited to store a reverse link.

Instead, the origin surfaces the relationship through backlinks and its *Cited by* view.

> [!note]
> This keeps source notes stable. The new note carries the citation, and Obsidian resolves the reverse relationship.

## Distilling Sparks

Distilling turns a spark into a new permanent note:

```bash
optsidian para-zk:distill-spark source_title="Raw Thought" title="Durable Thought" maturity=evergreen
```

By default, the spark is kept and marked `processed: true`. It also records the created permanent in `distilled_to`. You can discard the spark during distill with `discard=true`.

## Where To Go Next

- [[features/para|PARA workflows]]
- [[features/zettelkasten|Zettelkasten workflows]]
- [[features/journal|Daily journal]]
