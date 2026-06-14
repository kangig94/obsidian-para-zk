import { MarkdownRenderChild, TFile, type MarkdownPostProcessorContext } from "obsidian";
import type { ParaZkPluginContext } from "../plugin-interface";
import { workflowContext } from "../vault/host";
import { readReferenceItemsFromFrontmatter, type ReferenceRead } from "../workflows";
import { referenceTitle, renderReferenceAnchor } from "./reference-link";

const CITATION_ID_RE_SOURCE = "[A-Za-z0-9_-]+";
// An optional section after the id: `#` then heading or block (`#^id`) text. Comma is the
// multi-cite separator and `]` closes the token, so an inline-cited section excludes both —
// a heading containing a comma must be cited via the reference's own stored anchor instead.
const CITATION_SUBPATH_RE_SOURCE = "#[^,\\]\\n]+";
const CITATION_ENTRY_RE_SOURCE = `${CITATION_ID_RE_SOURCE}(?:${CITATION_SUBPATH_RE_SOURCE})?`;
const CITATION_ENTRY_LIST_RE_SOURCE = `${CITATION_ENTRY_RE_SOURCE}(?:\\s*,\\s*${CITATION_ENTRY_RE_SOURCE})*`;
const CITATION_CODE_RE_SOURCE = `PZ\\[\\s*(${CITATION_ENTRY_LIST_RE_SOURCE})\\s*\\]`;
const CITATION_TOKEN_CODE_RE_SOURCE = `PZ\\[\\s*${CITATION_ENTRY_LIST_RE_SOURCE}\\s*\\]`;
const CITATION_RE = new RegExp(`^${CITATION_CODE_RE_SOURCE}$`);
const CITATION_ENTRY_RE = new RegExp(`^(${CITATION_ID_RE_SOURCE})(?:#(.+))?$`);
export const CITATION_TOKEN_RE = new RegExp("`(" + CITATION_TOKEN_CODE_RE_SOURCE + ")`", "g");

// A single cited reference: its stable id and an optional section subpath (heading text or
// `^block`) that points the citation at one part of the reference's target.
export type CitationKey = { id: string; subpath?: string };

// Pure: a citation token is a code span whose whole content is `PZ[<id>]`,
// `PZ[<id>#<section>]`, or a comma-separated list of either (spaces optional).
// Returns the parsed keys, or undefined for anything else.
export function parseCitationKeys(text: string): CitationKey[] | undefined {
  const match = text.trim().match(CITATION_RE);
  if (!match) return undefined;
  return match[1].split(",").map((part) => {
    const entry = part.trim().match(CITATION_ENTRY_RE);
    const id = entry?.[1] ?? part.trim();
    const subpath = entry?.[2]?.trim();
    return subpath ? { id, subpath } : { id };
  });
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
  if (!containsCitationCode(el)) return;
  ctx.addChild(new CitationRenderChild(plugin, el, ctx.sourcePath));
}

type RenderedCitation = {
  host: HTMLElement;
  keys: CitationKey[];
};

class CitationRenderChild extends MarkdownRenderChild {
  private readonly citations: RenderedCitation[] = [];

  constructor(
    private readonly plugin: ParaZkPluginContext,
    containerEl: HTMLElement,
    private readonly sourcePath: string
  ) {
    super(containerEl);
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
