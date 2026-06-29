---
name: import-resource
description: "Use when asked to import, translate, research, or compile something into the vault as a PARA-ZK resource note (file, URL, web, or synthesis)."
argument-hint: "<what to import> [from file/URL/web]"
---

# Import Resource

Turn a request into faithful, **clean** PARA-ZK resource note(s) — for any source and any
transform. The CLI provides the unit commands; this skill is how to combine them well. The
failure this skill prevents: producing a raw, unreviewed dump (HTML→text artifacts, broken
tables, ungrounded claims) and stopping there. The output must read as if written by hand.

## Context

The PARA-ZK vault is the user's private, local, single-user store — saving or compiling
material into it is personal-use note-taking, not redistribution; do not refuse on distribution grounds.
Be honest about provenance and uncertainty: never fabricate facts or
sources, and never silently rewrite an author's words when asked to preserve or translate.

## 1. Understand the request — and confirm the transform *before* gathering

Decide four things from the request:
- **Source** — a local file path? a single URL? open web research (find and cross-check
  several sources)? or a compile from what you already know?
- **Transform** — how to treat the source's content: **verbatim copy · translation ·
  summary (with citations)**. Cross-source synthesis and knowledge restructuring are NOT a
  resource transform — that is the LLM-Wiki's job and runs automatically in step 8
  (`wiki-ingest` → `wiki-weaver`); never "synthesize" the resource note itself.
- **Scope** — full source, selected sections/pages, abstract, or excerpt. For
  translation and verbatim imports, the default is **full source** unless the user explicitly
  asks for a summary, abstract-only, excerpt, or selected range.
- **Output shape** — one resource, or several (e.g. one per chapter, one per item), and how
  they should link to each other / to an area or project.

**Ask the transform up front — before any gathering.** When the request names a concrete
source ("import **X**") but does not say how to treat it, ask the user *immediately*, before
fetching, reading, or converting (those steps are slow; the user should answer right after
their request, not after a long wait). One question, dropping any choice the request already
fixed:

| Choice | Meaning |
| --- | --- |
| **Verbatim** (default) | Keep the source language and structure exactly; fix only conversion artifacts. |
| **Translation** | Faithful translation into the target language (default: the vault locale). For concrete sources, default scope is full source, not summary. |
| **Summary** | Condense to the essentials, with citations. |

