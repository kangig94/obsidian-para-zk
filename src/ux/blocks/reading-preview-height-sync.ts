import {
  MarkdownView
} from "obsidian";
import type { ParaZkPluginContext } from "../../plugin-interface";

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

export function refreshPreviewChromeSections(plugin: ParaZkPluginContext, container: HTMLElement): void {
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
