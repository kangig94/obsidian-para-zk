import {
  MarkdownView,
  MarkdownRenderChild,
  TFile,
  type MarkdownPostProcessorContext
} from "obsidian";
import type { ParaZkPluginContext } from "../../plugin-interface";
import { inferPropsViewType } from "../../props/schema";
import { isRecord } from "../../records";
import { managedUiBlocksForType } from "../../templates";
import { normalizeFrontmatterType } from "../../vault/sections";
import { renderPropsPanel } from "../props-controls";
import { renderManagedPanel } from "./managed-sections";
import { renderBlockNotice } from "./shell";

// smoke:
// - Props panel renders above the body after Obsidian Properties in Reading view.
// - Managed panel renders at the bottom of the note body (before the note footer).
// - Notes with legacy para-zk-props/para-zk-managed fences render once because fences are swallowed.
// - Frontmatter changes from CLI, MCP, or Properties editor trigger a re-render.
// - Reading view mode switches attach even when the note has no body block for a post-processor.
// Reading view only: Live Preview is handled by the CM6 editor extension. This processor
// injects only when the element resolves to a `.markdown-preview-sizer` (the reading-view
// content container), so Live Preview (no sizer) never double-renders.

const NOTE_CHROME_ATTACH_RETRY_LIMIT = 12;
const NOTE_CHROME_ATTACH_RETRY_DELAY_MS = 30;
const NOTE_CHROME_INITIAL_ATTACH_DELAY_MS = 60;
const NOTE_CHROME_RERENDER_DELAY_MS = 120;
// Keyed by the reading-view content container (`.markdown-preview-sizer`) so one note
// renders one set of panels. A re-rendered preview builds a fresh sizer -> fresh entry.
const noteChromeControllers = new WeakMap<HTMLElement, NoteChromeController>();
const activeNoteChromeControllers = new Set<NoteChromeController>();
let openReadingViewScanTimers: number[] = [];

export function registerNoteChromeRenderers(plugin: ParaZkPluginContext): void {
  plugin.registerMarkdownPostProcessor((el, ctx) => renderNoteChrome(plugin, el, ctx));
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

function renderNoteChrome(
  plugin: ParaZkPluginContext,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
): void {
  // Skip embedded previews and nested renders from managed note chrome.
  if (isNestedNoteChromeRender(el)) return;

  const frontmatter: unknown = ctx.frontmatter;
  const typeHint = normalizeFrontmatterType(isRecord(frontmatter) ? frontmatter.type : undefined);
  if (!isParaZkNote(plugin, ctx.sourcePath, typeHint)) return;

  // At post-processor time Obsidian may still hold the section in a detached fragment.
  // Resolve the note container on a later tick, then let a sizer-level controller own
  // the injected panels instead of tying note-level chrome to one section's lifecycle.
  scheduleNoteChromeAttach(plugin, el, ctx.sourcePath, typeHint, 0);
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
  private renderTimer: number | undefined;
  private layoutTimer: number | undefined;
  private refreshFrame: number | undefined;
  private renderGeneration = 0;
  private renderedSignature: string | undefined;
  private pendingSignature: string | undefined;
  private disposed = false;
  private readonly observer: MutationObserver;
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
    this.renderGeneration += 1;
    this.renderedSignature = undefined;
    this.pendingSignature = undefined;
    if (this.renderTimer !== undefined) window.clearTimeout(this.renderTimer);
    this.renderTimer = undefined;
    if (this.layoutTimer !== undefined) window.clearTimeout(this.layoutTimer);
    this.layoutTimer = undefined;
    if (this.refreshFrame !== undefined) window.cancelAnimationFrame(this.refreshFrame);
    this.refreshFrame = undefined;
    this.observer.disconnect();
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
    const signature = noteChromeSignature(this.plugin, this.sourcePath, this.typeHint);
    if (signature === this.renderedSignature && this.hasRenderedPanels()) {
      this.ensureLayout();
      this.schedulePreviewChromeRefresh();
      return;
    }
    if (signature === this.pendingSignature) return;

    this.pendingSignature = signature;
    if (this.renderTimer !== undefined) window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = undefined;
      this.renderNow();
    }, delayMs);
  }

  private renderNow(): void {
    if (this.disposed) return;
    if (!this.container.isConnected) {
      this.dispose();
      return;
    }
    if (!isParaZkNote(this.plugin, this.sourcePath, this.typeHint)) {
      this.removeInjectedPanels();
      this.schedulePreviewChromeRefresh();
      this.renderedSignature = undefined;
      this.pendingSignature = undefined;
      return;
    }

    const signature = noteChromeSignature(this.plugin, this.sourcePath, this.typeHint);
    const propsEl = this.ensurePropsEl();
    const managedEl = this.ensureManagedEl();
    propsEl.dataset.paraZkSourcePath = this.sourcePath;
    managedEl.dataset.paraZkSourcePath = this.sourcePath;
    if (!managedEl.hasChildNodes()) managedEl.addClass("para-zk-hidden");
    this.ensureLayout();

    const generation = ++this.renderGeneration;
    const child = this.ensureManagedChild(managedEl);
    renderPropsPanel(this.plugin, propsEl, this.sourcePath);
    this.schedulePreviewChromeRefresh();
    void renderManagedPanel(this.plugin, managedEl, this.sourcePath, child)
      .then(() => {
        if (this.isCurrentRender(generation)) {
          this.renderedSignature = signature;
          this.schedulePreviewChromeRefresh();
        }
      })
      .catch((error: unknown) => {
        if (this.isCurrentRender(generation)) {
          managedEl.removeClass("para-zk-hidden");
          renderBlockNotice(managedEl, "managed", error instanceof Error ? error.message : String(error));
          this.schedulePreviewChromeRefresh();
        }
      })
      .finally(() => {
        if (this.pendingSignature === signature) this.pendingSignature = undefined;
      });
  }

  private isCurrentRender(generation: number): boolean {
    return !this.disposed && this.renderGeneration === generation;
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
    removeDuplicateManagedPanels(this.container, this.managedEl);
    return this.managedEl;
  }

  private ensureLayout(): void {
    if (this.propsEl) insertPropsHeader(this.container, this.propsEl);
    if (this.managedEl) insertManagedFooter(this.container, this.managedEl);
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

  private hasRenderedPanels(): boolean {
    return this.propsEl?.isConnected === true && this.managedEl?.isConnected === true;
  }

  private removeInjectedPanels(): void {
    this.propsEl?.remove();
    this.managedEl?.remove();
    this.propsEl = undefined;
    this.managedEl = undefined;
    this.renderedSignature = undefined;
    this.pendingSignature = undefined;
    this.managedChild?.unload();
    this.managedChild = undefined;
  }
}

