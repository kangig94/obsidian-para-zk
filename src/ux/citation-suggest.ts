import {
  EditorSuggest,
  Notice,
  TFile,
  type Editor,
  type EditorPosition,
  type EditorSuggestContext,
  type EditorSuggestTriggerInfo
} from "obsidian";
import type { ParaZkPluginContext } from "../plugin-interface";
import { workflowContext } from "../vault/host";
import { splitObsidianSubpath } from "../vault/paths";
import {
  ensureReferenceItemId,
  type ReferenceRead
} from "../workflows";
import { registryErrorMessage } from "./registry-block";
import { resolveReferences } from "./citation-renderer";
import { referenceTitle } from "./reference-link";
import { anchorSuggestionsForFile, type AnchorSuggestion } from "./anchor-suggestions";

// What the cursor is positioned to complete inside a `` `PZ[...]` `` token:
// a reference id (after `[` or a comma), or a section after a `#`.
type CitationTrigger =
  | { mode: "reference"; query: string }
  | { mode: "heading"; referenceId: string; query: string };

type CitationSuggestion =
  | { kind: "reference"; reference: ReferenceRead; index: number }
  | { kind: "heading"; anchor: AnchorSuggestion };

// Inline citation autocomplete. The leading backtick is the opt-in: only an open code
// span — `` `PZ[ `` — triggers it (bare `PZ[` is left alone, since `[` auto-pairs to `[]`
// in normal prose). Picking a reference inserts `` `PZ[<id>]` `` and leaves the cursor just
// before the `]`; typing `#` there switches to suggesting the reference's headings/blocks.
export class CitationSuggest extends EditorSuggest<CitationSuggestion> {
  private readonly suggestionIndexes = new Map<ReferenceRead, number>();
  // NOTE: not `trigger` — EditorSuggest's base class owns a `trigger()` method; shadowing
  // it with a field breaks the whole suggester (Obsidian calls `.trigger()` internally).
  private activeTrigger: CitationTrigger | null = null;

  constructor(private readonly plugin: ParaZkPluginContext) {
    super(plugin.app);
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
    if (!(file instanceof TFile)) return null;

    const beforeCursor = editor.getLine(cursor.line).slice(0, cursor.ch);
    const trigger = parseCitationTrigger(beforeCursor);
    if (!trigger) return null;

    this.activeTrigger = trigger;
    return {
      start: { line: cursor.line, ch: cursor.ch - trigger.query.length },
      end: cursor,
      query: trigger.query
    };
  }

  getSuggestions(context: EditorSuggestContext): CitationSuggestion[] | Promise<CitationSuggestion[]> {
    const references = resolveReferences(this.plugin, context.file);
    if (this.activeTrigger?.mode === "heading") {
      return this.headingSuggestions(context, references, this.activeTrigger.referenceId);
    }

    this.suggestionIndexes.clear();
    references.forEach((reference, index) => this.suggestionIndexes.set(reference, index));
    const query = context.query.trim().toLocaleLowerCase();
    const matches = query
      ? references.filter((reference) => referenceCitationSearchText(reference).toLocaleLowerCase().includes(query))
      : references;
    return matches.map((reference) => ({
      kind: "reference",
      reference,
      index: this.suggestionIndexes.get(reference) ?? -1
    }));
  }

  private async headingSuggestions(
    context: EditorSuggestContext,
    references: ReferenceRead[],
    referenceId: string
  ): Promise<CitationSuggestion[]> {
    const reference = references.find((item) => item.id === referenceId);
    const file = reference ? resolveReferenceFile(this.plugin, reference, context.file.path) : undefined;
    if (!file) return [];

    const anchors = await anchorSuggestionsForFile(this.plugin, file, async (target) =>
      (await this.plugin.app.vault.cachedRead(target)).split(/\r?\n/));
    const query = context.query.trim().toLocaleLowerCase();
    const matches = query ? anchors.filter((anchor) => anchor.searchText.toLocaleLowerCase().includes(query)) : anchors;
    return matches.map((anchor) => ({ kind: "heading", anchor }));
  }

