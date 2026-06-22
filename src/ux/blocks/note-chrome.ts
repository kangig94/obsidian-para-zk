import {
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

const NOTE_CHROME_RERENDER_DELAY_MS = 120;
// Keyed by the reading-view content container (`.markdown-preview-sizer`) so one note
// renders one set of panels. A re-rendered preview builds a fresh sizer → fresh entry.
const noteChromeChildren = new WeakMap<HTMLElement, NoteChromeRenderChild>();

export function registerNoteChromeRenderers(plugin: ParaZkPluginContext): void {
  plugin.registerMarkdownCodeBlockProcessor("para-zk-props", (_source, el) => {
    swallowLegacyChromeBlock(el);
  });
  plugin.registerMarkdownCodeBlockProcessor("para-zk-managed", (_source, el) => {
    swallowLegacyChromeBlock(el);
  });

  plugin.registerMarkdownPostProcessor((el, ctx) => renderNoteChrome(plugin, el, ctx));
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

  // The container is resolved in the render child's onload (after the element is attached):
  // at post-processor time Obsidian may still hold the section in a detached fragment, so
  // el.closest(...) would miss the preview and the chrome would never inject.
  ctx.addChild(new NoteChromeRenderChild(plugin, el, ctx.sourcePath, typeHint));
}

// The props grid renders from metadataCache, so external frontmatter changes
// (CLI/MCP writes, Obsidian properties edits, sync) must re-render it after the
// cache reparses. Rename tracking keeps the injected chrome pointed at the same
// note when Obsidian updates the TFile path under an existing preview.
class NoteChromeRenderChild extends MarkdownRenderChild {
  private container: HTMLElement | undefined;
  private propsEl: HTMLElement | undefined;
  private managedEl: HTMLElement | undefined;
  private renderTimer: number | undefined;
  private attachTimer: number | undefined;
  private attachAttempts = 0;
  private renderGeneration = 0;
  private unloaded = true;

  constructor(
    private readonly plugin: ParaZkPluginContext,
    containerEl: HTMLElement,
    public sourcePath: string,
    private typeHint: string | undefined
  ) {
    super(containerEl);
  }

  onload(): void {
    this.unloaded = false;
    // Reading view builds the section subtree (post-processors + child onload) while it
    // is still DETACHED, then attaches it to the `.markdown-preview-sizer` afterwards. So
    // the container can only be resolved on a later tick — defer and retry briefly.
    this.scheduleAttach();
  }

  private scheduleAttach(): void {
    this.attachTimer = window.setTimeout(() => this.tryAttach(), this.attachAttempts === 0 ? 0 : 30);
  }

  private tryAttach(): void {
    this.attachTimer = undefined;
    if (this.unloaded) return;

    const container = resolveContainer(this.containerEl);
    if (!container) {
      // The element may not be attached yet; retry a few frames before giving up.
      if (this.attachAttempts < 12) {
        this.attachAttempts += 1;
        this.scheduleAttach();
      }
      return;
    }

    const existing = noteChromeChildren.get(container);
    if (existing && existing !== this && existing.isActive()) return;

    this.container = container;
    noteChromeChildren.set(container, this);
    this.renderNow();
    this.registerEvent(
      this.plugin.app.metadataCache.on("changed", (file) => this.onMetadataChange(file))
    );
    this.registerEvent(
      this.plugin.app.vault.on("rename", (file, oldPath) => this.onRename(file, oldPath))
    );
  }

  onunload(): void {
    this.unloaded = true;
    this.renderGeneration += 1;
    if (this.renderTimer !== undefined) window.clearTimeout(this.renderTimer);
    this.renderTimer = undefined;
    if (this.attachTimer !== undefined) window.clearTimeout(this.attachTimer);
    this.attachTimer = undefined;
    this.removeInjectedPanels();
    if (this.container && noteChromeChildren.get(this.container) === this) {
      noteChromeChildren.delete(this.container);
    }
  }

  isActive(): boolean {
    return !this.unloaded && this.containerEl.isConnected;
  }

  private onMetadataChange(file: TFile): void {
    if (file.path !== this.sourcePath) return;
    this.typeHint = undefined;
    this.scheduleRender();
  }

  private onRename(file: unknown, oldPath?: string): void {
    if (!(file instanceof TFile)) return;
    if (oldPath !== this.sourcePath) return;
    this.sourcePath = file.path;
    this.typeHint = undefined;
    this.scheduleRender();
  }

  private scheduleRender(): void {
    if (this.renderTimer !== undefined) window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = undefined;
      this.renderNow();
    }, NOTE_CHROME_RERENDER_DELAY_MS);
  }

  private renderNow(): void {
    if (this.unloaded || !this.container) return;
    if (!isParaZkNote(this.plugin, this.sourcePath, this.typeHint)) {
      this.removeInjectedPanels();
      return;
    }

    const propsEl = this.ensurePropsEl();
    const managedEl = this.ensureManagedEl();
    propsEl.dataset.paraZkSourcePath = this.sourcePath;
    managedEl.dataset.paraZkSourcePath = this.sourcePath;
    this.ensureLayout();

    const generation = ++this.renderGeneration;
    renderPropsPanel(this.plugin, propsEl, this.sourcePath);
    void renderManagedPanel(this.plugin, managedEl, this.sourcePath, this)
      .catch((error: unknown) => {
        if (this.isCurrentRender(generation)) {
          renderBlockNotice(managedEl, "managed", error instanceof Error ? error.message : String(error));
        }
      });
  }

  private isCurrentRender(generation: number): boolean {
    return !this.unloaded && this.renderGeneration === generation;
  }

  private ensurePropsEl(): HTMLElement {
    if (!this.propsEl) {
      this.propsEl = this.containerEl.ownerDocument.createElement("div");
      this.propsEl.addClass("para-zk-note-chrome", "para-zk-note-chrome--props");
    }
    return this.propsEl;
  }

  private ensureManagedEl(): HTMLElement {
    if (!this.managedEl) {
      this.managedEl = this.containerEl.ownerDocument.createElement("div");
      this.managedEl.addClass("para-zk-note-chrome", "para-zk-note-chrome--managed");
    }
    return this.managedEl;
  }

  private ensureLayout(): void {
    if (!this.container) return;
    if (this.propsEl) insertPropsHeader(this.container, this.propsEl);
    if (this.managedEl) insertManagedFooter(this.container, this.managedEl);
  }

  private removeInjectedPanels(): void {
    this.propsEl?.remove();
    this.managedEl?.remove();
    this.propsEl = undefined;
    this.managedEl = undefined;
  }
}

// The reading-view content container that holds the note's rendered blocks. Returning
// undefined for non-reading contexts (Live Preview has no sizer) keeps this processor
// scoped to Reading view.
function resolveContainer(el: HTMLElement): HTMLElement | undefined {
  return el.closest<HTMLElement>(".markdown-preview-sizer") ?? undefined;
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

function cachedFrontmatterType(plugin: ParaZkPluginContext, sourcePath: string | undefined): string | undefined {
  if (!sourcePath) return undefined;
  const file = plugin.app.vault.getFileByPath(sourcePath);
  if (!(file instanceof TFile)) return undefined;
  return normalizeFrontmatterType(plugin.app.metadataCache.getFileCache(file)?.frontmatter?.type);
}