class NoteChromeManagedRenderChild extends MarkdownRenderChild {}

function scheduleNoteChromeAttach(
  plugin: ParaZkPluginContext,
  el: HTMLElement,
  sourcePath: string,
  typeHint: string | undefined,
  attempt: number
): void {
  window.setTimeout(() => {
    if (isNestedNoteChromeRender(el)) return;

    const container = resolveContainer(el);
    if (container) {
      ensureNoteChromeController(plugin, container, sourcePath, typeHint).scheduleRender(0);
      return;
    }

    if (attempt < NOTE_CHROME_ATTACH_RETRY_LIMIT) {
      scheduleNoteChromeAttach(plugin, el, sourcePath, typeHint, attempt + 1);
    }
  }, attempt === 0 ? NOTE_CHROME_INITIAL_ATTACH_DELAY_MS : NOTE_CHROME_ATTACH_RETRY_DELAY_MS);
}

function isNestedNoteChromeRender(el: HTMLElement): boolean {
  return el.closest(
    ".markdown-embed, .para-zk-note-chrome, .para-zk-note-chrome-widget, .para-zk-managed-buffer"
  ) !== null;
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

    const typeHint = cachedFrontmatterType(plugin, file.path);
    if (!isParaZkNote(plugin, file.path, typeHint)) continue;
    ensureNoteChromeController(plugin, container, file.path, typeHint).scheduleRender(0);
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

// The reading-view content container that holds the note's rendered blocks. Returning
// undefined for non-reading contexts (Live Preview has no sizer) keeps this processor
// scoped to Reading view.
function resolveContainer(el: HTMLElement): HTMLElement | undefined {
  return el.closest<HTMLElement>(".markdown-preview-sizer") ?? undefined;
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

// Props sits inside Obsidian's note header (`.mod-header`) so Reading view's virtual
// renderer accounts for its height in the header section when scrolling. The header is the
// only stable home: Reading view recycles its sections (header included) in and out of the
// DOM while scrolling, so when the header is gone the panel is detached and left waiting.
// Re-attaching it as a bare `.markdown-preview-sizer` child instead would place unaccounted
// height above the viewport that Obsidian strips and we re-add on every scroll tick — a
// thrash that shifts the scroll position (a visible jump, then a snap back).
function insertPropsHeader(container: HTMLElement, propsEl: HTMLElement): void {
  const header = container.querySelector<HTMLElement>(":scope > .mod-header");
  if (!header) {
    propsEl.remove();
    return;
  }
  if (header.lastElementChild !== propsEl) header.appendChild(propsEl);
}

// Managed sits at the bottom of the note: inside Obsidian's footer (`.mod-footer`) when it
// is rendered, otherwise as the last sizer child. Unlike props it must NOT be detached when
// the footer is recycled away — its Dataview views (e.g. cited-by) only populate while
// attached to the live DOM, and a detached panel keeps a stale/empty result. Because it
// lives below the body, a bare sizer child here changes height *below* the viewport, so it
// never produces the above-viewport scroll thrash that the header fallback did.
function insertManagedFooter(container: HTMLElement, managedEl: HTMLElement): void {
  const footer = container.querySelector<HTMLElement>(":scope > .mod-footer");
  if (footer) {
    if (footer.firstElementChild !== managedEl) footer.prepend(managedEl);
    return;
  }
  if (container.lastElementChild !== managedEl) container.appendChild(managedEl);
}

interface PreviewRendererSection {
  el?: HTMLElement;
  height?: number;
  computed?: boolean;
}

interface PreviewRenderer {
  sections?: PreviewRendererSection[];
  getSectionForElement?: (el: HTMLElement) => PreviewRendererSection | undefined;
  updateVirtualDisplay?: () => void;
}

function refreshPreviewChromeSections(plugin: ParaZkPluginContext, container: HTMLElement): void {
  const renderer = previewRendererForContainer(plugin, container);
  try {
    const headerChanged = syncPreviewSectionHeight(
      renderer,
      container.querySelector<HTMLElement>(":scope > .mod-header")
    );
    const footerChanged = syncPreviewSectionHeight(
      renderer,
      container.querySelector<HTMLElement>(":scope > .mod-footer")
    );
    if (headerChanged || footerChanged) renderer?.updateVirtualDisplay?.();
  } catch {
    // Obsidian's preview renderer hooks are private; failing to refresh height
    // is better than breaking note rendering on a version mismatch.
  }
}

function syncPreviewSectionHeight(renderer: PreviewRenderer | undefined, el: HTMLElement | null): boolean {
  if (!renderer || !el) return false;
  const section = renderer.getSectionForElement?.(el)
    ?? renderer.sections?.find((candidate) => candidate.el === el);
  if (!section) return false;

  const height = Math.ceil(Math.max(el.offsetHeight, el.getBoundingClientRect().height));
  if (!Number.isFinite(height)) return false;

  const changed = section.height !== height || section.computed !== true;
  section.height = height;
  section.computed = true;
  return changed;
}

function previewRendererForContainer(
  plugin: ParaZkPluginContext,
  container: HTMLElement
): PreviewRenderer | undefined {
  for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) {
    if (!(leaf.view instanceof MarkdownView)) continue;
    if (leaf.view.containerEl.querySelector(".markdown-preview-sizer") !== container) continue;
    const viewWithPreview = leaf.view as MarkdownView & {
      previewMode?: {
        renderer?: PreviewRenderer;
      };
    };
    return viewWithPreview.previewMode?.renderer;
  }
  return undefined;
}

function isParaZkNote(
  plugin: ParaZkPluginContext,
  sourcePath: string | undefined,
  typeHint: string | undefined
): boolean {
  const type = typeHint ?? cachedFrontmatterType(plugin, sourcePath);
  if (!type) return false;
  return inferPropsViewType({ type }) !== undefined
    || managedUiBlocksForType(type, plugin.settings) !== undefined;
}

function noteChromeSignature(
  plugin: ParaZkPluginContext,
  sourcePath: string | undefined,
  typeHint: string | undefined
): string {
  const file = sourcePath ? plugin.app.vault.getFileByPath(sourcePath) : null;
  const frontmatter = file instanceof TFile
    ? plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {}
    : {};
  return JSON.stringify({
    sourcePath,
    type: typeHint ?? normalizeFrontmatterType(frontmatter.type),
    locale: plugin.settings.locale,
    frontmatter
  });
}

function cachedFrontmatterType(plugin: ParaZkPluginContext, sourcePath: string | undefined): string | undefined {
  if (!sourcePath) return undefined;
  const file = plugin.app.vault.getFileByPath(sourcePath);
  if (!(file instanceof TFile)) return undefined;
  return normalizeFrontmatterType(plugin.app.metadataCache.getFileCache(file)?.frontmatter?.type);
}
