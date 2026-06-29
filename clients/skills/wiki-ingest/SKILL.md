---
name: wiki-ingest
description: "Use when ingesting canonical PARA-ZK sources into the LLM-Wiki — per-import, delta, init, or targeted re-ingest."
argument-hint: "mode=<init|delta|per-import|re-ingest>"
---

# Wiki Ingest

Orchestrate a bounded LLM-Wiki ingest run as **Plan → Fill → Synthesize**: YOU (the orchestrator)
read the candidates' structure and the existing wiki and decide the whole page structure first, then
spawn one `wiki-weaver` per planned page to fill it in parallel, then a hub pass builds the navigable
spine. The weaver is `para-zk:wiki-weaver` in Claude Code, `wiki-weaver` in Codex (after running the
bundled `codex-setup` skill).

## Context

LLM-Wiki pages are LLM-owned derived synthesis under `LLM-Wiki/`; canonical knowledge stays in
Resources, PARA, and ZK notes. The wiki is a **compounding, interlinked web of concept pages** drawn
from the WHOLE canonical base (resources, digests, permanents, subnotes) — pages cross-link, a rich
source spans several pages, and each ingest extends existing pages rather than mirroring sources 1:1.

Cohesion (the right page set, the right granularity, consistent domains, a navigable spine) is a
GLOBAL property, so **you decide it yourself, up front, before any page is written** — and you do it
HERE in the orchestrator (not in a sub-agent) precisely because you hold THIS conversation: the plan
must reflect what the user actually wants (what to include/skip, domain preferences). You discover
the source set, read each candidate's HEAD (a bounded structural peek — not the full body) plus the
existing wiki, and produce one global plan: the page set, domains, granularity, source→page
assignments, cross-links, and the spine. Then you spawn one `wiki-weaver` per planned page. Weavers
do the heavy work — full-body reads and the actual writing (`create-llm-wiki`/`update-llm-wiki` with
`by=<model-id>`) — but never decide which pages exist, so they cannot diverge on domains, over-split
a source into micro-pages, or duplicate concepts. You never write wiki prose or read full bodies; you
never edit source notes. Wiki prose mirrors the user's OWN language register, which the weavers
derive from the material.

## Argument Routing

`mode` (required) selects what to discover. `init`/`delta` take no source args; `per-import`/`re-ingest`
require one of `source_path` or `source_paths`, passed through to `para-zk:wiki-ingest-candidates`.

| `mode` | Targets |
|--------|---------|
| `init` | all ingestable sources missing an incoming LLM-Wiki citation |
| `delta` | new/uncited sources + sources whose `updated` is newer than the LLM-Wiki pages citing them (best-effort, via `updated` timestamps; force-refresh a known change with `re-ingest`) |
| `per-import` | exactly the given `source_path`/`source_paths` |
| `re-ingest` | exactly the given `source_path`/`source_paths`, even if already cited/fresh |

On invalid args (source args with `init`/`delta`, or none with `per-import`/`re-ingest`), stop with
the concrete routing error — do not ask the user.

## Execution

1. **Orient**: Run `optsidian para-zk:conventions` ONCE first for this task, then call
   `optsidian para-zk:describe` / `optsidian para-zk:describe type=<t>` as reference. Use the
   returned invocation style for subsequent `para-zk:*` calls. Examples below use `optsidian`;
   substitute the native `obsidian` CLI (`obsidian para-zk:…`) when `optsidian` isn't installed —
   the two are interchangeable, so use whichever is on `PATH`.
   Confirm the surface exposes `para-zk:wiki-ingest-candidates`, `para-zk:list`,
   `para-zk:read-llm-wiki`, `para-zk:create-llm-wiki`, and `para-zk:update-llm-wiki`. If the vault
   is unavailable, stop with the CLI error; do not fall back to direct file writes.

2. **Resolve mode**: Normalize exactly one mode from `{per-import, delta, init, re-ingest}`. Preserve
   `limit`/`offset` when supplied. For targeted modes, preserve exactly one of `source_path` or
   `source_paths`; for untargeted modes, reject either source selector before doing any reads.

