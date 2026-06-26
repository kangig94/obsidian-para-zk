import {
  MarkdownView,
  MarkdownRenderChild,
  TFile
} from "obsidian";
import type { ParaZkPluginContext } from "../../plugin-interface";
import {
  buildCachedNoteChromeSpec,
  hasNoteChrome,
  renderNoteChromeProps,
  type NoteChromeSpec
} from "../note-chrome-core";
import { ManagedPanelController } from "./managed-sections";
import { placeReadingManagedPanel, placeReadingPropsPanel } from "./reading-note-chrome-slots";
import { refreshPreviewChromeSections } from "./reading-preview-height-sync";
import { renderBlockNotice } from "./shell";

// smoke:
// - Props panel renders above the body after Obsidian Properties in Reading view.
// - Managed panel renders at the bottom of the note body (before the note footer).
// - Notes with legacy para-zk-props/para-zk-managed fences render once because fences are swallowed.
// - Frontmatter changes from CLI, MCP, or Properties editor trigger a re-render.
// - Reading view mode switches attach even when the note has no body block.
// Reading view only: Live Preview is handled by the CM6 editor extension.

const NOTE_CHROME_ATTACH_RETRY_DELAY_MS = 30;
const NOTE_CHROME_INITIAL_ATTACH_DELAY_MS = 60;
const NOTE_CHROME_RERENDER_DELAY_MS = 120;
// Keyed by the reading-view content container (`.markdown-preview-sizer`) so one note
// renders one set of panels. A re-rendered preview builds a fresh sizer -> fresh entry.
const noteChromeControllers = new WeakMap<HTMLElement, NoteChromeController>();
const activeNoteChromeControllers = new Set<NoteChromeController>();
let openReadingViewScanTimers: number[] = [];

export function registerNoteChromeRenderers(plugin: ParaZkPluginContext): void {
  plugin.registerEvent(
    plugin.app.metadataCache.on("changed", (file) => {
      refreshNoteChromeForPath(file.path);
      scheduleOpenReadingViewScan(plugin);
    })
  );
  plugin.registerEvent(
    plugin.app.vault.on("rename", (file, oldPath) => renameNoteChromeSource(file, oldPath))
  );
  plugin.registerEvent(
    plugin.app.workspace.on("layout-change", () => {
      cleanupDisconnectedNoteChromeControllers();
      scheduleOpenReadingViewScan(plugin);
    })
  );
  plugin.registerEvent(
    plugin.app.workspace.on("file-open", () => scheduleOpenReadingViewScan(plugin))
  );
  plugin.registerEvent(
    plugin.app.workspace.on("active-leaf-change", () => scheduleOpenReadingViewScan(plugin))
  );
  registerReadingViewMutationScan(plugin);
  plugin.app.workspace.onLayoutReady(() => scheduleOpenReadingViewScan(plugin));
  plugin.register(() => {
    clearOpenReadingViewScanTimers();
    disposeAllNoteChromeControllers();
  });
}

// The props grid renders from metadataCache, so external frontmatter changes
// (CLI/MCP writes, Obsidian properties edits, sync) must re-render it after the
// cache reparses. Controllers are scoped to the preview sizer, not a markdown
// section, because Obsidian can unload/rebuild individual sections while keeping
// the reading-view container alive.
class NoteChromeController {
  private propsEl: HTMLElement | undefined;
  private managedEl: HTMLElement | undefined;
  private managedChild: NoteChromeManagedRenderChild | undefined;
  private managedController: ManagedPanelController | undefined;
  private managedControllerEl: HTMLElement | undefined;
  private managedControllerChild: NoteChromeManagedRenderChild | undefined;
  private renderTimer: number | undefined;
  private layoutTimer: number | undefined;
  private refreshFrame: number | undefined;
  private renderedPropsSignature: string | undefined;
  private renderedManagedLayoutSignature: string | undefined;
  private pendingSignature: string | undefined;
  private disposed = false;
  private readonly observer: MutationObserver;
  private readonly resizeObserver: ResizeObserver | undefined;
  private readonly plugin: ParaZkPluginContext;
  private readonly container: HTMLElement;
  sourcePath: string;
  private typeHint: string | undefined;

