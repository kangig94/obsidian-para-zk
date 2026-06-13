---
name: wiki-ingest
description: "Fold PARA-ZK canonical sources into the LLM-Wiki by resolving an ingest mode, discovering bounded source candidates, building a scoped WeavePacket, and spawning one direct-writer wiki-weaver agent. Use for per-import, delta, init, or targeted re-ingest LLM-Wiki ingestion."
argument-hint: "mode=<per-import|delta|init|re-ingest> [source_path=<vault-path>|source_paths=<json-or-comma-list>] [limit=<n|all>] [offset=<n>]"
---

# Wiki Ingest

Orchestrate a bounded LLM-Wiki ingest run and hand one scoped packet to `para-zk:wiki-weaver`.

## Context

LLM-Wiki pages are LLM-owned derived synthesis under `LLM-Wiki/`; canonical knowledge remains in Resources, PARA, and ZK notes. The wiki is a **compounding, interlinked web of concept pages** drawn from the WHOLE canonical base (resources, digests, permanents, subnotes): the weaver integrates each source into the concept pages it touches (one source commonly spans several) and cross-links related pages, rather than mirroring sources 1:1. This skill is the sole ingest orchestrator: it discovers the source set, gathers a bounded wiki neighborhood, and spawns one direct-writer weaver. It never writes wiki prose itself, never validates or commits a returned plan, and never edits source notes. The weaver writes pages directly via `create-llm-wiki`/`update-llm-wiki` with `by=<model-id>`, and the page-body re-weave is the freshness event. Wiki prose mirrors the user's OWN language register — the dominant language and the English/local code-mixing pattern evidenced by the sources — which the weaver derives from the material; the skill imposes no language.

## Argument Routing

| Argument | Mode | Routing |
|----------|------|---------|
| `mode=per-import source_path=<path>` | `per-import` | Target exactly the imported source path; pass `source_path` through to `para-zk:wiki-ingest-candidates`. |
| `mode=per-import source_paths=<json-or-comma-list>` | `per-import` | Target the imported source set; pass `source_paths` through unchanged. |
| `mode=delta` | `delta` | Discover new/uncited sources and sources whose `updated` is newer than the LLM-Wiki pages citing them (page-`updated` staleness), via the citation graph. Reject `source_path` and `source_paths`. |
| `mode=init` | `init` | Discover all ingestable sources missing an incoming LLM-Wiki citation. Reject `source_path` and `source_paths`. |
| `mode=re-ingest source_path=<path>` | `re-ingest` | Target exactly the requested source path regardless of current citation/staleness state; pass `source_path` through. |
| `mode=re-ingest source_paths=<json-or-comma-list>` | `re-ingest` | Target the requested source set regardless of current citation/staleness state; pass `source_paths` through unchanged. |

`mode` is required. For `per-import` and `re-ingest`, require at least one targeted source argument. For `delta` and `init`, do not accept targeted source arguments. Do not ask the user to resolve invalid arguments; stop with the concrete routing error.

## Execution

1. **Orient**: Call `optsidian para-zk:describe format=json` first. Use the returned invocation style for subsequent `para-zk:*` calls; examples below use `optsidian`. Confirm the surface exposes `para-zk:wiki-ingest-candidates`, `para-zk:create-llm-wiki`, `para-zk:read-llm-wiki`, and `para-zk:update-llm-wiki`. If the vault is unavailable, stop with the CLI error; do not fall back to direct file writes.

2. **Resolve mode**: Normalize exactly one mode from `{per-import, delta, init, re-ingest}`. Preserve `limit` and `offset` when supplied. For targeted modes, preserve exactly one of `source_path` or `source_paths`; for untargeted modes, reject either source selector before doing any reads.

3. **Discover sources**: Call the candidate primitive with the same mode and target arguments:

   ```bash
   optsidian para-zk:wiki-ingest-candidates mode=<mode> [source_path=<path>|source_paths='<json-or-comma-list>'] [limit=<n|all>] [offset=<n>] format=json
   ```

   Gate on the response envelope. Candidate reasons are `missing_wiki_citation` or `source_newer_than_wiki`; candidates may include `stale_pages: [{path,title,updated_ms}]`, the citing LLM-Wiki pages older than the source. For `delta` and any returned candidate with `stale_pages`, preserve that list so the weaver gets exactly which pages to re-weave for that source. If `ok` is false or the command errors, stop. If `returned` is `0`, report that no source candidates were returned and do not spawn the weaver. If `has_more` is true, weave only the returned page of candidates and report that another bounded page remains; do not auto-page into a full scan.

