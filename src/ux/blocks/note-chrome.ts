import {
  MarkdownView,
  MarkdownRenderChild,
  TFile,
  type MarkdownPostProcessorContext
} from "obsidian";
import type { ParaZkPluginContext } from "../../plugin-interface";
import { inferPropsViewType } from "../../props/schema";
import { managedUiBlockForType } from "../../templates";
import { normalizeFrontmatterType } from "../../vault/sections";
import { renderPropsPanel } from "../props-controls";
import { renderManagedPanel } from "./managed-sections";
import { renderBlockNotice } from "./shell";

// smoke:
// - Props panel renders above the body after Obsidian Properties in Reading view.
// - Managed panel renders at the bottom of the note body (before the note footer).
// - Notes with legacy para-zk-props/para-zk-managed fences render once because fences are swallowed.
// - Frontmatter changes from CLI, MCP, or Properties editor trigger a re-render.
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

export function registerNoteChromeRenderers(plugin: ParaZkPluginContext): void {
  plugin.registerMarkdownCodeBlockProcessor("para-zk-props", (_source, el) => {
    swallowLegacyChromeBlock(el);
  });
  plugin.registerMarkdownCodeBlockProcessor("para-zk-managed", (_source, el) => {
    swallowLegacyChromeBlock(el);
  });

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
      cleanupHiddenNoteChromeForOpenViews(plugin);
      cleanupStaleNoteChromeForOpenViews(plugin);
      scheduleOpenReadingViewScan(plugin);
    })
  );
  plugin.registerEvent(
    plugin.app.workspace.on("file-open", () => {
      cleanupHiddenNoteChromeForOpenViews(plugin);
      cleanupStaleNoteChromeForOpenViews(plugin);
      scheduleOpenReadingViewScan(plugin);
    })
  );
  plugin.registerEvent(
    plugin.app.workspace.on("active-leaf-change", () => {
      cleanupHiddenNoteChromeForOpenViews(plugin);
      cleanupStaleNoteChromeForOpenViews(plugin);
      scheduleOpenReadingViewScan(plugin);
    })
  );
  plugin.app.workspace.onLayoutReady(() => scheduleOpenReadingViewScan(plugin));
  plugin.register(() => disposeAllNoteChromeControllers());
}

function swallowLegacyChromeBlock(el: HTMLElement): void {
  el.empty();
  el.remove();
}

function renderNoteChrome(
  plugin: ParaZkPluginContext,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
): void {
  // Skip embedded previews and re-entrant calls from the managed panel's own
  // MarkdownRenderer.render (its rendered blocks live inside a .para-zk-note-chrome host).
  if (el.closest(".markdown-embed") || el.closest(".para-zk-note-chrome")) return;

  const typeHint = normalizeFrontmatterType(ctx.frontmatter?.type);
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
  private renderGeneration = 0;
  private renderedSignature: string | undefined;
  private pendingSignature: string | undefined;
  private disposed = false;
  private readonly observer: MutationObserver;

  constructor(
    private readonly plugin: ParaZkPluginContext,
    private readonly container: HTMLElement,
    public sourcePath: string,
    private typeHint: string | undefined
  ) {
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
    if (!isParaZkNote(this.plugin, this.sourcePath, this.typeHint)) {
      this.removeInjectedPanels();
      this.renderedSignature = undefined;
      return;
    }

    const signature = noteChromeSignature(this.plugin, this.sourcePath, this.typeHint);
    const propsEl = this.ensurePropsEl();
    const managedEl = this.ensureManagedEl();
    propsEl.dataset.paraZkSourcePath = this.sourcePath;
    managedEl.dataset.paraZkSourcePath = this.sourcePath;
    if (!managedEl.hasChildNodes()) managedEl.style.display = "none";
    this.ensureLayout();

    const generation = ++this.renderGeneration;
    const child = this.ensureManagedChild(managedEl);
    renderPropsPanel(this.plugin, propsEl, this.sourcePath);
    void renderManagedPanel(this.plugin, managedEl, this.sourcePath, child)
      .catch((error: unknown) => {
        if (this.isCurrentRender(generation)) {
          managedEl.style.removeProperty("display");
          renderBlockNotice(managedEl, "managed", error instanceof Error ? error.message : String(error));
        }
      });
    this.renderedSignature = signature;
  }

  private isCurrentRender(generation: number): boolean {
    return !this.disposed && this.renderGeneration === generation;
  }

  private ensurePropsEl(): HTMLElement {
    if (!this.propsEl) {
      this.propsEl = this.container.querySelector<HTMLElement>(":scope > .para-zk-note-chrome--props") ?? undefined;
    }
    if (!this.propsEl) {
      this.propsEl = this.container.ownerDocument.createElement("div");
      this.propsEl.addClass("para-zk-note-chrome", "para-zk-note-chrome--props");
    }
    removeDuplicatePanels(this.container, ".para-zk-note-chrome--props", this.propsEl);
    return this.propsEl;
  }

  private ensureManagedEl(): HTMLElement {
    if (!this.managedEl) {
      this.managedEl = this.container.querySelector<HTMLElement>(":scope > .para-zk-note-chrome--managed") ?? undefined;
    }
    if (!this.managedEl) {
      this.managedEl = this.container.ownerDocument.createElement("div");
      this.managedEl.addClass("para-zk-note-chrome", "para-zk-note-chrome--managed");
    }
    removeDuplicatePanels(this.container, ".para-zk-note-chrome--managed", this.managedEl);
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
    }, 0);
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
    if (el.closest(".markdown-embed") || el.closest(".para-zk-note-chrome")) return;

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
  cleanupHiddenNoteChromeForOpenViews(plugin);
  cleanupStaleNoteChromeForOpenViews(plugin);
  window.setTimeout(() => scanOpenReadingViews(plugin), NOTE_CHROME_INITIAL_ATTACH_DELAY_MS);
  window.setTimeout(() => scanOpenReadingViews(plugin), NOTE_CHROME_INITIAL_ATTACH_DELAY_MS + NOTE_CHROME_ATTACH_RETRY_DELAY_MS);
}