  constructor(
    plugin: ParaZkPluginContext,
    container: HTMLElement,
    sourcePath: string,
    typeHint: string | undefined
  ) {
    this.plugin = plugin;
    this.container = container;
    this.sourcePath = sourcePath;
    this.typeHint = typeHint;
    this.observer = new MutationObserver(() => this.scheduleLayout());
    this.observer.observe(container, { childList: true });
    this.resizeObserver = typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(() => this.schedulePreviewChromeRefresh());
  }

  get isActive(): boolean {
    return !this.disposed && this.container.isConnected;
  }

  updateSource(sourcePath: string, typeHint: string | undefined): void {
    this.sourcePath = sourcePath;
    this.typeHint = typeHint;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderedPropsSignature = undefined;
    this.renderedManagedLayoutSignature = undefined;
    this.pendingSignature = undefined;
    if (this.renderTimer !== undefined) window.clearTimeout(this.renderTimer);
    this.renderTimer = undefined;
    if (this.layoutTimer !== undefined) window.clearTimeout(this.layoutTimer);
    this.layoutTimer = undefined;
    if (this.refreshFrame !== undefined) window.cancelAnimationFrame(this.refreshFrame);
    this.refreshFrame = undefined;
    this.observer.disconnect();
    this.resizeObserver?.disconnect();
    this.removeInjectedPanels();
    if (noteChromeControllers.get(this.container) === this) noteChromeControllers.delete(this.container);
    activeNoteChromeControllers.delete(this);
  }

  refreshIfPath(path: string): void {
    if (path !== this.sourcePath) return;
    this.typeHint = undefined;
    this.scheduleRender();
  }

  renameIfPath(file: TFile, oldPath?: string): void {
    if (this.sourcePath !== oldPath && this.sourcePath !== file.path) return;
    this.sourcePath = file.path;
    this.typeHint = undefined;
    this.scheduleRender();
  }

