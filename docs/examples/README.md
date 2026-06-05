# PARA-ZK Free-Form Examples

These are reference exemplars for PARA-ZK's **free-form** note types (`resource`, `zk_spark`,
`zk_source`, `zk_permanent`, child `doc`, fallback `note`). They are **not** templates — pressing
*Create ZK* / *Create resource* gives a **blank slate** (frontmatter + props block + managed tail, empty
body). These files show what a *well-formed* note of each kind looks like once you fill it in, so you (or an
LLM) can learn the intended shape without baking a rigid form into every new note.

Structured types (`project`, `area`, `retro`, `journal`) are the opposite: their template sections are
load-bearing stable keys and are enforced. See [../FIRST_READ.md](../FIRST_READ.md) for the dichotomy and
[../CLI.md](../CLI.md) for the read/write contract.

## The three ZK kinds

PARA-ZK's three ZK kinds are *roles*, not a single linear ladder. Two inputs (one internal, one
external) both feed the one durable output — **permanent**:

| Kind | Role | Feel |
| --- | --- | --- |
| `zk_spark` | **Spark.** A thought caught the instant it strikes (internal). | Raw, partial, a question, a "process later" note. Capture friction ~0. **Transient** — discarded once distilled. |
| `zk_source` | **Source.** *Your own-words digest* of an external source (paper, video, talk…). | Selective notes on what the source contributes, anchored to it. Durable input, not a verbatim copy. |
| `zk_permanent` | **Permanent.** *Your* atomic, self-contained idea, connected to your other ideas. | Novel **to your own knowledge web** (not necessarily to the world). The heart of the system — should be common. |

Two operations move notes here:

- **Distill** — `distill-spark` consumes a spark into a permanent note (the spark is then marked
  `processed: true` and discarded manually). A spark may yield several permanents.
- **Create** — `create-from-source` (from a source) and `create-from-resource` make a new note that
  **references** the durable origin. The origin is preserved; no reverse link is written back into it —
  the new note surfaces in the origin's *Cited by* view via Obsidian backlinks (single-direction linking).

Permanent ↔ permanent connections are made with **Add reference**; that web is where insight emerges.

## Why blank, not pre-filled

These captures span every domain — economics, coding, AI, study, reading, everyday observations. A
domain-specific scaffold (e.g. `# Highlight` / `# Evidence`) would be wrong for most notes and add friction.
Free-form keeps the body a single `body` surface: write whatever the idea needs (any headings are *content*,
not enforced keys), and edit it with literal `set`/`append`/`prepend`/`replace`.

## Files

- [`zk-spark.md`](zk-spark.md) — a raw spark.
- [`zk-source.md`](zk-source.md) — a source digest in your own words (references its origin).
- [`zk-permanent.md`](zk-permanent.md) — your atomic idea, connected to the rest of your notes.
- [`resource.md`](resource.md) — a free-form resource (e.g. a translated paper) using its own `#` sections.

Bodies are illustrative; real notes also carry generated frontmatter (`id`, `created`, `updated`, tags) and
the managed tail.