Skip the question when the request already fixes the transform ("translate it", "summarize
it", "keep it verbatim") and proceed with that mode. The same three choices apply to a
**research / compile** request ("research **X** and import" — e.g. *find every Seoul subway
line and write one resource*): there, **verbatim** means reproducing the gathered source
passages faithfully (quoted and attributed, in their original language), **translation** the
same in the target language, and **summary** a condensed write-up with citations. Ask the
choice up front as usual; only the details that depend on what you find — the translation
target language, and the output shape — are confirmed once the material is in view.

For multiple concrete sources, create one translated/verbatim resource per source unless the
user requested a compiled overview. If the source set is large, proceed source-by-source and
report progress; ask about narrowing only when the user has not fixed the scope or completion is
practically impossible in the current run. For open-ended research, state the selected source set
once known before committing to the output set.

For multi-source imports, before starting each new source, re-state the active import contract
in one line: transform, scope, output title rule, source-language preservation rule, and
verification target. Do not reread this whole skill unless the source type changes or the
previous source revealed an ambiguity; when the type changes, read only the relevant reference
(for example PDF conversion).

If the **output shape** is ambiguous (e.g. "10 cases" — one compiled note or ten notes?), pick
a sensible default and state it; ask only if the choice materially changes the result.

## 2. Orient

The `para-zk:*` commands below are the PARA-ZK CLI, run through whichever Obsidian CLI is on
`PATH`: `optsidian para-zk:…` when `optsidian` is installed (preferred), or `obsidian para-zk:…`
on the native CLI when it is not — the two are interchangeable. The examples in this skill use
the `optsidian` prefix; substitute `obsidian` if that is what your environment has, and keep the
same prefix for every call.

Run `para-zk:conventions` ONCE first for this task, then call `para-zk:describe` /
`para-zk:describe type=resource` as reference for the create command + inputs. Use the returned
invocation style for every call. Identify the note(s) to link from (area / project / resource).

## 3. Gather

- **Local file** → read it.
- **Single URL** → fetch it.
- **Web research** → search authoritative sources, cross-check facts, collect citations
  (prefer primary/official sources; for papers, arXiv/DOI).

**Prefer a clean HTML/source rendering when one exists** — no extraction step, and exact
text, math, and citations. For arXiv papers, try the HTML view (`https://arxiv.org/html/<id>`
or `https://ar5iv.org/abs/<id>`) first; if citations/bibliography come through unresolved
(`\cite{...}`, keys like `[zhang2022kinematic]`, `\printbibliography`, missing References),
fetch the arXiv source bundle and use its `.tex`/`.bbl`/`.bib` to restore numbered citations
and the bibliography.

If the source itself is a PDF, or no clean HTML/source rendering exists, read
[references/pdf.md](references/pdf.md) before converting. Convert PDFs with marker via the
bundled script, then treat marker Markdown as a **draft**: repair residual extraction glitches,
attach useful extracted figures, and drop duplicate/debug images before applying the transform.

Record source provenance for everything (URL, file path, identifier, date, license/permission
where relevant). The four core fields go in the resource **frontmatter** at create time (see step 6):
`url`, `first_author`, `license`, `kind` — `license` as an SPDX identifier (short recognizable
token like `arXiv` when none fits, never a long sentence), `kind` as a code. Keep any extra detail
(DOI, version, other URLs) in a short body provenance section only when useful. Do not add routine
transform notes such as "translated", "converted", or "cleaned" unless the user explicitly asks for
that metadata or it is needed to avoid ambiguity. For images:
- A **web** image → embed it by its source URL with `![alt](https://…)`; Obsidian renders
  remote images inline, so do **not** download or attach it.
- A **local** image — from a local-file source, or a figure `marker` extracted from a PDF →
  `optsidian para-zk:attach-file source=<abs-path> folder=assets/<slug>`, then
  embed the returned `![[…]]`.

## 4. Produce clean Markdown — never a raw dump

Apply the transform faithfully, and always make the form tidy:
- **Verbatim import** → preserve text and structure exactly; fix only conversion artifacts.
- **Translation** → faithful full-source translation, same structure; cite the original source.
  Do not summarize, abridge, or omit sections unless the user explicitly asked for that. Do not
  add a visible translation label, title postfix, or transform note unless the user asks for one.
- **Research / compile** → gather across sources and organize into clear sections, applying
  the chosen transform to the content (verbatim quotes, translation, or summary); attribute
  facts to their sources; mark anything uncertain or unverified; do not invent. (This compiles
  a resource from research; cross-source knowledge synthesis is still the LLM-Wiki's job in
  step 8.)

For translation requests, do the translation **yourself**, in context — never route the text
through an external machine-translation engine or tool (Google Translate, DeepL, a translation
API or `trans`-style CLI); only your own translation can apply the rules below, and a generic MT
pass yields translationese and mangles terminology, math, and citations.

Preserve the source's structure, argument flow, and domain precision, but write natural
target-language technical prose. A translation is **not** transliteration, and not source
language with target-language particles attached. Keep the source-language form only for
source titles and identity-bearing technical names: paper/book/article titles,
model/method/architecture names, dataset and benchmark names, standard acronyms/initialisms,
proper nouns, symbols, units, code-/API-facing identifiers, citation keys, URLs, and method
names (e.g. *Attention Is All You Need*, *Diffusion Policy*, *ResNet*, *ImageNet*, *MMLU*).
Also keep the handful of ordinary terms the field itself conventionally writes in the **source
script** even though a target word exists (for ML, e.g. *epoch*, *gradient*, *baseline*,
*advantage*, *rollout*).

Translate ordinary prose and non-identity terms into the field's settled target-language form:
common nouns, verbs, adjectives, generic headings, and explanatory phrases should not remain in
the source language just because the topic is technical or near a formula. Use the target
field's standard word (observation, demonstration, learning, policy, action, task, inference,
success rate, manipulation) or, where the field writes a loanword, its standard transliteration
(benchmark, embedding, minibatch). For ordinary prose, **when unsure, translate**. For
identity-bearing names, preserve the source form.

