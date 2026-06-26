import { MarkdownRenderChild, TFile, type MarkdownPostProcessorContext } from "obsidian";
import { type CitationKey, parseCitationKeys } from "../../citation-token";
import type { ParaZkPluginContext } from "../../plugin-interface";
import { workflowContext } from "../../vault/host";
import { readReferenceItemsFromFrontmatter, type ReferenceRead } from "../../workflows";
import { referenceTitle, renderReferenceAnchor } from "./reference-link";

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
// one per stable id. Each id renders as its reference's current 0-based registry position
// and links to its resolved reference (note/file/wiki → hover preview + open; url → external)
// or shows an unresolved marker when the id is absent. Spacing is normalized to a single
// space after each comma regardless of the source.
export function buildCitationElement(
  plugin: ParaZkPluginContext,
  references: ReferenceRead[],
  keys: CitationKey[],
  sourcePath: string,
  host: HTMLElement
): void {
  const last = keys.length - 1;
  keys.forEach((key, position) => {
    // Only the comma is a literal separator; the brackets and the space after each comma
    // belong to the adjacent number's link, so the whole `[1` / ` 2]` segment is its hover
    // and click target (not just the bare digit).
    if (position > 0) host.appendText(",");
    const index = references.findIndex((reference) => reference.id !== null && reference.id === key.id);
    const section = key.subpath ? ` §${key.subpath}` : "";
    const text = `${position === 0 ? "[" : " "}${index === -1 ? "?" : index}${section}${position === last ? "]" : ""}`;
    const reference = index === -1 ? undefined : references[index];
    if (!reference) {
      const broken = host.createEl("span", { cls: "para-zk-citation is-unresolved", text });
      broken.setAttr("title", `No reference for ${key.id}`);
      return;
    }
    renderReferenceAnchor(plugin, host, reference, {
      text,
      title: key.subpath ? `${referenceTitle(reference)} · §${key.subpath}` : referenceTitle(reference),
      cls: "para-zk-citation",
      hoverParent: host,
      sourcePath,
      subpath: key.subpath
    });
  });
}

// Reading view: a code span `` `PZ[<id>]` `` cites a stable reference id.
// Live Preview is handled by the CM6 editor extension (citation-editor.ts).
export function registerCitationRenderers(plugin: ParaZkPluginContext): void {
  plugin.registerMarkdownPostProcessor((el, ctx) => renderCitations(plugin, el, ctx));
}

function renderCitations(plugin: ParaZkPluginContext, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
  if (!el.textContent?.includes("PZ[")) return;
  if (!containsCitationCode(el)) return;
  ctx.addChild(new CitationRenderChild(plugin, el, ctx.sourcePath));
}

type RenderedCitation = {
  host: HTMLElement;
  keys: CitationKey[];
};

class CitationRenderChild extends MarkdownRenderChild {
  private readonly plugin: ParaZkPluginContext;
  private readonly sourcePath: string;
  private readonly citations: RenderedCitation[] = [];

  constructor(
    plugin: ParaZkPluginContext,
    containerEl: HTMLElement,
    sourcePath: string
  ) {
    super(containerEl);
    this.plugin = plugin;
    this.sourcePath = sourcePath;
  }

  onload(): void {
    this.render();
    this.registerEvent(
      this.plugin.app.metadataCache.on("changed", (file) => this.onMetadataChange(file))
    );
  }

  private onMetadataChange(file: TFile): void {
    if (file.path !== this.sourcePath) return;
    const references = this.resolveReferences();
    for (const citation of this.citations) {
      citation.host.empty();
      buildCitationElement(this.plugin, references, citation.keys, this.sourcePath, citation.host);
    }
  }

  private render(): void {
    const references = this.resolveReferences();
    for (const codeEl of citationCodeElements(this.containerEl)) {
      const keys = parseCitationKeys(codeEl.textContent ?? "");
      if (!keys) continue;

      const host = codeEl.ownerDocument.createElement("span");
      host.className = "para-zk-citation-host";
      buildCitationElement(this.plugin, references, keys, this.sourcePath, host);
      this.citations.push({ host, keys });
      codeEl.replaceWith(host);
    }
  }

  private resolveReferences(): ReferenceRead[] {
    const file = this.plugin.app.vault.getFileByPath(this.sourcePath);
    return file instanceof TFile ? resolveReferences(this.plugin, file) : [];
  }
}

function containsCitationCode(el: HTMLElement): boolean {
  for (const codeEl of citationCodeElements(el)) {
    if (parseCitationKeys(codeEl.textContent ?? "")) return true;
  }
  return false;
}

function citationCodeElements(el: HTMLElement): HTMLElement[] {
  const codeEls: HTMLElement[] = [];
  for (const codeEl of Array.from(el.querySelectorAll("code"))) {
    if (codeEl.closest("pre")) continue;
    codeEls.push(codeEl);
  }
  return codeEls;
}
