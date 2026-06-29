---
title: LLM-Wiki
---

`LLM-Wiki/` is PARA-ZK's LLM-owned synthesis layer. It is derived from canonical notes, not a second place to keep source truth.

Canonical knowledge lives in Resources, PARA notes, and ZK notes. Wiki pages summarize and connect those sources so future LLM work can read a compact map before acting.

> [!example] See it
> Browse a generated wiki: [[examples/llm-wiki/index|LLM-Wiki example (AI papers)]].

## Link Direction

Wiki pages cite canonical notes through their `references` registry and backtick citation tokens:

````markdown
`PZ[abc123]`
`PZ[abc123#Training Loop]`
````

Use normal body `[[links]]` between wiki concept pages. Do not link canonical notes back into `LLM-Wiki/`; the wiki depends on the sources, not the other way around.

## Create Wiki Pages

Create pages under exactly one domain folder:

```bash
optsidian para-zk:create-llm-wiki title="AI/Diffusion Policy" by="gpt-5"
```

The path is `LLM-Wiki/<domain>/<concept>.md`. A concept is unique across the wiki: creating the same concept under another domain returns the existing page instead of duplicating it. When the first page in a domain is created, PARA-ZK also creates `LLM-Wiki/<domain>/index.md` as that domain's hub.

`create-llm-wiki` and `update-llm-wiki` accept `by=<model-id>` for authorship. Creation stamps `created_by` and `updated_by`; changed updates stamp `updated_by`.

Move an existing concept to a better domain with `refile-llm-wiki`; this updates the domain tag, rewrites links through the vault rename path, and creates the target domain hub when missing:

```bash
optsidian para-zk:refile-llm-wiki title="AI/Diffusion Policy" domain="motion-generation" by="gpt-5"
```

## Write Synthesis

LLM-Wiki pages expose the same managed surface contract as other PARA-ZK notes:

```bash
optsidian para-zk:update-llm-wiki title="AI/Diffusion Policy" key=body op=set value=@/absolute/path/body.md by="gpt-5"
optsidian para-zk:update-llm-wiki title="AI/Diffusion Policy" key=references op=insert value_json='{"link":"[[PARA/Resources/Source Paper.md]]","description":"Canonical source"}'
```

Read the inserted reference id before citing it:

```bash
optsidian para-zk:read-llm-wiki title="AI/Diffusion Policy" key=references limit=all format=json
```

Then cite that stable id from the body with `` `PZ[<id>]` ``. Bare `PZ[<id>]` text and positional `` `PZ[0]` `` input do not render.

## Ingest Candidates

`para-zk:wiki-ingest-candidates` lists source notes that should be folded into the wiki without reading source or wiki bodies:

```bash
optsidian para-zk:wiki-ingest-candidates mode=uncited type=resource limit=all format=json
optsidian para-zk:wiki-ingest-candidates mode=delta limit=50 format=json
optsidian para-zk:wiki-ingest-candidates mode=per-import source_path="PARA/Resources/Source Paper.md" format=json
```

Candidate modes:

- `uncited`: find ingestable sources with no incoming LLM-Wiki citation.
- `delta`: find uncited sources and sources newer than citing wiki pages.
- `per-import`: process source paths immediately after import.
- `re-ingest`: deliberately refresh selected source paths.

Ingestable source types are `resource`, `digest`, `permanent`, and `subnote`.

## Retopology Candidates

`para-zk:wiki-retopology-candidates` ranks domain index pairs without reading concept-page bodies:

```bash
optsidian para-zk:wiki-retopology-candidates limit=20
optsidian para-zk:wiki-retopology-candidates domain=language-models limit=10
optsidian para-zk:wiki-retopology-candidates domain=language-models depth=3 limit=10
```

Use it to choose which hubs to inspect during domain split, merge, refile, or cross-domain link planning. Scores use TF-IDF weighted visible index text, with wikilinks reduced to their labels and body bigrams included at lighter weight; explicit cross-domain links stay visible as evidence and graph connections without affecting the score. In Obsidian, per-index term counts are cached in `.obsidian/plugins/para-zk/retopology-cache.json` and invalidated by file stat plus a hash of the term-counting rules. The cache read limit defaults to `16` MiB and can be raised with `retopologyCacheMaxMiB` in the plugin config; results include a warning after the cache exceeds 95% of that limit. Each candidate includes the shortest undirected index-to-index `connection` within `depth`; focused mode also returns an undirected index graph neighborhood. `depth` defaults to `2`. It is a triage signal, not the final topology judgment.

## Audit Checks

PARA-ZK audit includes wiki-specific checks:

- `upward_wiki_link`: a canonical note links into an `llm-wiki` note.
- `orphan_wiki_page`: a wiki page has no incoming links from other wiki pages.
- `wiki_tag_domain_mismatch`: a wiki page's `llm-wiki/<domain>` tag does not match its folder domain.

Run:

```bash
optsidian para-zk:audit type=llm-wiki format=json
optsidian para-zk:audit fix=true format=json
```

`fix=true` can correct wiki tag domain drift. Link-shape findings remain review hints.
