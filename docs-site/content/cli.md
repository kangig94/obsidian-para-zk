---
title: CLI
---

The PARA-ZK CLI is for LLMs, scripts, and other automation driving a running Obsidian vault.

It uses the same workflow logic as the Obsidian GUI, but exposes explicit arguments and token-efficient JSON results.

## Invocation

Use Obsidian's native CLI directly or through Optsidian:

```bash
obsidian para-zk:describe format=json
optsidian para-zk:describe format=json
```

Use `format=json` for automation.

Successful responses use stable fields such as:

```json
{
  "ok": true,
  "command": "para-zk:create-project",
  "path": "PARA/Projects/Example/Example.md",
  "created": true
}
```

Errors return `ok: false` with an `error` message.

## Load Conventions Once

Automation should start each task with:

```bash
optsidian para-zk:conventions format=json
```

It returns the vault orientation, ownership/routing rules, citation rules, and wiki-compounding rules. Then use `para-zk:describe` as the live surface reference.

## Discover The Live Surface

Start with:

```bash
optsidian para-zk:describe format=json
```

Then drill into a surface type:

```bash
optsidian para-zk:describe type=project format=json
optsidian para-zk:describe type=resource format=json
optsidian para-zk:describe type=permanent format=json
```

`describe type=<surface>` returns selectors, create inputs, read keys, write keys, collections, and supported operations for that note type. Keys absent from `writeKeys` are not writable through PARA-ZK; route raw file edits, raw frontmatter, and full-text search to the host CLI.

For one command's arguments, use `help=true`:

```bash
optsidian para-zk:create-area help=true format=json
```

## Find Notes

To enumerate notes by type before addressing one, use `para-zk:list`:

```bash
optsidian para-zk:list type=project format=json
optsidian para-zk:list type=resource query=attention format=json
```

It returns `{ title, type, path }` items and supports `archived`, `query`, and `offset`/`limit` paging. Full-text content search is left to the host CLI's own grep/search.

## LLM-Wiki Ingest

Use `para-zk:wiki-ingest-candidates` to list active, non-template canonical sources (`resource`, `digest`, `permanent`, `subnote`) that should be folded into `LLM-Wiki/` without reading source or wiki bodies:

```bash
optsidian para-zk:wiki-ingest-candidates mode=uncited limit=all format=json
optsidian para-zk:wiki-ingest-candidates mode=uncited type=resource limit=all format=json
optsidian para-zk:wiki-ingest-candidates mode=delta limit=50 format=json
optsidian para-zk:wiki-ingest-candidates mode=per-import source_paths='["PARA/Resources/Source Paper.md"]' format=json
optsidian para-zk:wiki-ingest-candidates mode=re-ingest source_path="PARA/Resources/Source Paper.md" format=json
```

`mode` is one of `per-import`, `delta`, `uncited`, or `re-ingest`. `source_path` or `source_paths=<json|comma-list>` is required for `per-import` and `re-ingest`, and rejected for `delta` and `uncited`. The command also accepts `type=<resource|digest|permanent|subnote>`, `offset=<n>`, `limit=<n|all>` (default `50`), and `format`. Results include `{ ok, command, count, offset, limit, returned, has_more, candidates }`; each candidate has `{ path, type, title, updated, updated_ms, stale_llm_wikis, reason }`.

Reason codes are `missing_wiki_citation`, `source_newer_than_wiki`, `per_import`, and `reingest_requested`. `source_newer_than_wiki` derives staleness from page `updated`: the source is newer than at least one citing wiki page, listed in `stale_llm_wikis` as `{ path, title, updated_ms }`.

The audit checks include `upward_wiki_link` (`medium`), which flags a non-`llm-wiki` note that links into an `llm-wiki` note; `orphan_wiki_page` (`low`), an advisory hint for a wiki page that no other wiki page links to; and `wiki_tag_domain_mismatch` (`low`), which can be fixed with `audit fix=true`.

`create-llm-wiki` and `update-llm-wiki` accept `by=<model-id>` for authorship: create stamps `created_by` and `updated_by`, while changed updates stamp `updated_by`. LLM-Wiki pages include managed props plus Cited-by scoped to `LLM-Wiki/`, then References. Cross-link wiki concept pages with body `[[link]]`; use `references` plus backtick code-span `` `PZ[<id>]` `` citations only for canonical sources outside LLM-Wiki. Bare `PZ[<id>]` text does not render.

## Canonical Arguments

PARA-ZK commands use one canonical argument name per concept.

Examples:

- `title` for project, area, resource, retro, and ZK titles
- `date` for journal and retro dates
- `kind` for ZK kind
- `area_titles` when creating or linking project areas
- `source_title` for source notes used by create/distill workflows
- `root_type`, `root_title`, `relpath`, and `title` for `create-child`, `read-child`, `update-child`, `rename-child`, and `delete-child`

Notes are addressed by name, not by vault file path. Subfoldered child subnotes can be addressed by basename when unique or by `subdir/title(.md)` through the `title` field.

Top-level parent CRUD commands do not accept `child=`. Address child notes, fallback notes, and nested areas through the dedicated `*-child` command family.

## Locale-Neutral Codes

CLI values are stable codes even when the vault renders localized labels.

Common examples:

```text
status=in_progress
priority=high
maturity=draft
kind=permanent
energy=normal
```

## Large Bodies From Files

Create commands support file-backed `body` input, and update commands support file-backed `value` input:

```bash
optsidian para-zk:create-resource title="Attention Is All You Need" body=@/absolute/path/to/note.md
optsidian para-zk:update-child root_type=project root_title="Model Evaluation" title="Planning Meeting" key=body op=set value=@/absolute/path/to/body.md
```

Use an absolute path. The plugin reads the file from the Obsidian process, which keeps multiline Markdown, quotes, `$`, and backticks intact.

> [!note]
> Only create `body` and update `value` are file-backed. Short fields such as journal `content`, `match`, and `with` are literal, so `@mentions` remain text.

## References And Citations

Reference registries expose stable ids. Read them with:

```bash
optsidian para-zk:read-resource title="Source Paper" key=references limit=all format=json
```

Body prose cites references with backtick code spans such as `` `PZ[<id>]` ``, `` `PZ[<id>, <id>]` ``, or `` `PZ[<id>#<section>]` ``. The id is not the visible registry index. Citations render as the reference's current position, so reordering references changes the displayed number but not the stored citation target.

## More Detail

The exhaustive CLI contract lives in the repo at [docs/CLI.md](https://github.com/kangig94/obsidian-para-zk/blob/main/docs/CLI.md). Use that document for the complete command reference; use `para-zk:describe` for the live surface in your current vault.