  scheduleRender(delayMs = NOTE_CHROME_RERENDER_DELAY_MS): void {
    const spec = buildCachedNoteChromeSpec(this.plugin, this.sourcePath, this.typeHint);
    const signature = renderSignature(spec);
    if (signature === this.renderedSignature && this.hasRenderedPanels(spec)) {
      this.ensureLayout();
      this.schedulePreviewChromeRefresh();
      return;
    }
    if (signature === this.pendingSignature) return;

    this.pendingSignature = signature;
    if (this.renderTimer !== undefined) window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = undefined;
      this.pendingSignature = undefined;
      this.renderNow();
    }, delayMs);
  }

  private renderNow(): void {
    if (this.disposed) return;
    if (!this.container.isConnected) {
      this.dispose();
      return;
    }
    const spec = buildCachedNoteChromeSpec(this.plugin, this.sourcePath, this.typeHint);
    if (!hasNoteChrome(spec)) {
      this.removeInjectedPanels();
      this.schedulePreviewChromeRefresh();
      return;
    }

    if (spec.hasProps) {
      const propsEl = this.ensurePropsEl();
      propsEl.dataset.paraZkSourcePath = this.sourcePath;
      if (spec.propsSignature !== this.renderedPropsSignature || !propsEl.isConnected) {
        renderNoteChromeProps(this.plugin, propsEl, spec);
      }
      this.renderedPropsSignature = spec.propsSignature;
    } else {
      this.removePropsPanel();
    }

    if (spec.hasManaged) {
      const managedEl = this.ensureManagedEl();
      managedEl.dataset.paraZkSourcePath = this.sourcePath;
      if (!managedEl.hasChildNodes()) managedEl.addClass("para-zk-hidden");
      if (!managedEl.isConnected) placeReadingManagedPanel(this.container, managedEl);
      if (spec.managedLayoutSignature !== this.renderedManagedLayoutSignature || !managedEl.isConnected) {
        try {
          this.ensureManagedController(managedEl).update(spec.sourcePath, spec.type);
          this.renderedManagedLayoutSignature = spec.managedLayoutSignature;
        } catch (error) {
          this.disposeManagedController();
          managedEl.removeClass("para-zk-hidden");
          renderBlockNotice(managedEl, "managed", error instanceof Error ? error.message : String(error));
          this.renderedManagedLayoutSignature = undefined;
        }
      } else {
        this.renderedManagedLayoutSignature = spec.managedLayoutSignature;
      }
    } else {
      this.removeManagedPanel();
    }

    this.ensureLayout();
    this.schedulePreviewChromeRefresh();
  }

  private ensurePropsEl(): HTMLElement {
    if (!this.propsEl) {
      this.propsEl = this.container.querySelector<HTMLElement>(
        ":scope > .para-zk-note-chrome--props, :scope > .mod-header > .para-zk-note-chrome--props"
      ) ?? undefined;
    }
    if (!this.propsEl) {
      this.propsEl = this.container.ownerDocument.createElement("div");
      this.propsEl.addClass("para-zk-note-chrome", "para-zk-note-chrome--props");
    }
    this.resizeObserver?.observe(this.propsEl);
    removeDuplicatePropsPanels(this.container, this.propsEl);
    return this.propsEl;
  }

  private ensureManagedEl(): HTMLElement {
    if (!this.managedEl) {
      this.managedEl = this.container.querySelector<HTMLElement>(
        ":scope > .para-zk-note-chrome--managed, :scope > .mod-footer > .para-zk-note-chrome--managed"
      ) ?? undefined;
    }
    if (!this.managedEl) {
      this.managedEl = this.container.ownerDocument.createElement("div");
      this.managedEl.addClass("para-zk-note-chrome", "para-zk-note-chrome--managed");
    }
    this.resizeObserver?.observe(this.managedEl);
    removeDuplicateManagedPanels(this.container, this.managedEl);
    return this.managedEl;
  }

  private ensureLayout(): void {
    if (this.propsEl) placeReadingPropsPanel(this.container, this.propsEl);
    if (this.managedEl) placeReadingManagedPanel(this.container, this.managedEl);
  }

  private scheduleLayout(): void {
    if (this.layoutTimer !== undefined) return;
    this.layoutTimer = window.setTimeout(() => {
      this.layoutTimer = undefined;
      if (this.disposed) return;
      if (!this.container.isConnected) {
        this.dispose();
        return;
      }
      this.ensureLayout();
      this.schedulePreviewChromeRefresh();
    }, 0);
  }

  private schedulePreviewChromeRefresh(): void {
    if (this.refreshFrame !== undefined) return;
    this.refreshFrame = window.requestAnimationFrame(() => {
      this.refreshFrame = undefined;
      if (this.disposed || !this.container.isConnected) return;
      this.ensureLayout();
      refreshPreviewChromeSections(this.plugin, this.container);
    });
  }

  private ensureManagedChild(managedEl: HTMLElement): NoteChromeManagedRenderChild {
    if (this.managedChild?.containerEl !== managedEl) {
      this.managedChild?.unload();
      this.managedChild = new NoteChromeManagedRenderChild(managedEl);
      this.managedChild.load();
    }
    return this.managedChild;
  }

  private ensureManagedController(managedEl: HTMLElement): ManagedPanelController {
    const currentChild = this.managedChild;
    if (
      this.managedController
      && this.managedControllerEl === managedEl
      && this.managedControllerChild === currentChild
      && currentChild?.containerEl === managedEl
    ) {
      return this.managedController;
    }

    this.disposeManagedController();
    const child = this.ensureManagedChild(managedEl);
    this.managedController = new ManagedPanelController(this.plugin, managedEl, child);
    this.managedControllerEl = managedEl;
    this.managedControllerChild = child;
    return this.managedController;
  }

  private disposeManagedController(): void {
    this.managedController?.dispose();
    this.managedController = undefined;
    this.managedControllerEl = undefined;
    this.managedControllerChild = undefined;
  }

  private get renderedSignature(): string {
    return JSON.stringify({
      props: this.renderedPropsSignature,
      managed: this.renderedManagedLayoutSignature
    });
  }

  private hasRenderedPanels(spec: NoteChromeSpec): boolean {
    const propsReady = !spec.hasProps || this.propsEl?.isConnected === true;
    const managedReady = !spec.hasManaged || this.managedEl?.isConnected === true;
    return propsReady && managedReady;
  }

  private removePropsPanel(): void {
    if (this.propsEl) this.resizeObserver?.unobserve(this.propsEl);
    this.propsEl?.remove();
    this.propsEl = undefined;
    this.renderedPropsSignature = undefined;
  }

  private removeManagedPanel(): void {
    this.disposeManagedController();
    this.managedChild?.unload();
    this.managedChild = undefined;
    if (this.managedEl) this.resizeObserver?.unobserve(this.managedEl);
    this.managedEl?.remove();
    this.managedEl = undefined;
    this.renderedManagedLayoutSignature = undefined;
  }

  private removeInjectedPanels(): void {
    this.removePropsPanel();
    this.removeManagedPanel();
    this.pendingSignature = undefined;
  }
}

