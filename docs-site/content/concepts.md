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

## LLM-Wiki

`LLM-Wiki/` is a derived layer, not a second canonical knowledge base. Canonical knowledge lives in Resources, PARA notes, and ZK notes that a person may curate.

Wiki pages cite canonical notes through their `references` registry and backtick citation tokens such as `` `PZ[<id>]` ``. Wiki pages can link to each other with normal body `[[wikilinks]]`. Canonical notes should not link back into `LLM-Wiki/`; the wiki depends on the sources, not the other way around.

## Distilling Sparks

Distilling turns a spark into a new permanent note:

```bash
optsidian para-zk:distill-spark source_title="Raw Thought" title="Durable Thought" maturity=evergreen
```

By default, the spark is kept, marked `processed: true`, and records the created permanent in `distilled_to`. You can move the spark to trash during distill with `discard=true`. The permanent never references the ephemeral spark.

## Where To Go Next

- [[features/para|PARA workflows]]
- [[features/zettelkasten|Zettelkasten workflows]]
- [[features/journal|Daily journal]]
