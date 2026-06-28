---
name: wiki-capture
description: "Use when a query or conversation against the LLM-Wiki produces a durable synthesis worth keeping — a multi-source comparison/connection, or a standard concept the wiki lacks. Proposes filing it back as a new or updated wiki page and writes ONLY on the user's confirmation. Skip one-off lookups and navigation."
argument-hint: "[target=<existing page title | new domain/concept>]"
---

# Wiki Capture

Fold a durable synthesis that emerged from a query/conversation back into the LLM-Wiki —
**propose first, write only on the user's confirmation.** This is the query→compound half of
the wiki: `wiki-ingest` grows the wiki from *sources*; `wiki-capture` grows it from
*exploration*, so good answers compound in the wiki instead of evaporating into chat.

## Context

LLM-Wiki pages are LLM-owned derived synthesis under `LLM-Wiki/`; canonical knowledge stays in
Resources, PARA, and ZK notes. A captured page is an ordinary `llm-wiki` page — there is **no
separate "analysis" type**. Placement and granularity follow the SAME rules as `wiki-ingest`'s
Plan (do not invent a second regime — a divergent granularity splits the wiki's cohesion and
`wiki-lint` flags it): prefer FEWER, denser pages; a concept that recurs or is canonical/standalone
earns its own page, a one-off sub-aspect is a SECTION within a broader page; reuse an existing
domain, never near-synonyms; one concept = one page across the whole wiki.

**Hard rule — reads must not write.** Producing the answer is a read; capturing it is an explicit
mutation. Always propose the target + shape and WAIT for the user's confirmation before any
`create-`/`update-llm-wiki` call. Wiki prose mirrors the user's OWN language register.

## When to use

USE when the answer is a **durable synthesis**: a multi-source comparison or connection, or a
standard concept/method the wiki lacks. Invoked explicitly ("file this back", "위키에 정리해줘") or
offered proactively per `para-zk:conventions`' `compounding` discipline, then run on confirm.

Do NOT use for: one-off lookups, navigation ("which page is X?"), ephemeral/operational Q&A, or
content an existing page already fully covers. If nothing durable emerged, stop without proposing.

## Execution

1. **Orient**: Run `optsidian para-zk:conventions` ONCE first for this task, then call
   `optsidian para-zk:describe` / `optsidian para-zk:describe type=<t>` as reference. Use the
   returned invocation style for subsequent `para-zk:*` calls — run them via `optsidian` or the
   native `obsidian` CLI (`obsidian para-zk:…`), interchangeable; use whichever is on `PATH`.
   Confirm the surface exposes
   `para-zk:list`, `para-zk:read-llm-wiki`, `para-zk:create-llm-wiki`, and
   `para-zk:update-llm-wiki`. If the vault is unavailable, stop with the CLI error; do not fall back
   to direct file writes.

2. **Gate on worthiness**: Confirm the answer is a durable synthesis (see *When to use*). If it is
   a one-off lookup, navigation, or already fully covered, STOP — do not propose.

3. **Locate the best-fit page (search existing FIRST)**:
   - `optsidian para-zk:list type=llm-wiki limit=all` — the roster (every `<domain>/<concept>` and
     the domains already in use).
   - Read the touched domain's hub: `optsidian para-zk:read-llm-wiki title="<domain>/index" key=body`
     — the cheapest area map. Read individual concept pages only when the index is insufficient.

4. **Decide the shape** (reuse `wiki-ingest` Plan rules):
   - **Fits an existing page** → update that page (a new SECTION, or strengthen/append existing
     prose). ← default.
   - **No fitting page**, and the synthesis is durable/standalone → **new page** in an existing
     domain.
   - **A page exists but forcing the content in would hurt cohesion**, and independence is clearly
     better → **new page**.
   - **A new *domain* would be needed** → do NOT mint one ad-hoc (near-synonym domains are cohesion
     decay `wiki-lint` flags). Surface it to the user or defer to a `wiki-ingest` re-plan.

5. **Propose & confirm**: Present ONE concise option with target + shape + a short preview, and
   offer the alternatives (e.g. new page `AI/Attention-Optimizer Interaction` vs section in
   `AI/Attention` vs skip). **Wait for the user's choice; do not write before confirmation.** Do
   not re-offer a capture the user declined in the same session.

6. **Write** (only after confirmation), injecting `by=<model-id>` from your current model id:
   - **New page**: `optsidian para-zk:create-llm-wiki title="<domain>/<concept>" by=<model-id>`
     (get-or-create; the `<domain>/index` hub auto-mints as a scaffold on a domain's first page),
     then fill the body via `update-llm-wiki key=body`.
   - **Existing page**: `optsidian para-zk:update-llm-wiki title="<domain>/<concept>" key=body
     op=append|replace by=<model-id>`.
   - **Cite & link**: cite the canonical sources the answer used as `references` (`key=references
     op=insert`) + inline body `` `PZ[<id>]` ``; wiki↔wiki concept links as body `[[link]]`. Keep
     links **single-direction** — never link a canonical note back into the wiki.
   - **Math**: write formulas and symbols as Obsidian MathJax — `$…$` inline, `$$…$$` display on its
     own line, with LITERAL single backslashes; NEVER wrap math in backticks (those are only for `` `PZ[<id>]` ``
     citations — a backtick-wrapped formula renders as monospace, not math) and never use `\(...\)`/`\[...\]`.
   - **Hub light-touch** (new page only): add the new leaf to its domain `<domain>/index` under the
     fitting group with a one-line gist (not a bare link). If it fits no group cleanly, leave it and
     flag for the next `wiki-ingest` synthesize — do not force a malformed entry. Full hub
     re-synthesis stays with `wiki-ingest`.

7. **Report**: the path written and the shape (new page / section / update), the sources cited, and
   any hub touch — or that the user declined, or that a new domain was deferred.

## Freshness

If the captured page cites ≥1 canonical source, `wiki-ingest` delta tracks it like any page (a cited
source's later `updated` flags the page stale). A purely conversation-derived insight with no
canonical citation is not delta-tracked — it is maintained by `wiki-lint`/manual edits, so cite a
source whenever the synthesis rests on one.