  renderSuggestion(suggestion: CitationSuggestion, el: HTMLElement): void {
    if (suggestion.kind === "heading") {
      el.addClass("para-zk-reference-suggestion");
      el.createDiv({ cls: "para-zk-reference-suggestion-title", text: suggestion.anchor.label });
      el.createDiv({ cls: "para-zk-reference-suggestion-detail", text: suggestion.anchor.detail });
      return;
    }

    el.addClass("para-zk-reference-suggestion");
    const reference = suggestion.reference;
    const title = suggestion.index < 0
      ? referenceTitle(reference)
      : `[${suggestion.index}] ${referenceTitle(reference)}`;
    el.createDiv({ cls: "para-zk-reference-suggestion-title", text: title });
    if (reference.description) {
      el.createDiv({ cls: "para-zk-reference-suggestion-detail", text: reference.description });
    }
    el.createDiv({ cls: "para-zk-reference-suggestion-link", text: reference.link });
  }

  selectSuggestion(suggestion: CitationSuggestion, _evt: MouseEvent | KeyboardEvent): void {
    if (suggestion.kind === "heading") {
      this.applyHeading(suggestion.anchor);
      return;
    }
    void this.applyReference(suggestion.reference).catch((error: unknown) => {
      new Notice(registryErrorMessage(error));
    });
  }

  // Replace the typed id fragment with `<id>]` plus a closing backtick, absorbing any `]`/
  // backtick already after the cursor so a pre-existing code span never doubles up. The
  // cursor lands right before the `]` so the user can type `#` to add a section.
  private async applyReference(reference: ReferenceRead): Promise<void> {
    const context = this.context;
    if (!context) return;

    const preferredIndex = this.suggestionIndexes.get(reference);
    const persisted = await ensureReferenceItemId(workflowContext(this.plugin), context.file, reference, preferredIndex);
    if (this.context !== context) return;
    if (persisted.id === null) throw new Error("reference id was not persisted");

    const line = context.editor.getLine(context.start.line);
    const trailing = line.slice(context.end.ch).match(/^\]?`?/)?.[0] ?? "";
    const end = { line: context.end.line, ch: context.end.ch + trailing.length };
    context.editor.replaceRange(`${persisted.id}]\``, context.start, end);
    context.editor.setCursor({ line: context.start.line, ch: context.start.ch + persisted.id.length });
    this.close();
  }

  // Emit `<section>]` plus a closing backtick, absorbing any `]`/backtick already after the
  // cursor (as applyReference does), so a section completes into a valid token even when the
  // user hand-typed `` `PZ[<id># `` without going through the reference pick. The cursor lands
  // past the token, since the section is the terminal step of the citation.
  private applyHeading(anchor: AnchorSuggestion): void {
    const context = this.context;
    if (!context) return;
    const trailing = context.editor.getLine(context.start.line).slice(context.end.ch).match(/^\]?`?/)?.[0] ?? "";
    const end = { line: context.end.line, ch: context.end.ch + trailing.length };
    context.editor.replaceRange(`${anchor.value}]\``, context.start, end);
    context.editor.setCursor({ line: context.start.line, ch: context.start.ch + anchor.value.length + 2 });
    this.close();
  }
}

// Parse what the cursor is completing inside an open `` `PZ[ `` code span, or null when the
// cursor is not inside one. The current entry is the text after the last comma; a `#` in it
// switches from completing the id to completing a section of that id's reference.
function parseCitationTrigger(beforeCursor: string): CitationTrigger | null {
  const span = beforeCursor.match(/`PZ\[([^`\]\n]*)$/);
  if (!span) return null;

  const inner = span[1];
  const segment = inner.slice(inner.lastIndexOf(",") + 1);
  const hash = segment.indexOf("#");
  if (hash !== -1) {
    const referenceId = segment.slice(0, hash).trim();
    if (!/^[A-Za-z0-9_-]+$/.test(referenceId)) return null;
    return { mode: "heading", referenceId, query: segment.slice(hash + 1) };
  }
  return { mode: "reference", query: segment.replace(/^\s+/, "") };
}

function resolveReferenceFile(
  plugin: ParaZkPluginContext,
  reference: ReferenceRead,
  sourcePath: string
): TFile | undefined {
  if (reference.path) {
    const file = plugin.app.vault.getAbstractFileByPath(reference.path);
    return file instanceof TFile ? file : undefined;
  }
  if (reference.kind === "wiki" && reference.target) {
    const dest = plugin.app.metadataCache.getFirstLinkpathDest(splitObsidianSubpath(reference.target).base, sourcePath);
    return dest instanceof TFile ? dest : undefined;
  }
  return undefined;
}

function referenceCitationSearchText(reference: ReferenceRead): string {
  return [
    referenceTitle(reference),
    reference.description ?? "",
    reference.link
  ].join(" ");
}
