---
name: import-resource
description: "Create a clean, well-structured PARA-ZK resource note from a file, URL, web research, or your own synthesis. Use when asked to import, translate, research, or compile something into the vault as a resource."
argument-hint: "<what to create> [from a file/URL/the web] [+ where to link it]"
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

## 1. Understand the request

Decide three things before acting:
- **Source** — a local file path? a single URL? open web research (find and cross-check
  several sources)? or synthesis from what you already know?
- **Transform** — verbatim copy · translation · summary-with-citations · synthesis ·
  structured organization.
- **Output shape** — one resource, or several (e.g. one per chapter, one per item), and how
  they should link to each other / to an area or project.

If the shape is ambiguous (e.g. "10 cases" — one compiled note or ten notes?), pick a sensible
default and state it; ask only if the choice materially changes the result.

## 2. Orient

Call `describe` first (`optsidian para-zk:describe format=json`); use its `invoke` string
for every call, its `vault` context, and `para-zk:describe type=resource` for the create
command + inputs. Identify the note(s) to link from (area / project / resource).

## 3. Gather

- **Local file** → read it.
- **Single URL** → fetch it.
- **Web research** → search authoritative sources, cross-check facts, collect citations
  (prefer primary/official sources; for papers, arXiv/DOI).

**Prefer an HTML/text rendering over a PDF.** Converting a PDF to Markdown is slow and
lossy, so when the same source exists as HTML or Markdown, fetch that instead — even if you
were handed a PDF link. For arXiv papers, use the HTML view (`https://arxiv.org/html/<id>`,
or `https://ar5iv.org/abs/<id>`) first. If citations or the bibliography are unresolved
(`\cite{...}`, citation keys like `[zhang2022kinematic]`, `\printbibliography`, missing
References), fetch the arXiv source bundle and use its `.tex`, `.bbl`, or `.bib` files to
restore the paper's numbered citations and bibliography entries. Use PDF text extraction only
as a fallback, and OCR only when there is no usable text/source.

Record source provenance for everything (URL, file path, identifier, date, license/permission
where relevant). The four core fields go in the resource **frontmatter** at create time (see step 6):
`url`, `first_author`, `license`, `kind` — `license` as an SPDX identifier (short recognizable
token like `arXiv` when none fits, never a long sentence), `kind` as a code. Keep any extra detail
(DOI, version, other URLs) in a short body provenance section only when useful. Do not add routine
transform notes such as "translated", "converted", or "cleaned" unless the user explicitly asks for
that metadata or it is needed to avoid ambiguity. For images:
- A **web** image → embed it by its source URL with `![alt](https://…)`; Obsidian renders
  remote images inline, so do **not** download or attach it.
- A **local** image (from a local-file source) → `optsidian para-zk:attach-file
  source=<abs-path> folder=assets/<slug> format=json`, then embed the returned `![[…]]`.

## 4. Produce clean Markdown — never a raw dump

Apply the transform faithfully, and always make the form tidy:
- **Verbatim import** → preserve text and structure exactly; fix only conversion artifacts.
- **Translation** → faithful translation, same structure; cite the original source. Do not add a
  visible translation label, title postfix, or transform note unless the user asks for one.
- **Research / synthesis** → organize into clear sections; attribute facts to their sources;
  mark anything uncertain or unverified; do not invent.

For translation requests, do the translation **yourself**, in context — never route the text
through an external machine-translation engine or tool (Google Translate, DeepL, a translation
API or `trans`-style CLI); only your own translation can apply the rules below, and a generic MT
pass yields translationese and mangles terminology, math, and citations.

Preserve the source's structure, argument flow, and domain precision, and **default to
translating** — render each term the way the source's field actually publishes it in the target
language. Keep the source-language form only for atoms with no settled target-language
equivalent: proper nouns, acronyms, mathematical symbols, units and metrics, code-/API-facing
identifiers, and method/model/architecture names the field itself leaves untranslated (e.g.
*Diffusion Policy*, *ResNet*). Everything else — a field's everyday research vocabulary — is
translated; being technical or sitting next to a formula is **not** a reason to keep a word (for
an ML paper: observation, demonstration, learning, policy, action, task, inference, success rate,
manipulation). This test is **relative to the source's field**, so apply it the same way in
economics, law, or biology.

