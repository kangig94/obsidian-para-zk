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
import { createDetachedDiv } from "./dom";
import {
  yamlFrontmatterRange
} from "../vault/sections";
import {
  buildEditorNoteChromeSpec,
  hasNoteChrome,
  renderNoteChromeProps,
  type NoteChromeKind,
  type NoteChromeSpec
} from "./note-chrome-core";
import { ManagedPanelController } from "./blocks/managed-sections";
import { renderBlockNotice } from "./blocks/shell";
import { disposePropsControlRenderers } from "./props-controls";

// Block widgets CANNOT be supplied through a ViewPlugin's `decorations` — CodeMirror
// throws "Block decorations may not be specified via plugins". The props (top) and
// managed (bottom) panels are full-width blocks, so they are provided by a StateField
// (`EditorView.decorations.from`). External frontmatter edits (CLI/MCP/properties/sync)
// and renames don't change the document, so they re-run the field by dispatching this
// effect from a small companion ViewPlugin that owns the metadata/rename listeners.
const refreshNoteChrome = StateEffect.define<null>();

export function createNoteChromeEditorExtension(plugin: ParaZkPluginContext): Extension {
  class NoteChromeWidget extends WidgetType {
    private readonly kind: NoteChromeKind;
    private readonly spec: NoteChromeSpec;
    private child: NoteChromeWidgetRenderChild | undefined;
    private managedController: ManagedPanelController | undefined;
    private managedUpdateFrame: number | undefined;
    private resizeObserver: ResizeObserver | undefined;

    constructor(
      kind: NoteChromeKind,
      spec: NoteChromeSpec
    ) {
      super();
      this.kind = kind;
      this.spec = spec;
    }

    eq(widget: WidgetType): boolean {
      const signature = this.kind === "props"
        ? this.spec.propsSignature
        : this.spec.managedLayoutSignature;
      const otherSignature = widget instanceof NoteChromeWidget
        ? widget.kind === "props"
          ? widget.spec.propsSignature
          : widget.spec.managedLayoutSignature
        : undefined;
      return widget instanceof NoteChromeWidget
        && widget.kind === this.kind
        && widget.spec.sourcePath === this.spec.sourcePath
        && otherSignature === signature;
    }

    get estimatedHeight(): number {
      return this.kind === "managed" ? 360 : 160;
    }

    toDOM(view: EditorView): HTMLElement {
      const host = createDetachedDiv(view.dom, {
        cls: `para-zk-note-chrome-widget para-zk-note-chrome-widget--${this.kind}`
      });
      if (this.spec.sourcePath) host.dataset.paraZkSourcePath = this.spec.sourcePath;
      host.contentEditable = "false";
      host.setAttribute("contenteditable", "false");
      this.resizeObserver = observeWidgetResize(host, view);

      if (this.kind === "props") {
        const child = new NoteChromeWidgetRenderChild(host);
        child.register(() => disposePropsControlRenderers(host));
        child.load();
        this.child = child;
        renderNoteChromeProps(plugin, host, this.spec);
        view.requestMeasure();
        return host;
      }

      const child = new NoteChromeWidgetRenderChild(host);
      child.load();
      this.child = child;
      this.scheduleManagedUpdate(plugin, host, child, view);
      return host;
    }

    destroy(): void {
      if (this.managedUpdateFrame !== undefined) window.cancelAnimationFrame(this.managedUpdateFrame);
      this.managedUpdateFrame = undefined;
      this.resizeObserver?.disconnect();
      this.resizeObserver = undefined;
      this.managedController?.dispose();
      this.managedController = undefined;
      this.child?.unload();
      this.child = undefined;
    }

    ignoreEvent(): boolean {
      return true;
    }

    private scheduleManagedUpdate(
      plugin: ParaZkPluginContext,
      host: HTMLElement,
      child: NoteChromeWidgetRenderChild,
      view: EditorView
    ): void {
      if (this.managedUpdateFrame !== undefined) window.cancelAnimationFrame(this.managedUpdateFrame);
      const renderWhenConnected = () => {
        this.managedUpdateFrame = undefined;
        if (child.isUnloaded) return;
        if (!host.isConnected) {
          this.managedUpdateFrame = window.requestAnimationFrame(renderWhenConnected);
          return;
        }

        try {
          this.managedController = new ManagedPanelController(plugin, host, child);
          this.managedController.update(this.spec.sourcePath, this.spec.type);
        } catch (error) {
          this.managedController?.dispose();
          this.managedController = undefined;
          renderBlockNotice(host, "managed", error instanceof Error ? error.message : String(error));
        }
        view.requestMeasure();
      };
      this.managedUpdateFrame = window.requestAnimationFrame(renderWhenConnected);
    }
  }

  const buildDecorations = (state: EditorState): DecorationSet => {
    const builder = new RangeSetBuilder<Decoration>();
    if (state.field(editorLivePreviewField, false) !== true) return builder.finish();

    const file = state.field(editorInfoField, false)?.file;
    if (!(file instanceof TFile)) return builder.finish();

    const content = state.doc.toString();
    const spec = buildEditorNoteChromeSpec(plugin, file, content);
    if (!hasNoteChrome(spec)) return builder.finish();

    if (spec.hasProps) {
      const propsPos = frontmatterEndPosition(content);
      builder.add(
        propsPos,
        propsPos,
        Decoration.widget({
          widget: new NoteChromeWidget("props", spec),
          block: true,
          side: -1
        })
      );
    }
    if (spec.hasManaged) {
      const managedPos = state.doc.length;
      builder.add(
        managedPos,
        managedPos,
        Decoration.widget({
          widget: new NoteChromeWidget("managed", spec),
          block: true,
          side: 1
        })
      );
    }
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
