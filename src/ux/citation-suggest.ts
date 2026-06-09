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
import {
  ensureReferenceItemId,
  type ReferenceRead
} from "../workflows";
import { registryErrorMessage } from "./registry-block";
import { resolveReferences } from "./citation-renderer";
import { referenceTitle } from "./reference-link";

export class CitationSuggest extends EditorSuggest<ReferenceRead> {
  private readonly suggestionIndexes = new Map<string, number>();

  constructor(private readonly plugin: ParaZkPluginContext) {
    super(plugin.app);
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
    if (!(file instanceof TFile)) return null;

    const beforeCursor = editor.getLine(cursor.line).slice(0, cursor.ch);
    const match = beforeCursor.match(/PZ\[([^\]\n]*)$/);
    if (!match) return null;

    return {
      start: {
        line: cursor.line,
        ch: cursor.ch - match[0].length
      },
      end: cursor,
      query: match[1]
    };
  }

  getSuggestions(context: EditorSuggestContext): ReferenceRead[] {
    const references = resolveReferences(this.plugin, context.file);
    this.suggestionIndexes.clear();
    references.forEach((reference, index) => {
      this.suggestionIndexes.set(reference.id, index);
    });

    const query = context.query.trim().toLocaleLowerCase();
    if (!query) return references;
    return references.filter((reference) =>
      referenceCitationSearchText(reference).toLocaleLowerCase().includes(query));
  }

  renderSuggestion(reference: ReferenceRead, el: HTMLElement): void {
    el.addClass("para-zk-reference-suggestion");
    const index = this.suggestionIndexes.get(reference.id);
    const title = index === undefined
      ? referenceTitle(reference)
      : `[${index}] ${referenceTitle(reference)}`;
    el.createDiv({ cls: "para-zk-reference-suggestion-title", text: title });
    if (reference.description) {
      el.createDiv({ cls: "para-zk-reference-suggestion-detail", text: reference.description });
    }
    el.createDiv({ cls: "para-zk-reference-suggestion-path", text: reference.link });
  }

  selectSuggestion(reference: ReferenceRead, _evt: MouseEvent | KeyboardEvent): void {
    void this.selectSuggestionAsync(reference).catch((error: unknown) => {
      new Notice(registryErrorMessage(error));
    });
  }

  private async selectSuggestionAsync(reference: ReferenceRead): Promise<void> {
    const context = this.context;
    if (!context) return;

    const preferredIndex = this.suggestionIndexes.get(reference.id);
    const persisted = await ensureReferenceItemId(
      workflowContext(this.plugin),
      context.file,
      reference,
      preferredIndex
    );
    const token = `\`PZ[${persisted.id}]\``;
    context.editor.replaceRange(token, context.start, context.end);
    context.editor.setCursor({
      line: context.start.line,
      ch: context.start.ch + token.length
    });
    this.close();
  }
}

function referenceCitationSearchText(reference: ReferenceRead): string {
  return [
    referenceTitle(reference),
    reference.description ?? "",
    reference.link
  ].join(" ");
}