**Decide each recurring term once and apply it uniformly**; never alternate between the source
word and its translation for the same concept. Inflect the sentence naturally around any kept
source term rather than producing translationese. Do not invent terminology, over-localize,
simplify beyond what was asked, or add bilingual glosses. Preserve equations, symbols, citations,
tables, and figure references unless instructed otherwise. Keep citation markers in the body
(`[27]`); resolve bare citation keys back to the paper's numbered form, and do not rewrite
`introduced in [27]` as "Zhang et al." unless the source itself does.

Across all of them: real headings (`#`/`##`), valid Markdown tables (no empty cells, no
equations trapped in cells), math as LaTeX (`$…$`), figures embedded (web images by URL,
local images attached), boilerplate dropped. Source provenance lives in the frontmatter (step 6);
only when there is useful overflow detail beyond `url`/`first_author`/`license`/`kind` (DOI,
version, extra URLs) add a short **Source / provenance** section at the top — otherwise omit it.

For verbatim imports and translations, include the source's own References/Bibliography section
in the body unless the user asks to omit it. Numbered in-text citations and bibliography entries
(`[1]`, `[2]`, …) stay plain text — keep each entry as its own plain line `[1] …`. Never write
them as a `- [1]` list item: Obsidian renders `- [x]` whose bracket holds a single character
(so `- [0]` through `- [9]`) as a task checkbox, silently turning a bibliography into a to-do
list. These are the source's content, not the note's reference registry — do **not** copy them
into PARA-ZK `references`. That registry holds only the connections the vault owner deliberately
curates (the area/project it belongs to, related vault notes); leave it to them to register the
few they want, as `[[wiki]]` links to notes they actually keep.

## 5. Correction & verification pass — DO NOT SKIP

Re-read each note and repair: conversion artifacts, broken/empty table cells, stray HTML,
duplicated headers, dangling markers; verify claims and that links resolve. The note must read
as hand-written, not auto-generated. This is the step most often skipped — it is the point of
this skill.

## 6. Store (shell-safe) and link

For each resource, write the cleaned body to a temp file and create it with a file-backed body
(avoids shell-mangling of long/multiline content; use an absolute path), recording provenance in
the structured frontmatter:

```
optsidian para-zk:create-resource title="<title>" body=@/tmp/<file>.md \
  url="<source url>" first_author="<first author>" license="<SPDX id>" kind=<paper|article|book|video|web|code|guide|other> \
  format=json
```

`license` is an SPDX identifier (`MIT`, `Apache-2.0`, `CC-BY-4.0`, `CC-BY-SA-4.0`, `CC0-1.0`, …); when
no SPDX id fits use a short recognizable token (e.g. `arXiv` for an arXiv-default paper), never a long
descriptive sentence. `kind` is one of the codes shown. Omit any field you cannot determine — don't guess.

Then link as requested. To make an existing note reference a resource — e.g. "add a ref to the
AI area":

```
optsidian para-zk:update-area title="AI" key=references op=insert value_json='{"link":"[[<resource title>]]"}' format=json
```

For a child receiver, use `para-zk:update-child root_type=<project|area> root_title="<root>" relpath='<ancestors>' title="<child>" key=references op=insert value_json='{"link":"[[<resource title>]]"}' format=json`.

For multiple resources (per chapter, per item), create each and link them into the requested
hub — an area, a project, or an index resource — so the set is navigable.

## 7. Verify

Run `para-zk:read-resource title="<title>" key=body format=json` and re-scan for artifacts;
confirm links via the origin note's `key=references` and the resource's `key=backlinks`. Fix and
repeat if anything is still broken.

## Examples

- `find the paper "Attention Is All You Need", add it as a resource, and add a ref from the AI area`
  → web research → arXiv → verbatim import (math/figures) → one resource → ref from the AI area.
- `read /path/to/report.html and add it as a resource translated to Korean`
  → local file → translation → one resource (cite the original).
- `add a resource per chapter following a study path for "Principles of Statistics"`
  → research/synthesis → several per-chapter resources → linked from a study area/index.
- `find every Seoul subway line and write one organized resource`
  → web research → structured synthesis with sources → one organized resource.

## Notes

- Prefer `para-zk:describe` / `<command> help=true` for exact argument names over assuming.
- `body=@<file>` is read by the plugin, so it works through optsidian and the native `obsidian`
  CLI alike; pass an **absolute** path.
- Keep `title` stable — links and backlinks address notes by name.
