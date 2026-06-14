---
name: wiki-lint
description: "Use only when the user explicitly asks to lint or health-check the LLM-Wiki. Never run it as part of ingest or normal wiki work."
argument-hint: "[mode=<full|scoped>]"
---

# Wiki Lint

Health-check the LLM-Wiki and report findings. This is **invocation-gated** — run it ONLY when the user explicitly asks to lint/health-check the wiki. It is NOT part of ingest and must never run automatically during normal wiki operations.

## Context

The LLM-Wiki is a compounding, interlinked web of LLM-owned concept pages under `LLM-Wiki/`. Over time it can drift: orphaned concepts, contradictions between pages, missing cross-references, and — because LLMs generate non-Latin (CJK) prose with sub-syllable tokenization — **well-formed-but-wrong syllables** (a wrong jamo/받침 yields a real but wrong word, e.g. 궤적→궁적, 댄스→댓스). Lint surfaces these.

Two layers:
- **Structural** (deterministic, 0 LLM tokens) — delegated entirely to `para-zk:audit`. Never re-implement these checks here.
- **Semantic** (the core of this skill) — a **fresh-context read pass** over page bodies. The decisive property is context freshness, not model identity: an agent re-reading prose IT generated stays primed (reads intended, not actual) and misses most slips; a reader with no generation context for these pages reliably catches them. So the reader MUST NOT be the agent that wrote the pages (never the wiki-weaver). The skill orchestrator qualifies if it did not itself generate the prose; otherwise spawn a fresh reviewer.

**Report-only**, with one exception: high-confidence *mechanical* orthographic slips (a clear non-word with one obvious correction) are fixed in place via `update-llm-wiki ... op=replace`. Everything ambiguous or semantic (contradictions, missing concepts/cross-refs, data gaps, uncertain corrections) is **reported to the user** — never auto-rewritten (auto-rewriting prose re-introduces generation errors). Semantic remediation routes to `para-zk:wiki-ingest` re-ingest or a manual edit, at the user's discretion.

## Argument Routing

| Argument | Mode | Routing |
|----------|------|---------|
| `mode=full` (default) | `full` | Lint every page under `LLM-Wiki/`. Bounded: the wiki fits in context at moderate scale; for a large wiki, process pages in bounded batches and chain, always reporting coverage. |
| `mode=scoped paths=<json-or-comma-list>` | `scoped` | Lint only the listed `LLM-Wiki/` pages (e.g. the pages a recent ingest touched). `paths` is required for `scoped`. |

`mode` defaults to `full`. Reject `paths` for `full`. Do not ask the user to resolve invalid arguments; stop with the concrete routing error.

## Execution

1. **Orient**: Call `optsidian para-zk:describe format=json` first; use the returned invocation style for subsequent `para-zk:*` calls. Confirm the surface exposes `para-zk:audit`, `para-zk:list`, `para-zk:read-llm-wiki`, and `para-zk:update-llm-wiki`. If the vault is unavailable, stop with the CLI error.

2. **Resolve scope**: For `full`, enumerate pages with `optsidian para-zk:list type=llm-wiki limit=all format=json`. For `scoped`, use the provided `paths` (reject if empty).

3. **Structural pass (deterministic, free)**: Run `optsidian para-zk:audit limit=all format=json` and keep findings on llm-wiki pages — `orphan_wiki_page`, `upward_wiki_link`, `broken_link`, `dangling_reference`, `idless_reference`. These are report-only here (id-less references are separately auto-fixable by the user via `para-zk:audit fix=true`). Do NOT re-derive them in the semantic pass.

4. **Semantic pass (fresh-context read)**: Read the target pages' bodies and detect, per page and across pages: orthographic/generation slips (malformed CJK/non-Latin syllables); cross-page contradictions; concepts that warrant their own page but lack one; missing cross-references between related pages; and data gaps. Choose the reader by context-freshness:
   - If you (the orchestrator) did NOT generate these pages this session, read them directly: `optsidian para-zk:read-llm-wiki title=<title> key=body format=json`.
   - If the page set is large (a full sweep on a big wiki) or you orchestrated their generation this session, spawn ONE fresh general-purpose reviewer agent (clean context, no generation history) and have it drive the vault through `mcp__optsidian__command_run` (a sandboxed sub-agent cannot reach Obsidian over Bash). Pass it the page list and this report/fix policy.
   - Never let the wiki-weaver (or any agent that just wrote these pages) lint its own output.

5. **Fix policy**: Fix ONLY high-confidence mechanical orthographic slips — a clear non-word with one obvious correction from context — in place: `optsidian para-zk:update-llm-wiki title=<title> key=body op=replace match=<garbled> with=<fixed> by=<model-id> format=json`. Report (do NOT fix) every ambiguous correction and every semantic finding (contradiction, missing concept page, missing cross-reference, data gap). Never `op=set` a recomposed body to "fix" semantics — that re-runs generation and can introduce new slips.

6. **Inject `by`**: Use the orchestrator's current model id for `by=<model-id>` on any `op=replace` fix.

## Report

Return a structured report:

- **mode + coverage**: which pages were read (and, for a chunked large sweep, which remain) — never silently truncate.
- **structural** (from `para-zk:audit`): the wiki findings by code, with paths.
- **fixed** (auto-applied): page, and the `<garbled> → <fixed>` orthographic correction for each.
- **needs decision** (report-only): ambiguous orthographic corrections, and semantic findings (contradictions, missing concept pages, missing cross-references, data gaps) with page references and a one-line suggestion (e.g. re-ingest the source, add a cross-link, write a new concept page).

Do not commit, do not edit source notes, and do not auto-rewrite prose.