function scanOpenReadingViews(plugin: ParaZkPluginContext): void {
  cleanupDisconnectedNoteChromeControllers();
  cleanupHiddenNoteChromeForOpenViews(plugin);
  cleanupStaleNoteChromeForOpenViews(plugin);
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

function cleanupHiddenNoteChromeForOpenViews(plugin: ParaZkPluginContext): void {
  for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) {
    if (!(leaf.view instanceof MarkdownView)) continue;
    const preview = leaf.view.containerEl.querySelector<HTMLElement>(".markdown-preview-view");
    const container = leaf.view.containerEl.querySelector<HTMLElement>(".markdown-preview-sizer");
    if (!container || (preview && isVisibleElement(preview))) continue;

    noteChromeControllers.get(container)?.dispose();
    removeInjectedPanels(container);
  }
}

function cleanupStaleNoteChromeForOpenViews(plugin: ParaZkPluginContext): void {
  for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) {
    if (!(leaf.view instanceof MarkdownView)) continue;
    const container = leaf.view.containerEl.querySelector<HTMLElement>(".markdown-preview-sizer");
    if (!container) continue;

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

function removeDuplicatePanels(container: HTMLElement, selector: string, keep: HTMLElement): void {
  for (const panel of Array.from(container.querySelectorAll<HTMLElement>(`:scope > ${selector}`))) {
    if (panel !== keep) panel.remove();
  }
}

function removeStaleInjectedPanels(container: HTMLElement, sourcePath: string | undefined): void {
  for (const panel of Array.from(container.querySelectorAll<HTMLElement>(":scope > .para-zk-note-chrome"))) {
    if (panel.dataset.paraZkSourcePath !== sourcePath) panel.remove();
  }
}

function removeInjectedPanels(container: HTMLElement): void {
  for (const panel of Array.from(container.querySelectorAll<HTMLElement>(":scope > .para-zk-note-chrome"))) {
    panel.remove();
  }
}

function isVisibleElement(el: HTMLElement): boolean {
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

// Props sits directly under Obsidian's Properties block (`.mod-frontmatter`), falling
// back to just after the inline-title header, then to the top of the content.
function insertPropsHeader(container: HTMLElement, propsEl: HTMLElement): void {
  const anchor = container.querySelector<HTMLElement>(":scope > .mod-frontmatter, :scope > .metadata-container, :scope > .frontmatter-container")
    ?? container.querySelector<HTMLElement>(":scope > .mod-header");
  if (anchor) {
    if (anchor.nextElementSibling !== propsEl) anchor.after(propsEl);
    return;
  }
  if (container.firstElementChild !== propsEl) container.prepend(propsEl);
}

// Managed sits at the bottom of the body, before Obsidian's note footer (`.mod-footer`).
function insertManagedFooter(container: HTMLElement, managedEl: HTMLElement): void {
  const footer = container.querySelector<HTMLElement>(":scope > .mod-footer");
  if (footer) {
    if (footer.previousElementSibling !== managedEl) footer.before(managedEl);
    return;
  }
  if (container.lastElementChild !== managedEl) container.appendChild(managedEl);
}

function isParaZkNote(
  plugin: ParaZkPluginContext,
  sourcePath: string | undefined,
  typeHint: string | undefined
): boolean {
  const type = typeHint ?? cachedFrontmatterType(plugin, sourcePath);
  if (!type) return false;
  return inferPropsViewType({ type }) !== undefined
    || managedUiBlockForType(type, plugin.settings) !== undefined;
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
