import {
  RangeSetBuilder,
  StateEffect,
  StateField,
  type EditorState,
  type Extension
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet
} from "@codemirror/view";
import {
  MarkdownRenderChild,
  TFile,
  editorInfoField,
  editorLivePreviewField,
  type EventRef
} from "obsidian";
import type { ParaZkPluginContext } from "../plugin-interface";
import { inferPropsViewType } from "../props/schema";
import { managedUiBlocksForType } from "../templates";
import {
  normalizeFrontmatterType,
  readFrontmatterTypeFromContent,
  yamlFrontmatterRange
} from "../vault/sections";
import { renderManagedPanel } from "./blocks/managed-sections";
import { renderBlockNotice } from "./blocks/shell";
import { renderPropsPanel } from "./props-controls";

type NoteChromeWidgetKind = "props" | "managed";

// Block widgets CANNOT be supplied through a ViewPlugin's `decorations` — CodeMirror
// throws "Block decorations may not be specified via plugins". The props (top) and
// managed (bottom) panels are full-width blocks, so they are provided by a StateField
// (`EditorView.decorations.from`). External frontmatter edits (CLI/MCP/properties/sync)
// and renames don't change the document, so they re-run the field by dispatching this
// effect from a small companion ViewPlugin that owns the metadata/rename listeners.
const refreshNoteChrome = StateEffect.define<null>();

export function createNoteChromeEditorExtension(plugin: ParaZkPluginContext): Extension {
  class NoteChromeWidget extends WidgetType {
    private readonly kind: NoteChromeWidgetKind;
    private readonly sourcePath: string;
    private readonly signature: string;
    private child: NoteChromeWidgetRenderChild | undefined;
    private resizeObserver: ResizeObserver | undefined;

    constructor(
      kind: NoteChromeWidgetKind,
      sourcePath: string,
      signature: string
    ) {
      super();
      this.kind = kind;
      this.sourcePath = sourcePath;
      this.signature = signature;
    }

    eq(widget: WidgetType): boolean {
      return widget instanceof NoteChromeWidget
        && widget.kind === this.kind
        && widget.sourcePath === this.sourcePath
        && widget.signature === this.signature;
    }

    get estimatedHeight(): number {
      return this.kind === "managed" ? 360 : 160;
    }

    toDOM(view: EditorView): HTMLElement {
      const host = document.createElement("div");
      host.addClass("para-zk-note-chrome-widget", `para-zk-note-chrome-widget--${this.kind}`);
      host.dataset.paraZkSourcePath = this.sourcePath;
      host.contentEditable = "false";
      host.setAttribute("contenteditable", "false");
      this.resizeObserver = observeWidgetResize(host, view);

      if (this.kind === "props") {
        renderPropsPanel(plugin, host, this.sourcePath);
        view.requestMeasure();
        return host;
      }

      const child = new NoteChromeWidgetRenderChild(host);
      child.load();
      this.child = child;
      void renderManagedPanel(plugin, host, this.sourcePath, child)
        .then(() => {
          if (!child.isUnloaded) view.requestMeasure();
        })
        .catch((error: unknown) => {
          if (!child.isUnloaded) {
            renderBlockNotice(host, "managed", error instanceof Error ? error.message : String(error));
            view.requestMeasure();
          }
        });
      return host;
    }

    destroy(): void {
      this.resizeObserver?.disconnect();
      this.resizeObserver = undefined;
      this.child?.unload();
      this.child = undefined;
    }

    ignoreEvent(): boolean {
      return true;
    }
  }

  const buildDecorations = (state: EditorState): DecorationSet => {
    const builder = new RangeSetBuilder<Decoration>();
    if (state.field(editorLivePreviewField, false) !== true) return builder.finish();

    const file = state.field(editorInfoField, false)?.file;
    if (!(file instanceof TFile)) return builder.finish();

    const content = state.doc.toString();
    const type = readFrontmatterTypeFromContent(content)
      ?? cachedFrontmatterType(plugin, file);
    if (!isParaZkType(plugin, type)) return builder.finish();

    const signature = noteChromeSignature(plugin, file, type);
    const propsPos = frontmatterEndPosition(content);
    const managedPos = state.doc.length;
    builder.add(
      propsPos,
      propsPos,
      Decoration.widget({
        widget: new NoteChromeWidget("props", file.path, signature),
        block: true,
        side: -1
      })
    );
    builder.add(
      managedPos,
      managedPos,
      Decoration.widget({
        widget: new NoteChromeWidget("managed", file.path, signature),
        block: true,
        side: 1
      })
    );
    return builder.finish();
  };

  const noteChromeField = StateField.define<DecorationSet>({
    create: (state) => buildDecorations(state),
    update(value, tr) {
      if (
        tr.docChanged
        || tr.effects.some((effect) => effect.is(refreshNoteChrome))
        || tr.startState.field(editorLivePreviewField, false) !== tr.state.field(editorLivePreviewField, false)
      ) {
        return buildDecorations(tr.state);
      }
      return value.map(tr.changes);
    },
    provide: (field) => EditorView.decorations.from(field)
  });

  // Companion plugin: no decorations of its own — it only watches external frontmatter
  // and rename events for the open file and asks the field to recompute. Listeners are
  // registered in the constructor and offref'd in destroy(), so they don't leak across
  // editor recreations.
  const externalRefresh = ViewPlugin.fromClass(
    class {
      private readonly view: EditorView;
      private readonly metadataChangeRef: EventRef;
      private readonly renameRef: EventRef;

      constructor(view: EditorView) {
        this.view = view;
        this.metadataChangeRef = plugin.app.metadataCache.on("changed", (file) => this.onExternalChange(file.path));
        this.renameRef = plugin.app.vault.on("rename", (file, oldPath) => {
          if (file instanceof TFile) this.onRename(file, oldPath);
        });
      }

      destroy(): void {
        plugin.app.metadataCache.offref(this.metadataChangeRef);
        plugin.app.vault.offref(this.renameRef);
      }

      private onExternalChange(path: string): void {
        if (path !== editorFilePath(this.view.state)) return;
        this.view.dispatch({ effects: refreshNoteChrome.of(null) });
      }

      private onRename(file: TFile, oldPath?: string): void {
        const sourcePath = editorFilePath(this.view.state);
        if (sourcePath !== file.path && sourcePath !== oldPath) return;
        this.view.dispatch({ effects: refreshNoteChrome.of(null) });
      }
    }
  );

  return [noteChromeField, externalRefresh];
}

