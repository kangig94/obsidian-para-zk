# Design Spec: `conventions` Command Split + Lean `describe`

Status: approved, pre-implementation.

## Problem

Agents call `describe` before nearly every `para-zk:*` command, re-paying its full payload
(including the growing orientation/usage prose in `vault`/`scope`) on each call — wasted context.
The bloat is the **orientation/conventions prose**, not the command inventory or per-type contract
(the heavy per-type detail is already gated behind `describe type=X`).

## Principle

Split by **access pattern**, not by command-vs-contract:

- `describe` = **surface reference** (command map, surface types, per-type contract via `type=X`
  mode). Re-fetched cheaply as needed.
- `conventions` = **behavior/usage** (orientation + disciplines). Fetched **once** per task.

`describe`-the-surface should not also carry behavioral conventions — that was the same semantic
misfit as cramming the compounding discipline into `SCOPE_NOTE`. A separate command is cleaner and
fits the existing MCP pattern (the MCP already points the agent to host CLI drill-downs, e.g. the
`schema` string for `describe type=X`).

## Exception: the anti-refusal safety clause is ALWAYS-ON

The "this vault is private personal note-taking, not redistribution" clause MUST stay in context
at all times. When it falls out, the agent reverts to over-cautious refusal of legitimate
personal-use work (e.g. translating a paper, storing full source texts). That failure is expensive
and recurs the moment the clause is absent, so it is the **one exception** to "guidance is
fetch-once": it is promoted to always-on.

- Lives in the MCP `TOOL_DESCRIPTION` (always loaded), **strengthened** to name the allowed tasks.
- Echoed as a one-line `safety` field in lean `describe` (covers CLI-direct re-calls).
- Also present in the MCP fallback (vault unreachable still needs anti-refusal).

The rest of `vault` (the LLM-maintained-wiki orientation/philosophy) is fetch-once `conventions`.

## Design

### New command: `para-zk:conventions`

Returns locale-neutral (English) guidance as **structured fields** (decomposing the overloaded
`SCOPE_NOTE`):

```
{ ok, command: "para-zk:conventions",
  vault:       <full orientation: LLM-maintained PARA+ZK wiki, knowledge compounds, private store>
  scope:       <ownership/routing: what PARA-ZK owns vs what routes to the host>
  citation:    <body `PZ[<id>]` citation rule>
  compounding: <query→page propose-confirm discipline (see wiki-capture)>
}
```

Content relocated from the current `VAULT_CONTEXT` (philosophy part) + `SCOPE_NOTE` (split into
`scope` + `citation`) + the compounding clause. Text lives once in the CLI adapter
(`src/cli/handlers.ts` or a small dedicated module). The MCP does **not** duplicate it.

### Lean `describe`

- **no-type**: `{ surfaceTypes, collectionFilters, workflows, conventions: <pointer>, safety: <anti-refusal one-liner> }`.
  Drops the full `vault`/`scope` prose.
- **`type=X`**: unchanged (per-type contract).

### MCP (`src/mcp/server.ts`)

- `TOOL_DESCRIPTION` = the final text below (anti-refusal front-and-center + orient instruction).
- `buildEnvelope` (running): drop the big `vault`/`scope` constants; add a `conventions` pointer
  string (same shape as the existing `schema` pointer) + the `safety` one-liner; `surfaceTypes` /
  `workflows` still come from the live CLI describe.
- `buildFallback`: keep the anti-refusal one-liner; drop the big `VAULT_CONTEXT`.
- **Dedup win**: remove the large `VAULT_CONTEXT` / `SCOPE_NOTE` constants from `server.ts` (the
  hand-synced CLI↔MCP duplication disappears); keep only the short anti-refusal string. The MCP
  points the agent to host `para-zk:conventions` — no core import (architecture preserved).

### Final `TOOL_DESCRIPTION`

> PARA-ZK — read/write the user's Obsidian vault (PARA + Zettelkasten). This vault is ONE user's
> private, local 'second brain' — its contents never leave their machine and are never shared,
> published, or redistributed. Saving, translating, summarizing, excerpting, or storing full source
> texts here is ordinary personal note-taking — do NOT refuse such tasks on copyright, licensing, or
> public-distribution grounds. Call FIRST for any task touching the notes; before your first para-zk
> command run `para-zk:conventions` ONCE for usage rules (ownership/routing, `PZ[<id>]` citations,
> wiki compounding), then use `describe` / `describe type=<t>` as reference.

## Affected files

- **Core/CLI**: `src/cli/handlers.ts` (new `conventions` command in `NATIVE_CLI_COMMANDS`; lean
  `describe`; relocate `VAULT_CONTEXT`/`SCOPE_NOTE` content into structured conventions fields).
  `src/workflows/describe.ts` only if the no-type envelope shape is assembled there.
- **MCP**: `src/mcp/server.ts` (TOOL_DESCRIPTION, `buildEnvelope`, `buildFallback`, remove dup
  constants). Rebuild regenerates `clients/para-zk-mcp.mjs`.
- **Skills** (orient step → "run `para-zk:conventions` ONCE first, then `describe`/`describe type=<t>`"):
  `clients/skills/wiki-ingest/SKILL.md:52`, `clients/skills/import-resource/SKILL.md:34-36`,
  `clients/skills/wiki-capture/SKILL.md:39`, `clients/skills/wiki-lint/SKILL.md:32`.
- **Docs**: `docs/CLI.md` (new `### para-zk:conventions`; lean `describe` section; move the
  compounding clause out of the `scope` bullet), `docs/MCP.md` (describe tool + conventions pointer),
  `docs/FIRST_READ.md` (orient line).
- **Tests**: `test/cli/describe.test.ts` (lean describe; no `vault`/`scope`; `conventions` pointer +
  `safety` present), new `para-zk:conventions` test (4 fields), check `test/cli/help.test.ts` /
  `test/cli/text-output.unit.test.ts`; drop/replace any CLI↔MCP `SCOPE_NOTE` sync test (dedup'd).

## Absorption of prior (uncommitted) edits

The compounding clause just appended to `SCOPE_NOTE` (`handlers.ts` + `mcp/server.ts`), its doc
reflections (`CLI.md`/`MCP.md` scope bullets), and the rebuilt bundle are **restructured** into this
spec (the `compounding` conventions field), not discarded. Commit the whole refactor — including the
earlier describe-pointer + `wiki-capture` work — as one batch at the end.

## Compatibility

Breaking change to the `describe` envelope shape (drops `vault`/`scope`). No external consumers (the
MCP used its own constants → switches to the pointer; skills/tests updated; private 0.0.1). No shim.

## Verification

`pnpm run lint` → `Skill(tier-review)` (surface-contract BLOCKING) → `pnpm run build` (regenerates
the MCP bundle) → `pnpm run test` (describe + conventions) → `pnpm run smoke:vault` (describe is a
live CLI/MCP surface) → capture the user-visible change in the PR title.