**Decide each recurring term once and apply it uniformly**; never alternate between the source
word and its translation for the same concept. Inflect the sentence naturally around any kept
source term rather than producing translationese. Do not invent terminology, over-localize,
simplify beyond what was asked, or add bilingual glosses. Preserve equations, symbols, citations,
tables, and figure references unless instructed otherwise. Keep citation markers in the body
(`[27]`); resolve bare citation keys back to the paper's numbered form, and do not rewrite
`introduced in [27]` as "Zhang et al." unless the source itself does.

Preserve the full source title in the H1, alias, or provenance as requested; translate generic
section headings such as Introduction, Related Work, Method, Experiments, Results, Discussion,
Conclusion, and Appendix into the target language. Keep identity-bearing section titles in the
source language only for the named object portion. Do not infer translation style from existing
vault notes unless the user explicitly names a note as the style reference; use these rules and
the source text as the standard.

Across all of them: real headings (`#`/`##`), valid Markdown tables (no empty cells, no
equations trapped in cells), math as Obsidian MathJax LaTeX (`$…$` inline, `$$…$$` block;
do not use `\(...\)`/`\[...\]`), figures embedded (web images by URL,
local images attached), boilerplate dropped, and any dead intra-document **page-anchor scaffolding** stripped. Empty `<span id="page-N-M"></span>` anchors and the `[text](#page-N-M)` links that point at them do NOT resolve in Obsidian (the link renders as a dead "page-N-M not found" link), so strip every such anchor and delink every `[text](#page-N-M)` to its plain visible text (`그림 [1](#page-0-0)a` → `그림 1a`; a `[Author et al.](#page-13-0)` citation → `Author et al.`); a heading-embedded anchor also breaks PARA-ZK's `#heading` citation matching. Source provenance lives in the frontmatter (step 6);
only when there is useful overflow detail beyond `url`/`first_author`/`license`/`kind` (DOI,
version, extra URLs) add a short **Source / provenance** section at the top — otherwise omit it.

For verbatim imports and translations, include the source's own References/Bibliography section
in the body unless the user asks to omit it. Preserve bibliography entries in their original
bibliographic form, including paper/book titles; do not translate cited work titles inside
References. Numbered in-text citations and bibliography entries (`[1]`, `[2]`, …) stay plain text
— keep each entry as its own plain line `[1] …`. Never write them as a `- [1]` list item:
Obsidian renders `- [x]` whose bracket holds a single character (so `- [0]` through `- [9]`) as a
task checkbox, silently turning a bibliography into a to-do list. These are the source's content,
not the note's reference registry — do **not** copy them into PARA-ZK `references`. That registry
holds only the connections the vault owner deliberately curates (the area/project it belongs to,
related vault notes); leave it to them to register the few they want, as `[[wiki]]` links to notes
they actually keep.

## 5. Correction & verification pass — DO NOT SKIP

Before storing, re-read each draft and repair conversion artifacts, broken/empty table cells,
stray HTML, duplicated headers, dangling markers, bad math delimiters, and broken figure embeds.
The note must read as hand-written, not auto-generated.

For translations, do not treat artifact checks as quality checks. Compare the source and
translated draft for coverage: title, authors, abstract, every section/subsection, tables,
equations, figures/captions, appendices, acknowledgments, and references. Confirm that generic
headings and ordinary prose are target-language, identity-bearing names are preserved, and
References titles remain in the source language. If the result reads like source-language
sentences with target-language particles, rewrite it before storing.

## 6. Store (shell-safe) and link

For each resource, write the cleaned body to a temp file and create it with a file-backed body
(avoids shell-mangling of long/multiline content; use an absolute path), recording provenance in
the structured frontmatter:

