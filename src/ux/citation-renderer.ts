import { TFile, type MarkdownPostProcessorContext } from "obsidian";
import type { ParaZkPluginContext } from "../plugin-interface";
import { workflowContext } from "../vault/host";
import { readReferenceItemsFromFrontmatter, type ReferenceRead } from "../workflows";
import { referenceTitle, renderReferenceAnchor } from "./reference-link";

const CITATION_RE = /^PZ\[(\d+)\]$/;

// Pure: a citation token is a code span whose whole content is `PZ[n]` (n = 0-based index
// into the note's reference registry). Returns the index, or undefined for anything else.
export function parseCitationIndex(text: string): number | undefined {
  const match = text.trim().match(CITATION_RE);
  return match ? Number(match[1]) : undefined;
}

// Synchronous reference lookup from the note's cached frontmatter — both the reading-view
// post-processor and the CM6 editor extension run in a sync context. Malformed `references`
// frontmatter degrades to no citations rather than throwing into the render loop.
export function resolveReferences(plugin: ParaZkPluginContext, file: TFile): ReferenceRead[] {
  const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  try {
    return readReferenceItemsFromFrontmatter(workflowContext(plugin), file, frontmatter);
  } catch {
    return [];
  }
}

// Build the rendered citation into `host`: a `[n]` link to the resolved reference
// (note/file/wiki → hover preview + open; url → external), or an unresolved marker when
// `reference` is undefined (index out of range). The tooltip shows the resolved target so a
// reordered registry is visible at a glance.
export function buildCitationElement(
  plugin: ParaZkPluginContext,
  reference: ReferenceRead | undefined,
  index: number,
  sourcePath: string,
  host: HTMLElement
): HTMLElement {
  if (!reference) {
    const broken = host.createEl("span", { cls: "para-zk-citation is-unresolved", text: `[${index}]` });
    broken.setAttr("title", `No reference #${index}`);
    return broken;
  }
  return renderReferenceAnchor(plugin, host, reference, {
    text: `[${index}]`,
    title: referenceTitle(reference),
    cls: "para-zk-citation",
    hoverParent: host,
    sourcePath
  });
}

// Reading view: a code span `` `PZ[n]` `` cites the note's n-th registry reference.
// Live Preview is handled by the CM6 editor extension (citation-editor.ts).
export function registerCitationRenderers(plugin: ParaZkPluginContext): void {
  plugin.registerMarkdownPostProcessor((el, ctx) => renderCitations(plugin, el, ctx));
}

function renderCitations(plugin: ParaZkPluginContext, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
  let references: ReferenceRead[] | undefined;
  for (const codeEl of Array.from(el.querySelectorAll("code"))) {
    if (codeEl.closest("pre")) continue;
    const index = parseCitationIndex(codeEl.textContent ?? "");
    if (index === undefined) continue;

    if (!references) {
      const file = plugin.app.vault.getFileByPath(ctx.sourcePath);
      if (!(file instanceof TFile)) return;
      references = resolveReferences(plugin, file);
    }
    const host = codeEl.ownerDocument.createElement("span");
    host.className = "para-zk-citation-host";
    buildCitationElement(plugin, references[index], index, ctx.sourcePath, host);
    codeEl.replaceWith(host);
  }
}
