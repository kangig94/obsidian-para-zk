---
name: wiki-ingest
description: "Use when ingesting canonical PARA-ZK sources into the LLM-Wiki — per-import, delta, init, or targeted re-ingest."
argument-hint: "mode=<init|delta|per-import|re-ingest>"
---

# Wiki Ingest

Orchestrate a bounded LLM-Wiki ingest run and hand one scoped packet to `para-zk:wiki-weaver`.

## Context

LLM-Wiki pages are LLM-owned derived synthesis under `LLM-Wiki/`; canonical knowledge remains in Resources, PARA, and ZK notes. The wiki is a **compounding, interlinked web of concept pages** drawn from the WHOLE canonical base (resources, digests, permanents, subnotes): the weaver integrates each source into the concept pages it touches (one source commonly spans several) and cross-links related pages, rather than mirroring sources 1:1. This skill is the sole ingest orchestrator: it discovers the source set, hands the weaver the source PATHS and metadata — never the bodies, which the weaver reads itself from each path so no large body is funneled through (and silently truncated by) the packet — and spawns one direct-writer weaver, which self-gathers the LLM-Wiki side (`list type=llm-wiki` + read-by-title) — the skill pre-gathers no wiki pages, so the loop never depends on search recall. It never writes wiki prose itself, never validates or commits a returned plan, and never edits source notes. The weaver writes pages directly via `create-llm-wiki`/`update-llm-wiki` with `by=<model-id>`, and the page-body re-weave is the freshness event. Wiki prose mirrors the user's OWN language register — the dominant language and the English/local code-mixing pattern evidenced by the sources — which the weaver derives from the material; the skill imposes no language.

## Argument Routing

`mode` (required) selects what to discover. `init`/`delta` take no source args; `per-import`/`re-ingest` require one of `source_path` or `source_paths`, passed through to `para-zk:wiki-ingest-candidates`.

| `mode` | Targets |
|--------|---------|
| `init` | all ingestable sources missing an incoming LLM-Wiki citation |
| `delta` | new/uncited sources + sources whose `updated` is newer than the LLM-Wiki pages citing them |
| `per-import` | exactly the given `source_path`/`source_paths` |
| `re-ingest` | exactly the given `source_path`/`source_paths`, even if already cited/fresh |

On invalid args (source args with `init`/`delta`, or none with `per-import`/`re-ingest`), stop with the concrete routing error — do not ask the user.

## Execution

1. **Orient**: Call `optsidian para-zk:describe format=json` first. Use the returned invocation style for subsequent `para-zk:*` calls; examples below use `optsidian`. Confirm the surface exposes `para-zk:wiki-ingest-candidates`, `para-zk:create-llm-wiki`, `para-zk:read-llm-wiki`, and `para-zk:update-llm-wiki`. If the vault is unavailable, stop with the CLI error; do not fall back to direct file writes.

2. **Resolve mode**: Normalize exactly one mode from `{per-import, delta, init, re-ingest}`. Preserve `limit` and `offset` when supplied. For targeted modes, preserve exactly one of `source_path` or `source_paths`; for untargeted modes, reject either source selector before doing any reads.

3. **Discover sources**: Call the candidate primitive with the same mode and target arguments:

   ```bash
   optsidian para-zk:wiki-ingest-candidates mode=<mode> [source_path=<path>|source_paths='<json-or-comma-list>'] [limit=<n|all>] [offset=<n>] format=json
   ```

   Gate on the response envelope. Candidate reasons are `missing_wiki_citation` or `source_newer_than_wiki`; candidates may include `stale_pages: [{path,title,updated_ms}]`, the citing LLM-Wiki pages older than the source. For `delta` and any returned candidate with `stale_pages`, preserve that list so the weaver gets exactly which pages to re-weave for that source. If `ok` is false or the command errors, stop. If `returned` is `0`, report that no source candidates were returned and do not spawn the weaver. If `has_more` is true, weave only the returned page of candidates and report that another bounded page remains; do not auto-page into a full scan.

4. **Carry source metadata (do NOT read bodies)**: The skill passes candidate METADATA only — the weaver reads each source's FULL body itself from its `path` (so a large body is never funneled through, or silently truncated by, the packet). Build each source object straight from the candidate envelope as `{path,type,title,updated,updated_ms,stale_pages}` — no `body` field. A run is bounded by the NUMBER of sources (step 3's `limit`/`offset`), never by truncating any one body.