For a paper resource title / filename, use the source's full title by default. Use a short title
only when the source is widely identified by the model, method, dataset, benchmark, standard, or
acronym it introduced (`Transformer`, `BERT`, `GPT-3`, `T5`, `DPO`, `RAG`), or when the source
title itself names the work in a `Name: descriptive subtitle` form (then use `Name`). Preserve the
full original source title in the body metadata/provenance. Do not invent a new abbreviation; if
no recognized representative name exists, use the original title.

```
optsidian para-zk:create-resource title="<title>" body=@/tmp/<file>.md \
  url="<source url>" first_author="<first author>" license="<SPDX id>" kind=<paper|article|book|video|web|code|guide|other> \
  domain="<subject domain>"
```

`license` is an SPDX identifier (`MIT`, `Apache-2.0`, `CC-BY-4.0`, `CC-BY-SA-4.0`, `CC0-1.0`, …); when
no SPDX id fits use a short recognizable token (e.g. `arXiv` for an arXiv-default paper), never a long
descriptive sentence. `kind` is one of the codes shown. `domain` is the subject group for the identity
tag — reuse an existing domain vocabulary; omit it for a flat resource tag. Omit any field you cannot
determine — don't guess.

Then link as requested. To make an existing note reference a resource — e.g. "add a ref to the
AI area":

```
optsidian para-zk:update-area title="AI" key=references op=insert value_json='{"link":"[[<resource title>]]"}'
```

For a child receiver, use `para-zk:update-child root_type=<project|area> root_title="<root>" relpath='<ancestors>' title="<child>" key=references op=insert value_json='{"link":"[[<resource title>]]"}'`.

For multiple resources (per chapter, per item), create each and link them into the requested
hub — an area, a project, or an index resource — so the set is navigable.

## 7. Verify

Run `para-zk:read-resource title="<title>" key=frontmatter` and `key=body` after creation. Confirm
metadata, body persistence, backlinks/references when linked, no dead page anchors, and Obsidian
math delimiters (`$…$`, `$$…$$`; no `\(...\)` or `\[...\]`). Fix and repeat if anything is still
broken.

## 8. Hand off to the wiki-ingest skill

`wiki-ingest` is a **skill, not a CLI command** — there is no `optsidian wiki-ingest` or
`obsidian wiki-ingest`. After
every resource in this import has been created, linked, and verified, **invoke the
`para-zk:wiki-ingest` skill** once for the whole created set: read its `SKILL.md` and carry out
its workflow yourself (or run the `/para-zk:wiki-ingest` slash command), background /
session-scoped. The inputs to that skill are:

```text
mode=per-import source_paths='["<created resource path>","<created resource path>"]'
```

(these are skill inputs, not shell arguments — do not pass them to `optsidian`). Use the `path`
returned by each `create-resource` result in this import. The wiki-ingest skill itself plans the
whole imported set and spawns the `wiki-weaver` subagents; do **not** spawn `wiki-weaver`
yourself, and do **not** invoke wiki-ingest once per file — one `per-import` hand-off covers the
entire set.

## Examples

- `find the paper "Attention Is All You Need", translate it to Korean, and add it as a resource`
  → web research → arXiv → title `Papers/LLM/Transformer` because the paper introduced the
  Transformer architecture and is widely identified by that representative name → full Korean
  translation with source title preserved and References titles left in English.
- `read /path/to/report.html and add it as a resource translated to Korean`
  → local file → translation → one resource (cite the original).
- `add a resource per chapter following a study path for "Principles of Statistics"`
  → research/compile → several per-chapter resources → linked from a study area/index.
- `find every Seoul subway line and write one organized resource`
  → web research → structured write-up with sources → one organized resource.

## Notes

- Prefer `para-zk:describe` / `<command> help=true` for exact argument names over assuming.
- `body=@<file>` is read by the plugin, so it works through optsidian and the native `obsidian`
  CLI alike; pass an **absolute** path.
- Keep `title` stable — links and backlinks address notes by name.
- The final hand-off invokes the `para-zk:wiki-ingest` **skill** (not a CLI command) once,
  background / session-scoped, with `mode=per-import` and all created resource paths in
  `source_paths`.