3. **Discover candidates**:

   ```bash
   optsidian para-zk:wiki-ingest-candidates mode=<mode> [source_path=<path>|source_paths='<json-or-comma-list>'] [limit=<n|all>] [offset=<n>]
   ```

   Gate on the envelope. Candidate reasons are `missing_wiki_citation` or `source_newer_than_wiki`;
   candidates may include `stale_llm_wikis: [{path,title,updated_ms}]` (the citing LLM-Wiki pages
   older than the source). If `ok` is false or the command errors, stop. If `returned` is `0`, report
   that none were returned and stop. If `has_more` is true, plan/ingest only the returned page and
   report that another bounded page remains; do not auto-page into a full scan. Collect candidate
   `path`s and any `stale_llm_wikis`; for subnote candidates, collect their parent project/area note
   paths as framing `context`.

4. **Plan** (you, the orchestrator — inline): read enough to decide the global page structure, then
   decide it.
   - **Read the head of each candidate** — `optsidian read path="<path>" lines=1:200` (frontmatter +
     abstract + lead/early sections). If the head does not make the source clear enough to classify,
     read FURTHER (more line windows, or `grep '^#{1,6} '` for its headings) until you understand it
     well enough to place it — reading more of a source when you need it is fine. You just don't
     routinely page whole bodies for every source (that's the weaver's job and would overflow you).
   - **Read the existing wiki**: `optsidian para-zk:list type=llm-wiki limit=all` for the complete
     roster (every `<domain>/<concept>` path → the domains already in use). Then, for the domains the
     candidates touch, **read that domain's `<domain>/index` hub FIRST** (`read-llm-wiki title="<domain>/index"`)
     — it is the area map and the cheapest way to learn the domain's structure; only read individual
     concept pages when the index is insufficient.
   - **Decide the plan**, applying these rules:
     - **Granularity:** a PAGE is a concept that recurs across ≥2 sources OR is a canonical,
       standalone concept/method/system. A one-off mechanism from a single source is a **section
       within** a broader page, listed in that page's `sections` — NOT its own page. A per-source
       SUMMARY page (`type:"source-summary"`) only when a work is distinct enough that concept pages
       do not cover it. Project-operational / ephemeral material (status memos, test logs, trip
       checklists) is NOT a concept — skip it (record why) or fold under a project hub. Prefer FEWER,
       denser pages.
     - **Domains:** one level, `<domain>/<concept>`. Treat a domain as a stable research lineage,
       problem area, or system family that can sustain a useful hub — not as a universal umbrella.
       Avoid vague catch-all domains such as `ai`, `ml`, `research`, or `papers` unless the existing
       wiki already uses one coherently and the candidate truly cannot fit a narrower lineage. For
       broad corpora like "LLM papers", infer the corpus axes from the sources and prefer the
       narrowest stable domain that can hold multiple pages (for example `scaling-laws`,
       `chain-of-thought`, `mixture-of-experts`, `retrieval-augmented-generation`, `alignment`, or
       `language-models`). A method name becomes a domain only when it has enough internal structure
       for multiple child pages; otherwise keep it as a concept page under a broader domain. A
       one-page domain is acceptable only when it names a durable area expected to grow or when the
       existing wiki already uses it as a necessary bridge; otherwise prefer a concept page under the
       nearest coherent domain. REUSE a roster domain when a concept fits; mint a new domain only for
       a genuinely new area; never near-synonyms (`RL` vs `Reinforcement Learning`). Before finalizing
       each new domain, write a one-sentence domain rationale in the plan guidance: what stable
       lineage/problem area it represents, expected child concepts, and why it is not better placed
       under an existing broader/narrower domain. One concept = one page across the whole wiki.
     - **Assignment & cross-links:** assign every candidate source to ≥1 page (a source spanning N
       concepts goes into N pages' `sources`); set each page's `links` to the related pages.
     - **Spine:** every domain's hub is `<domain>/index` (create-llm-wiki auto-mints it as an empty
       scaffold when the domain's first page is created, so it always exists — you don't create it).
       Plan it as `type:"hub"` with `title="<domain>/index"` and `children` = that domain's leaf
       titles, for the Synthesize pass to FILL. Add an entity hub (descriptive title) for a large
       sub-cluster when it helps.
     - **Honor THIS conversation:** include/exclude and domain choices the user expressed here win.
   - Produce the page list — each page `{title, type, existing, sources, sections, links, children,
     guidance}` (`type` ∈ `concept`|`source-summary`|`hub`) — plus a `skipped` list with reasons.