class NoteChromeManagedRenderChild extends MarkdownRenderChild {}

function renderSignature(spec: NoteChromeSpec): string {
  return JSON.stringify({
    props: spec.propsSignature,
    managed: spec.managedLayoutSignature
  });
}

function ensureNoteChromeController(
  plugin: ParaZkPluginContext,
  container: HTMLElement,
  sourcePath: string,
  typeHint: string | undefined
): NoteChromeController {
  let controller = noteChromeControllers.get(container);
  if (!controller?.isActive) {
    controller?.dispose();
    controller = new NoteChromeController(plugin, container, sourcePath, typeHint);
    noteChromeControllers.set(container, controller);
    activeNoteChromeControllers.add(controller);
  } else {
    controller.updateSource(sourcePath, typeHint);
  }
  return controller;
}

function refreshNoteChromeForPath(path: string): void {
  for (const controller of Array.from(activeNoteChromeControllers)) {
    if (!controller.isActive) {
      controller.dispose();
      continue;
    }
    controller.refreshIfPath(path);
  }
}

function scheduleOpenReadingViewScan(plugin: ParaZkPluginContext): void {
  cleanupNoteChromeForOpenViews(plugin);
  clearOpenReadingViewScanTimers();
  openReadingViewScanTimers = [
    window.setTimeout(() => scanOpenReadingViews(plugin), NOTE_CHROME_INITIAL_ATTACH_DELAY_MS),
    window.setTimeout(() => scanOpenReadingViews(plugin), NOTE_CHROME_INITIAL_ATTACH_DELAY_MS + NOTE_CHROME_ATTACH_RETRY_DELAY_MS)
  ];
}

function clearOpenReadingViewScanTimers(): void {
  for (const timer of openReadingViewScanTimers) window.clearTimeout(timer);
  openReadingViewScanTimers = [];
}

function registerReadingViewMutationScan(plugin: ParaZkPluginContext): void {
  const workspaceEl = plugin.app.workspace.containerEl;
  const observer = new MutationObserver((mutations) => {
    if (mutations.some(addsReadingViewPreview)) scheduleOpenReadingViewScan(plugin);
  });
  observer.observe(workspaceEl, { childList: true, subtree: true });
  plugin.register(() => observer.disconnect());
}

function addsReadingViewPreview(mutation: MutationRecord): boolean {
  for (const node of Array.from(mutation.addedNodes)) {
    if (node.instanceOf(HTMLElement) && hasReadingViewPreview(node)) return true;
  }
  return false;
}

function hasReadingViewPreview(el: HTMLElement): boolean {
  return el.matches(".markdown-preview-view, .markdown-preview-sizer")
    || el.querySelector(".markdown-preview-view, .markdown-preview-sizer") !== null;
}

