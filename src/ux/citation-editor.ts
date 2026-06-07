import { RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type EditorView,
  type ViewUpdate
} from "@codemirror/view";
import { TFile, editorInfoField, editorLivePreviewField } from "obsidian";
import type { ParaZkPluginContext } from "../plugin-interface";
import type { ReferenceRead } from "../workflows";
import { buildCitationElement, resolveReferences } from "./citation-renderer";

// Live Preview counterpart to the reading-view citation post-processor: render a
// `` `PZ[n]` `` inline-code token as a `[n]` link to ref[n], reusing the same anchor builder
// and sync reference resolver. CM6 decorations are synchronous, so references are resolved
// once per decoration pass (from the cached frontmatter) and handed to each widget — which
// also keeps a widget fresh when the registry changes (eq compares the resolved target).
// (Mirrors the removed inline-actions.ts pattern: ViewPlugin + replace widget.)
export function createCitationEditorExtension(plugin: ParaZkPluginContext): Extension {
  class CitationWidget extends WidgetType {
    constructor(
      private readonly index: number,
      private readonly reference: ReferenceRead | undefined,
      private readonly sourcePath: string
    ) {
      super();
    }

    eq(widget: WidgetType): boolean {
      return widget instanceof CitationWidget
        && widget.index === this.index
        && widget.reference?.link === this.reference?.link
        && widget.reference?.kind === this.reference?.kind;
    }

    toDOM(): HTMLElement {
      const host = document.createElement("span");
      host.className = "para-zk-citation-host";
      buildCitationElement(plugin, this.reference, this.index, this.sourcePath, host);
      return host;
    }

    // Let pointer events reach the rendered anchor (open the reference / hover preview)
    // rather than being handled as editor input.
    ignoreEvent(): boolean {
      return true;
    }
  }

  const tokenRe = /`PZ\[(\d+)\]`/g;

  // Reveal the raw `` `PZ[n]` `` source (skip the widget) when the cursor/selection is
  // strictly inside the token, so the user can edit it — matching native Live Preview
  // behavior for links/code. Touching the outer edges keeps the widget rendered.
  const selectionInside = (view: EditorView, from: number, to: number): boolean =>
    view.state.selection.ranges.some((range) => range.from < to && range.to > from);

  const buildDecorations = (view: EditorView): DecorationSet => {
    const builder = new RangeSetBuilder<Decoration>();
    // Only decorate in Live Preview; source mode shows raw markdown.
    if (!view.state.field(editorLivePreviewField)) return builder.finish();

    const file = view.state.field(editorInfoField, false)?.file;
    const sourcePath = file?.path ?? "";
    const references = file instanceof TFile ? resolveReferences(plugin, file) : [];

    for (const range of view.visibleRanges) {
      const text = view.state.doc.sliceString(range.from, range.to);
      tokenRe.lastIndex = 0;
      for (let match = tokenRe.exec(text); match; match = tokenRe.exec(text)) {
        const from = range.from + match.index;
        const to = from + match[0].length;
        if (selectionInside(view, from, to)) continue;
        builder.add(from, to, Decoration.replace({ widget: new CitationWidget(Number(match[1]), references[Number(match[1])], sourcePath) }));
      }
    }
    return builder.finish();
  };

  class CitationEditorPlugin {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate): void {
      // selectionSet: re-evaluate so the token reveals/hides as the cursor moves in/out.
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildDecorations(update.view);
      }
    }
  }

  return ViewPlugin.fromClass(CitationEditorPlugin, {
    decorations: (value) => value.decorations
  });
}