5. **Fill** (leaf pages): for EACH planned page with `type` `concept` or `source-summary`, spawn one
   `wiki-weaver`, IN PARALLEL, with a `WeavePacket`:

   ```json
   { "mode": "<mode>", "by": "<model-id>", "page": <the planned page object>,
     "plan_pages": ["<every planned page title>", "..."], "context": ["<parent note path>", "..."] }
   ```

   Inject `by` from your current model id; `plan_pages` is every planned title so a weaver's
   cross-links resolve to real (current or about-to-exist) pages. One weaver owns one page → leaf
   pages do not contend. If a weaver reports `remaining_sources` (a context boundary), spawn a FRESH
   weaver for the SAME page with the remaining paths (its compare-and-swap writes make continuation
   safe). Do not post-process a weaver's writes.

   Claude Code spawn shape:

   ```text
   Agent({ subagent_type: "para-zk:wiki-weaver", run_in_background: true,
           prompt: "Fill this WeavePacket's one page and report per your Output Format.\n\n<WEAVE_PACKET_JSON>" })
   ```

   Codex (after `codex-setup` has installed the custom agents into `~/.codex/agents/`; if `wiki-weaver`
   is unavailable, stop and tell the user to run `codex-setup`, then restart Codex):

   ```text
   Spawn a `wiki-weaver` subagent: "Fill this WeavePacket's one page and report per your Output Format.\n\n<WEAVE_PACKET_JSON>"
   ```

6. **Synthesize** (spine): AFTER the leaf weavers complete (hubs link pages that must already exist),
   spawn one `wiki-weaver` in hub mode for EACH planned `type:"hub"` page (the per-domain
   `<domain>/index`, plus any entity hub) — same packet shape; a hub `page` carries `page.children`
   (planned page titles) and no `sources`. The weaver fills the hub as a RELATIONAL MAP of the area
   (grouped children, a one-line gist each, and how they relate) — the LLM's substitute for the graph
   view it cannot see. For targeted modes, this refreshes only the hubs your plan lists.

7. **Report launch**: Return the mode, the plan summary (counts of concept / source-summary / hub
   pages, sources assigned vs `skipped`), whether `has_more` was true, and the weaver launch
   handle(s). The observable write contract is the weavers' direct page writes succeeding.

8. **Verify on completion (clean-context pass)**: When the weavers finish, read the touched pages
   (`read-llm-wiki key=body` each). You never generated this prose, so this catches generation slips.
   Fix high-confidence orthographic/generation slips in place — malformed Korean syllables where a
   wrong 받침/jamo yields a well-formed but wrong word (궤적→궁적, 댄스→댓스, 앉기→앙기) — via
   `update-llm-wiki key=body op=replace by=<model-id>`. Surface (do NOT auto-apply): ambiguous
   corrections, any `unplanned_concepts` weavers reported (so the user can decide whether to plan a
   page for them next run), and any semantic findings (contradictions, a leaf missing from its hub,
   missing cross-references). If the touched-page volume would bloat your context, isolate this pass
   in a freshly spawned verifier sub-agent — but still report rather than auto-apply. (A whole-wiki
   health sweep is the separate, human-requested `wiki-lint`, not part of ingest.)

9. **Fold in conversation-derived insight (optional, human-judged)**: The background weavers only saw
   their packets. If THIS conversation surfaced a genuine, wiki-worthy insight the source bodies alone
   do not capture (a synthesis, a key tension, a correction the user raised), fold it into the relevant
   touched page(s) via `update-llm-wiki key=body op=... by=<model-id>` after verification, citing any
   canonical source as a backtick `` `PZ[id]` ``, keeping links single-direction, and writing any formula
   as Obsidian MathJax (`$…$`/`$$…$$`, single backslashes, never backtick-wrapped or `\(...\)`/`\[...\]`). Guardrails: ONLY
   genuine user-surfaced insight — never invent, embellish, or inject tangential conversation; if
   unsure whether it belongs, surface it to the user instead of writing it; if nothing genuine
   emerged, skip. Report what was folded in.