function scanOpenReadingViews(plugin: ParaZkPluginContext): void {
  cleanupDisconnectedNoteChromeControllers();
  cleanupNoteChromeForOpenViews(plugin);
  for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) {
    if (!(leaf.view instanceof MarkdownView)) continue;
    if (leaf.view.getMode() !== "preview") continue;

    const file = leaf.view.file;
    if (!(file instanceof TFile)) continue;

    const preview = leaf.view.containerEl.querySelector<HTMLElement>(".markdown-preview-view");
    if (preview && !isVisibleElement(preview)) continue;

    const container = leaf.view.containerEl.querySelector<HTMLElement>(".markdown-preview-sizer");
    if (!container) continue;

    const spec = buildCachedNoteChromeSpec(plugin, file.path);
    if (!hasNoteChrome(spec)) continue;
    ensureNoteChromeController(plugin, container, file.path, spec.type).scheduleRender(0);
  }
}

function cleanupNoteChromeForOpenViews(plugin: ParaZkPluginContext): void {
  for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) {
    if (!(leaf.view instanceof MarkdownView)) continue;
    const preview = leaf.view.containerEl.querySelector<HTMLElement>(".markdown-preview-view");
    const container = leaf.view.containerEl.querySelector<HTMLElement>(".markdown-preview-sizer");
    if (!container) continue;

    if (!preview || !isVisibleElement(preview)) {
      noteChromeControllers.get(container)?.dispose();
      removeInjectedPanels(container);
      continue;
    }

    const file = leaf.view.file;
    const sourcePath = file instanceof TFile ? file.path : undefined;
    const controller = noteChromeControllers.get(container);
    if (controller && controller.sourcePath !== sourcePath) {
      controller.dispose();
      continue;
    }

    removeStaleInjectedPanels(container, sourcePath);
  }
}

function renameNoteChromeSource(file: unknown, oldPath?: string): void {
  if (!(file instanceof TFile)) return;
  for (const controller of Array.from(activeNoteChromeControllers)) {
    if (!controller.isActive) {
      controller.dispose();
      continue;
    }
    controller.renameIfPath(file, oldPath);
  }
}

function cleanupDisconnectedNoteChromeControllers(): void {
  for (const controller of Array.from(activeNoteChromeControllers)) {
    if (!controller.isActive) controller.dispose();
  }
}

function disposeAllNoteChromeControllers(): void {
  for (const controller of Array.from(activeNoteChromeControllers)) {
    controller.dispose();
  }
}

function removeDuplicatePropsPanels(container: HTMLElement, keep: HTMLElement): void {
  for (const panel of propsPanelCandidates(container)) {
    if (panel !== keep) panel.remove();
  }
}

function removeDuplicateManagedPanels(container: HTMLElement, keep: HTMLElement): void {
  for (const panel of managedPanelCandidates(container)) {
    if (panel !== keep) panel.remove();
  }
}

function removeStaleInjectedPanels(container: HTMLElement, sourcePath: string | undefined): void {
  for (const panel of injectedPanelCandidates(container)) {
    if (panel.dataset.paraZkSourcePath !== sourcePath) panel.remove();
  }
}

function removeInjectedPanels(container: HTMLElement): void {
  for (const panel of injectedPanelCandidates(container)) {
    panel.remove();
  }
}

function injectedPanelCandidates(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(
    ":scope > .para-zk-note-chrome, :scope > .mod-header > .para-zk-note-chrome, :scope > .mod-footer > .para-zk-note-chrome"
  ));
}

function propsPanelCandidates(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(
    ":scope > .para-zk-note-chrome--props, :scope > .mod-header > .para-zk-note-chrome--props"
  ));
}

function managedPanelCandidates(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(
    ":scope > .para-zk-note-chrome--managed, :scope > .mod-footer > .para-zk-note-chrome--managed"
  ));
}

function isVisibleElement(el: HTMLElement): boolean {
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}
