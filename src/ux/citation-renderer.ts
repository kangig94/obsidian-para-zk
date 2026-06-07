import { TFile, type MarkdownPostProcessorContext } from "obsidian";
import type { ParaZkPluginContext } from "../plugin-interface";
import { workflowContext } from "../vault/host";
import { readReferenceItemsFromFrontmatter, type ReferenceRead } from "../workflows";
import { referenceTitle, renderReferenceAnchor } from "./reference-link";

const CITATION_RE = /^PZ\[\s*(\d+(?:\s*,\s*\d+)*)\s*\]$/;

// Pure: a citation token is a code span whose whole content is `PZ[n]` or `PZ[n, m, ...]`
// (0-based indices into the note's reference registry, comma-separated, spaces optional).
// Returns the index list, or undefined for anything else.
export function parseCitationIndices(text: string): number[] | undefined {
  const match = text.trim().match(CITATION_RE);
  if (!match) return undefined;
  return match[1].split(",").map((part) => Number(part.trim()));
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

// Build the rendered citation into `host`: bracketed, comma-separated links — `[1, 2]` —
// one per index. Each number links to its resolved reference (note/file/wiki → hover preview
// + open; url → external) or shows an unresolved marker when the index is out of range; the
// tooltip shows the resolved target so a reordered registry is visible at a glance. Spacing
// is normalized to a single space after each comma regardless of the source.
export function buildCitationElement(
  plugin: ParaZkPluginContext,
  references: ReferenceRead[],
  indices: number[],
  sourcePath: string,
  host: HTMLElement
): void {
  const last = indices.length - 1;
  indices.forEach((index, position) => {
    // Only the comma is a literal separator; the brackets and the space after each comma
    // belong to the adjacent index's link, so the whole `[1` / ` 2]` segment is its hover
    // and click target (not just the bare digit).
    if (position > 0) host.appendText(",");
    const text = `${position === 0 ? "[" : " "}${index}${position === last ? "]" : ""}`;
    const reference = references[index];
    if (!reference) {
      const broken = host.createEl("span", { cls: "para-zk-citation is-unresolved", text });
      broken.setAttr("title", `No reference #${index}`);
      return;
    }
    renderReferenceAnchor(plugin, host, reference, {
      text,
      title: referenceTitle(reference),
      cls: "para-zk-citation",
      hoverParent: host,
      sourcePath
    });
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
    const indices = parseCitationIndices(codeEl.textContent ?? "");
    if (!indices) continue;

    if (!references) {
      const file = plugin.app.vault.getFileByPath(ctx.sourcePath);
      if (!(file instanceof TFile)) return;
      references = resolveReferences(plugin, file);
    }
    const host = codeEl.ownerDocument.createElement("span");
    host.className = "para-zk-citation-host";
    buildCitationElement(plugin, references, indices, ctx.sourcePath, host);
    codeEl.replaceWith(host);
  }
}
