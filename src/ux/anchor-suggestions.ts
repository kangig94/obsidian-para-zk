import { TFile, stripHeading, stripHeadingForLink } from "obsidian";
import type { ParaZkPluginContext } from "../plugin-interface";

// A selectable subpath of a target file: a heading (rendered as `#Heading` in a link)
// or a block (`#^id`). Used by the inline `` `PZ[<id>#<section>]` `` citation suggester
// to complete the section after a `#`.
export type AnchorSuggestion = {
  kind: "heading" | "block";
  value: string;
  label: string;
  detail: string;
  line: number;
  level?: number;
  searchText: string;
};

// List a file's headings and blocks as anchor suggestions, ordered by document position.
// `readLines` is injected so callers can supply their own cached read (block snippets are
// the only reason the file body is read, so it is skipped when the file has no blocks).
export async function anchorSuggestionsForFile(
  plugin: ParaZkPluginContext,
  file: TFile,
  readLines: (file: TFile) => Promise<string[]>
): Promise<AnchorSuggestion[]> {
  const cache = plugin.app.metadataCache.getFileCache(file);
  if (!cache) return [];

  const blocks = Object.entries(cache.blocks ?? {});
  const lines = blocks.length > 0 ? await readLines(file) : [];
  const suggestions: AnchorSuggestion[] = [];

  for (const heading of cache.headings ?? []) {
    // stripHeadingForLink drops link-illegal chars like `|`, but keeps `[`/`]`/backtick.
    // A heading that still contains those cannot be stored as a valid `#anchor`, so skip it.
    const value = stripHeadingForLink(heading.heading);
    if (/[[\]`]/.test(value)) continue;
    suggestions.push({
      kind: "heading",
      value,
      label: stripHeading(heading.heading),
      detail: `H${heading.level}`,
      line: heading.position.start.line,
      level: heading.level,
      searchText: stripHeading(heading.heading)
    });
  }

  for (const [id, block] of blocks) {
    const snippet = blockLineSnippet(lines, block.position.start.line);
    suggestions.push({
      kind: "block",
      value: `^${id}`,
      label: `^${id}`,
      detail: snippet,
      line: block.position.start.line,
      searchText: `^${id} ${snippet}`
    });
  }

  return suggestions.sort((left, right) => {
    if (left.line !== right.line) return left.line - right.line;
    return left.kind.localeCompare(right.kind);
  });
}

function blockLineSnippet(lines: string[], line: number): string {
  const text = (lines[line] ?? "").trim().replace(/\s+/g, " ");
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}
