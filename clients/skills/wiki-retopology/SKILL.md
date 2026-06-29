---
name: wiki-retopology
description: "Use when reorganizing the existing PARA-ZK LLM-Wiki domain topology."
---

# Wiki Retopology

Plan and execute the deterministic topology part of an existing LLM-Wiki refactor: domains, page
homes, same-domain names, source-domain index membership, and cross-domain links. This skill may run
approved `refile-llm-wiki` and same-domain `rename-llm-wiki` commands before handoff, and after a
refile it must remove the moved page from the old/source domain index. It does **not** ingest new
canonical sources and it does **not** rewrite page prose by default. Source-backed body or hub
synthesis is handed off to `wiki-ingest` after the approved topology moves are already in place.

## Context

LLM-Wiki pages are LLM-owned derived synthesis under `LLM-Wiki/`. A domain is a page's file-tree
home and hub context; cross-domain relationships live in links. Therefore:

- Use domain indexes as the topology map. In large vaults, rank index pairs first and then read the
  returned indexes directly; do not use concept-page similarity as a ranking signal.
- If the user names or suspects a cross-domain relation, read those indexes directly even if a
  ranking command would not surface them.
- A page can be strongly related to another domain without moving there.
- A cross-domain link is normal and is not itself evidence for a domain merge.
- A domain move is structural and deterministic: use `para-zk:refile-llm-wiki`.
- After a domain move, the old/source domain index must stop listing the moved page as a member.
- A prose rewrite, hub synthesis, or source re-evaluation belongs to `wiki-ingest`.

Default posture: **plan first, then apply approved deterministic structure, then hand off**. Apply
only when the user explicitly asks to apply, or after they approve the proposed plan.

## Argument Routing

| Argument | Routing |
|----------|---------|
| `scope=all` (default) | Use global index-pair candidates, then read the returned hubs and enough pages to plan. |
| `scope=domain domain=<domain>` | Use focused candidates and the returned index graph for that domain, then read the returned hubs and enough pages to plan. |
| `scope=pages titles=<json-or-comma-list>` | Read the listed pages' domain hubs and use focused candidates when neighboring domains matter. |
| `apply=true` | After plan presentation/approval, apply deterministic moves/renames before handoff. |

Reject `domain` without `scope=domain`; reject `titles` without `scope=pages`; reject both together.
Do not ask the user to resolve invalid arguments; stop with the concrete routing error.

## Execution

1. **Orient**: Run `optsidian para-zk:conventions` ONCE first for this task, then
   `optsidian para-zk:describe` and `optsidian para-zk:describe type=llm-wiki`.
   Confirm the surface exposes `para-zk:wiki-domains`,
   `para-zk:wiki-retopology-candidates`, `para-zk:list`, `para-zk:read-llm-wiki`,
   `para-zk:refile-llm-wiki`, `para-zk:rename-llm-wiki`, and
   `para-zk:update-llm-wiki`. If the vault is unavailable, stop with the CLI error;
   do not read vault files directly.

2. **Inventory**:
   - Read domains: `optsidian para-zk:wiki-domains limit=all`.
   - Read the roster: `optsidian para-zk:list type=llm-wiki limit=all`.
   - For `scope=all`, get global index-pair candidates:
     `optsidian para-zk:wiki-retopology-candidates limit=<k>`. Each candidate includes
     a TF-IDF weighted score and the shortest index-to-index `connection` within
     `depth=2` by default.
     Scoring is content-only by default; use `links=true` only when explicit index-link
     boosts should affect ranking. Link evidence and graph connections are always reported.
   - For `scope=domain`, get focused candidates:
     `optsidian para-zk:wiki-retopology-candidates domain="<domain>" limit=<k>`; it also
     returns an undirected index graph neighborhood with `depth=2` by default.
   - Read the `<domain>/index` bodies for domains in the returned candidate pairs, plus any
     explicitly user-named domains.
   - For a small vault or an explicitly exhaustive pass, reading every domain index is acceptable.
   - Read individual concept pages only when the hub is insufficient to classify a move, merge, or
     link. Prefer bounded reads; this is a topology pass, not a full re-synthesis pass.

