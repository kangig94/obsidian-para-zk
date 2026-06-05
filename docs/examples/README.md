# PARA-ZK Free-Form Examples

These are reference exemplars for PARA-ZK's **free-form** note types (`resource`, `zk_fleeting`,
`zk_literature`, `zk_permanent`, child `doc`, fallback `note`). They are **not** templates — pressing
*Create ZK* / *Create resource* gives a **blank slate** (frontmatter + props block + managed tail, empty
body). These files show what a *well-formed* note of each kind looks like once you fill it in, so you (or an
LLM) can learn the intended shape without baking a rigid form into every new note.

Structured types (`project`, `area`, `retro`, `journal`) are the opposite: their template sections are
load-bearing stable keys and are enforced. See [../FIRST_READ.md](../FIRST_READ.md) for the dichotomy and
[../CLI.md](../CLI.md) for the read/write contract.

## The ZK maturity gradient

PARA-ZK's three ZK kinds form a capture → develop → publish pipeline:

| Kind | Role | Feel |
| --- | --- | --- |
| `zk_fleeting` | **Spark.** A thought caught the instant it strikes. | Raw, partial, a question, a "process later" note. Capture friction must be ~0. |
| `zk_literature` | **Refined idea.** The spark worked into *your own* clearer idea. | A few paragraphs of synthesis; links back to its origin spark; may still hold open questions. |
| `zk_permanent` | **Article-scale.** A fully developed, publishable piece. | Long-form prose with your own structure (headings, sections); self-contained. |

`promote-fleeting` carries a fleeting note up this pipeline and records the link in frontmatter
(`promoted_to`) — so you never need a prose "source" section: the origin link is structural.

## Why blank, not pre-filled

These captures span every domain — economics, coding, AI, study, reading, everyday observations. A
domain-specific scaffold (e.g. `# Highlight` / `# Evidence`) would be wrong for most notes and add friction.
Free-form keeps the body a single `body` surface: write whatever the idea needs (any headings are *content*,
not enforced keys), and edit it with literal `set`/`append`/`prepend`/`replace`.

## Files

- [`zk-fleeting.md`](zk-fleeting.md) — a raw spark.
- [`zk-literature.md`](zk-literature.md) — that spark refined into a personal idea (links the fleeting).
- [`zk-permanent.md`](zk-permanent.md) — the same idea expanded to article scale.
- [`resource.md`](resource.md) — a free-form resource (e.g. a translated paper) using its own `#` sections.

Bodies are illustrative; real notes also carry generated frontmatter (`id`, `created`, `updated`, tags) and
the managed tail.