4. **Hydrate sources**: For each returned candidate, read its FULL body — never truncate a source; a cut body degrades the synthesis — and strip frontmatter before placing prose in the packet:

   ```bash
   optsidian read path="<candidate.path>" format=json
   optsidian frontmatter read path="<candidate.path>" format=json
   ```

   Build each source object as `{path,type,title,updated,updated_ms,stale_pages,body}` using the candidate metadata for `type`, `title`, `updated`, `updated_ms`, and `stale_pages`. Feed the whole body; do not chase related canonical notes. A run is bounded by the NUMBER of sources (step 3's `limit`/`offset`), never by truncating any one body.

5. **Gather neighborhood**: For each hydrated source, derive a compact query from its title, aliases/tags from frontmatter, headings, and a few distinctive body terms. Search only under `LLM-Wiki/` to find the related concept pages (search returns them ranked by relevance):

   ```bash
   optsidian search query="<source title/tags/key terms>" path=LLM-Wiki field=title,aliases,tags,headings,body format=json
   optsidian grep query="<distinct key term>" path=LLM-Wiki context=1 format=json
   ```

   Seed the neighborhood with every path in each candidate's `stale_pages`; for a stale source, those pages are the exact re-weave targets for that source. Deduplicate paths across all sources, then read the FULL body of each related page (a touched page must be re-woven against its whole current content):

   ```bash
   optsidian read path="<wiki.path>" format=json
   optsidian frontmatter read path="<wiki.path>" format=json
   ```

   Build `candidate_wiki_pages` as `{path,title,aliases,tags,body}` with full bodies. If no related page is found for a source, keep going; the weaver may create a new page.

6. **Build the one-time index seed**: For `delta` and `init` only, build one compact shared wiki index slice before spawning the weaver. Use the combined source titles, tags, and key terms to run one bounded search under `LLM-Wiki/`, then read frontmatter only for the returned wiki paths:

   ```bash
   optsidian search query="<combined source terms>" path=LLM-Wiki field=title,aliases,tags format=json
   optsidian frontmatter read path="<wiki.path>" format=json
   ```

   Store only `{path,title,aliases,tags}` in `wiki_index_seed`; never include bodies in the seed — that is what keeps it cheap even for the whole wiki, not a count cap. Build this slice once and do not refresh it mid-run, even as the weaver creates or updates pages. For `per-import` and `re-ingest`, set `wiki_index_seed` to `[]` and rely on the per-source neighborhood.

7. **Assemble packet**: Create one hydrated `WeavePacket` for the whole returned source set:

   ```json
   {
     "mode": "<per-import|delta|init|re-ingest>",
     "by": "<model-id>",
     "sources": [
       {"path": "...", "type": "...", "title": "...", "updated": "...", "updated_ms": 0, "stale_pages": [{"path": "...", "title": "...", "updated_ms": 0}], "body": "..."}
     ],
     "candidate_wiki_pages": [
       {"path": "...", "title": "...", "aliases": [], "tags": [], "body": "..."}
     ],
     "wiki_index_seed": [
       {"path": "...", "title": "...", "aliases": [], "tags": []}
     ],
     "rules": {
       "read_scope": "Read only packet sources, packet candidate_wiki_pages, the one-time wiki_index_seed, and bounded LLM-Wiki re-searches needed for touched pages.",
       "writer": "The weaver writes directly with create-llm-wiki and update-llm-wiki, passing by=<model-id>; the skill applies no writes.",
       "citations": "Each touched page must cite source references with backtick `PZ[id]` code-spans from references op=insert, inserted only to obtain stable ids.",
       "freshness": "Re-integrating a source into a page body, which bumps page updated, is the freshness event.",
       "single_direction": "Never write links into source notes.",
       "target_pages": "When a source has stale_pages, re-weave exactly those citing LLM-Wiki pages for that source."
     }
   }
   ```

   Inject `by` from the orchestrator's current model id; the weaver passes it to `create-llm-wiki` and `update-llm-wiki`. Do not add a commit plan or any direct-write instructions for the skill itself.

8. **Spawn one weaver**: Spawn exactly one agent for the entire packet, in background when the host supports it:

   ```text
   Agent({
     subagent_type: "para-zk:wiki-weaver",
     run_in_background: true,
     prompt: "Weave this WeavePacket serially. Read only these scoped packet objects and bounded LLM-Wiki re-search results. Write pages directly via the PARA-ZK CLI; do not return a plan.\n\n<WEAVE_PACKET_JSON>"
   })
   ```

   The weaver processes all `sources` serially in its own context, integrating each in full. Do not spawn once per source — one weaver builds the compounding web across the batch so it can cross-link related sources in a single pass. If the weaver approaches its context limit before finishing the batch, it stops after the last fully-integrated source and reports which sources it completed and which remain; spawn a FRESH weaver for the remaining sources (re-hydrate them per steps 4–5). Bound work by source count and by chaining weavers — never by truncating a body. Do not refresh the index seed after spawning. Do not post-process the weaver's writes.

9. **Report launch**: Return the mode, source count, candidate wiki page count, whether `has_more` was true (another candidate page remains), and the weaver launch handle if the host provides one. If the weaver later reports a context boundary with sources still remaining, spawn a fresh weaver for the remainder. The observable write contract is the weaver's direct page writes (`create-llm-wiki`/`update-llm-wiki` succeeding).
