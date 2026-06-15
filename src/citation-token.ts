// The PZ citation-token grammar, shared by the GUI renderers (reading-view post-processor
// and CM6 editor extension) and the workflow audit. Pure string parsing with no Obsidian or
// adapter dependency, so it sits at the foundation layer as the single source of truth for
// what a `` `PZ[...]` `` token is.

const CITATION_ID_RE_SOURCE = "[A-Za-z0-9_-]+";
// An optional section after the id: `#` then heading or block (`#^id`) text. Comma is the
// multi-cite separator and `]` closes the token, so an inline-cited section excludes both —
// a heading containing a comma must be cited via the reference's own stored anchor instead.
const CITATION_SUBPATH_RE_SOURCE = "#[^,\\]\\n]+";
const CITATION_ENTRY_RE_SOURCE = `${CITATION_ID_RE_SOURCE}(?:${CITATION_SUBPATH_RE_SOURCE})?`;
const CITATION_ENTRY_LIST_RE_SOURCE = `${CITATION_ENTRY_RE_SOURCE}(?:\\s*,\\s*${CITATION_ENTRY_RE_SOURCE})*`;
const CITATION_CODE_RE_SOURCE = `PZ\\[\\s*(${CITATION_ENTRY_LIST_RE_SOURCE})\\s*\\]`;
const CITATION_TOKEN_CODE_RE_SOURCE = `PZ\\[\\s*${CITATION_ENTRY_LIST_RE_SOURCE}\\s*\\]`;
const CITATION_RE = new RegExp(`^${CITATION_CODE_RE_SOURCE}$`);
const CITATION_ENTRY_RE = new RegExp(`^(${CITATION_ID_RE_SOURCE})(?:#(.+))?$`);

// Matches a whole `` `PZ[...]` `` code span (global), capturing the inner token. Used to scan
// raw note text (the CM6 editor extension and the audit) for citations.
export const CITATION_TOKEN_RE = new RegExp("`(" + CITATION_TOKEN_CODE_RE_SOURCE + ")`", "g");

// A single cited reference: its stable id and an optional section subpath (heading text or
// `^block`) that points the citation at one part of the reference's target.
export type CitationKey = { id: string; subpath?: string };

// Pure: a citation token is a code span whose whole content is `PZ[<id>]`,
// `PZ[<id>#<section>]`, or a comma-separated list of either (spaces optional).
// Returns the parsed keys, or undefined for anything else.
export function parseCitationKeys(text: string): CitationKey[] | undefined {
  const match = text.trim().match(CITATION_RE);
  if (!match) return undefined;
  return match[1].split(",").map((part) => {
    const entry = part.trim().match(CITATION_ENTRY_RE);
    const id = entry?.[1] ?? part.trim();
    const subpath = entry?.[2]?.trim();
    return subpath ? { id, subpath } : { id };
  });
}