5. **Assemble packet**: The skill gathers only source METADATA (paths — not bodies, which the weaver reads itself); the weaver self-gathers the LLM-Wiki side (the skill pre-gathers no wiki pages and no index seed). Create one `WeavePacket` for the whole returned source set:

   ```json
   {
     "mode": "<per-import|delta|init|re-ingest>",
     "by": "<model-id>",
     "sources": [
       {"path": "...", "type": "...", "title": "...", "updated": "...", "updated_ms": 0, "stale_pages": [{"path": "...", "title": "...", "updated_ms": 0}]}
     ]
   }
   ```

   Inject `by` from the orchestrator's current model id; the weaver passes it to `create-llm-wiki` and `update-llm-wiki`. Do NOT pre-gather wiki pages or an index seed — the weaver discovers them via `list` so it never depends on search recall. Do not add a commit plan or any direct-write instructions for the skill itself. The packet carries DATA only (no `rules` block) — the weaver's read/write/filing/linking/citation behavior is defined by the `para-zk:wiki-weaver` agent and is not restated here.

6. **Spawn one weaver**: Spawn exactly one agent for the entire packet, in background when the host supports it:

   ```text
   Agent({
     subagent_type: "para-zk:wiki-weaver",
     run_in_background: true,
     prompt: "Weave this WeavePacket. Process its `sources` serially in packet order and report per your Output Format.\n\n<WEAVE_PACKET_JSON>"
   })
   ```

   The weaver processes all `sources` serially in its own context, integrating each in full. Do not spawn once per source — one weaver builds the compounding web across the batch so it can cross-link related sources in a single pass. If the weaver approaches its context limit before finishing the batch, it stops after the last fully-integrated source and reports which sources it completed and which remain; spawn a FRESH weaver for the remaining sources (rebuild their metadata per step 4). Bound work by source count and by chaining weavers — never by truncating a body. Do not post-process the weaver's writes.

7. **Report launch**: Return the mode, source count, whether `has_more` was true (another candidate page remains), and the weaver launch handle if the host provides one. If the weaver later reports a context boundary with sources still remaining, spawn a fresh weaver for the remainder. The observable write contract is the weaver's direct page writes (`create-llm-wiki`/`update-llm-wiki` succeeding).

8. **Verify on weaver completion (clean-context pass)**: When the weaver reports completion, the MAIN agent (the orchestrator that ran this skill — NOT the weaver) reads the weaver's `touched_pages` (`read-llm-wiki key=body` each). This is a clean detection pass: the main agent never generated this prose, so it catches generation slips the weaver — still carrying its full generation context — misses (its own inline self-review is unreliable). Fix high-confidence orthographic/generation slips in place — malformed Korean syllables where a wrong 받침/jamo yields a well-formed but wrong word (궤적→궁적, 댄스→댓스, 앉기→앙기) — via `update-llm-wiki key=body op=replace by=<model-id>`. Surface ambiguous corrections and any semantic findings (contradictions, missing concept pages, missing cross-references) to the user for a decision; do not auto-rewrite prose. If the touched-page volume would bloat the main context, isolate this pass in a freshly spawned verifier sub-agent instead — but still report ambiguous fixes rather than auto-applying them. (A full whole-wiki health sweep is a separate, occasional, human-requested review — not part of ingest.)

9. **Fold in conversation-derived insight (orchestrator, optional, human-judged)**: The background weaver only saw the WeavePacket — it has no access to this conversation. So if THIS conversation surfaced a genuine, wiki-worthy insight about the just-ingested sources that the source bodies alone do not capture (a synthesis, a key tension, a correction the user raised), the MAIN agent — which holds the conversation — folds it into the relevant touched page(s) via `update-llm-wiki key=body op=... by=<model-id>` after verification, citing any canonical source it draws on as a backtick `` `PZ[id]` `` and keeping links single-direction. This restores the gist's "discuss key takeaways → update pages" at the orchestrator level (the weaver cannot, having no conversation). Guardrails: ONLY genuine user-surfaced insight — never invent, embellish, or inject tangential conversation; if unsure whether it belongs, surface it to the user instead of writing it; if nothing genuine emerged, skip this step. Report what was folded in.