function observeWidgetResize(host: HTMLElement, view: EditorView): ResizeObserver | undefined {
  if (typeof ResizeObserver === "undefined") return undefined;
  const observer = new ResizeObserver(() => view.requestMeasure());
  observer.observe(host);
  return observer;
}

class NoteChromeWidgetRenderChild extends MarkdownRenderChild {
  isUnloaded = true;

  onload(): void {
    this.isUnloaded = false;
  }

  onunload(): void {
    this.isUnloaded = true;
  }
}

function editorFilePath(state: EditorState): string | undefined {
  const file = state.field(editorInfoField, false)?.file;
  return file instanceof TFile ? file.path : undefined;
}

function frontmatterEndPosition(content: string): number {
  return yamlFrontmatterRange(content)?.end ?? 0;
}

function cachedFrontmatterType(plugin: ParaZkPluginContext, file: TFile): string | undefined {
  return normalizeFrontmatterType(plugin.app.metadataCache.getFileCache(file)?.frontmatter?.type);
}

function isParaZkType(plugin: ParaZkPluginContext, type: string | undefined): boolean {
  if (!type) return false;
  return inferPropsViewType({ type }) !== undefined
    || managedUiBlocksForType(type, plugin.settings) !== undefined;
}

function noteChromeSignature(plugin: ParaZkPluginContext, file: TFile, type: string | undefined): string {
  const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  return JSON.stringify({
    type,
    locale: plugin.settings.locale,
    frontmatter
  }) ?? "";
}
