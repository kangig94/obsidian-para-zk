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
import { CITATION_TOKEN_RE, buildCitationElement, parseCitationKeys, resolveReferences, type CitationKey } from "./citation-renderer";

// Live Preview counterpart to the reading-view citation post-processor: render a
// `` `PZ[<id>]` `` / `` `PZ[<id>, <id>]` `` inline-code token as bracketed `[n, m]` links, reusing the
// same anchor builder and sync reference resolver. CM6 decorations are synchronous, so
// references resolve once per pass (from the cached frontmatter) and are handed to each
// widget — which keeps it fresh when the registry changes (eq compares ordered reference ids).
// (Mirrors the removed inline-actions.ts pattern: ViewPlugin + replace widget.)
export function createCitationEditorExtension(plugin: ParaZkPluginContext): Extension {
  class CitationWidget extends WidgetType {
    private readonly referenceSignature: string;

    constructor(
      private readonly keys: CitationKey[],
      private readonly references: ReferenceRead[],
      private readonly sourcePath: string
    ) {
      super();
      this.referenceSignature = citationReferenceSignature(references);
    }

    eq(widget: WidgetType): boolean {
      if (!(widget instanceof CitationWidget) || widget.keys.length !== this.keys.length) return false;
      return this.referenceSignature === widget.referenceSignature
        && this.keys.every((key, position) =>
          key.id === widget.keys[position].id && key.subpath === widget.keys[position].subpath);
    }

    toDOM(): HTMLElement {
      const host = document.createElement("span");
      host.className = "para-zk-citation-host";
      buildCitationElement(plugin, this.references, this.keys, this.sourcePath, host);
      return host;
    }

    // Let pointer events reach the rendered anchors (open the reference / hover preview)
    // rather than being handled as editor input.
    ignoreEvent(): boolean {
      return true;
    }
  }

  // Reveal the raw token source (skip the widget) when the cursor/selection is strictly
  // inside it, so the user can edit it — matching native Live Preview behavior for
  // links/code. Touching the outer edges keeps the widget rendered.
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
      CITATION_TOKEN_RE.lastIndex = 0;
      for (let match = CITATION_TOKEN_RE.exec(text); match; match = CITATION_TOKEN_RE.exec(text)) {
        const keys = parseCitationKeys(match[1]);
        if (!keys) continue;
        const from = range.from + match.index;
        const to = from + match[0].length;
        if (selectionInside(view, from, to)) continue;
        builder.add(from, to, Decoration.replace({ widget: new CitationWidget(keys, references, sourcePath) }));
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

function citationReferenceSignature(references: ReferenceRead[]): string {
  return references
    .map((reference) => [
      reference.id,
      reference.link,
      reference.kind,
      reference.path ?? "",
      reference.target ?? "",
      reference.description ?? ""
    ].join("\u0000"))
    .join("\u0001");
}