3. **Diagnose topology**:
   - **Domain split**: a domain is an umbrella with several stable lineages/problem areas that each
     can sustain a useful hub and multiple pages.
   - **Domain merge**: two domains are synonyms/near-synonyms, or their hubs describe the same
     problem area with no durable distinction.
   - **Refile**: a concept page's best home is a different existing or planned domain, while the
     concept itself remains the same page.
   - **Same-domain rename**: the concept name is unclear but the domain home is correct.
   - **Cross-domain link**: two domains remain distinct but their hubs/pages should point to each
     other so the wiki reads as one graph.
   - **Handoff to ingest**: page or hub prose needs source-backed synthesis, citations, or a body
     rewrite. Do not do that inside this skill; route it to `wiki-ingest`.

4. **Plan**: Produce a compact text plan with concrete titles and one-line rationales. Include only
   sections that have entries: summary, domain moves, domain splits, domain merges, same-domain
   renames, source-index prunes, cross-domain links, wiki-ingest handoff, and manual decisions.

   Keep the plan ordered: merges before moves into the merged domain; domain creation before moves
   into the new domain; deterministic moves/renames and source-index prunes before every
   `wiki-ingest` handoff.

5. **Apply approved deterministic topology before handoff**:
   - Domain move: `optsidian para-zk:refile-llm-wiki title="<current>" domain="<target>"`.
   - Same-domain rename: `optsidian para-zk:rename-llm-wiki title="<current>" new_title="<current-domain>/<new-concept>"`.
   - After each successful refile, read the old/source `<domain>/index` fresh and remove the moved
     page's member section or standalone child entry. Obsidian may have rewritten the stale link to
     the new path; remove the membership block anyway.
   - Choose the smallest coherent removal range yourself: a dedicated section for the moved page,
     a standalone bullet/list item, or a short local paragraph whose only purpose is to register
     that page as an old-domain member. Then use `update-llm-wiki key=body op=replace
     match=<chosen range> with="" by=<model-id>` for the source-index prune.
   - If several reasonable removal ranges exist, pick the smallest one that leaves the old index
     grammatical enough to read. Report the range you removed.
   - Do not refile `<domain>/index` hubs.
   - If a target path exists, stop and surface the conflict; do not invent suffixes.
   - After each successful move/rename, update the handoff packet to use the final title/path, not
     the old topology. If a move fails, stop before handoff.

6. **Hand off synthesis to `wiki-ingest` against the final topology**:
   - For source-backed pages: invoke `wiki-ingest mode=re-ingest source_path=<path>` or
     `source_paths=<json>` with the applied retopology context.
   - For hub-only topology rewrites with no source read needed, present a `hub_updates` handoff:
     desired children/groups, cross-domain links, and rationale. This skill should not compose large
     hub prose itself.
   - If no canonical source is tied to the rewrite, say so explicitly and ask before doing any
     direct `update-llm-wiki` write.

7. **Report**:
   - What was read: domains, hubs, and any concept pages.
   - The proposed plan and what remains manual.
   - If applied: every `refile`/`rename` command run, every source-index prune, and the result path.
   - The exact `wiki-ingest` handoff packet for source-backed rewrites and hub updates.

## Guardrails

- Never use raw file moves or direct vault file edits.
- Never treat cross-domain links as a reason to collapse domains by default.
- Never mint a new domain without a one-sentence rationale and expected child concepts.
- Never leave near-synonym domains unmentioned if they are discovered.
- Never let a page exist in two domains; one concept = one page across the wiki.
- Never leave a refiled page as a child/member section in the old/source index.
- Never bulk-rewrite bodies or hubs without an explicit user approval and a handoff plan.

## Decision Examples

- **Split a large domain**: `language-models` contains several dense clusters such as scaling laws,
  alignment, retrieval-augmented generation, and agents. If each cluster has multiple child concepts
  and needs its own useful hub, plan new domains, refile the relevant pages, and prune their
  old-domain index memberships.
- **Merge near-synonym domains**: `RL` and `reinforcement-learning` cover the same problem area.
  Pick the canonical domain, refile pages into it, and prune the old domain's index memberships.
- **Link instead of merge**: `language-models/transformer-architecture` strongly informs
  `scaling-laws/chinchilla`, but the former is model architecture and the latter is scaling
  methodology. Keep domains distinct and plan cross-domain links rather than a merge.
