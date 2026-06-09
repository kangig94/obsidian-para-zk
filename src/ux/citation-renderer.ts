import { TFile, type MarkdownPostProcessorContext } from "obsidian";
import type { ParaZkPluginContext } from "../plugin-interface";
import { workflowContext } from "../vault/host";
import { readReferenceItemsFromFrontmatter, type ReferenceRead } from "../workflows";
import { referenceTitle, renderReferenceAnchor } from "./reference-link";

const CITATION_ID_RE_SOURCE = "[A-Za-z0-9_-]+";
const CITATION_ID_LIST_RE_SOURCE = `${CITATION_ID_RE_SOURCE}(?:\\s*,\\s*${CITATION_ID_RE_SOURCE})*`;
const CITATION_CODE_RE_SOURCE = `PZ\\[\\s*(${CITATION_ID_LIST_RE_SOURCE})\\s*\\]`;
const CITATION_TOKEN_CODE_RE_SOURCE = `PZ\\[\\s*${CITATION_ID_LIST_RE_SOURCE}\\s*\\]`;
const CITATION_RE = new RegExp(`^${CITATION_CODE_RE_SOURCE}$`);
export const CITATION_TOKEN_RE = new RegExp("`(" + CITATION_TOKEN_CODE_RE_SOURCE + ")`", "g");

// Pure: a citation token is a code span whose whole content is `PZ[<id>]` or
// `PZ[<id>, <id>, ...]` (stable reference ids, comma-separated, spaces optional).
// Returns the id list, or undefined for anything else.
export function parseCitationKeys(text: string): string[] | undefined {
  const match = text.trim().match(CITATION_RE);
  if (!match) return undefined;
  return match[1].split(",").map((part) => part.trim());
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
  keys: string[],
  sourcePath: string,
  host: HTMLElement
): void {
  const last = keys.length - 1;
  keys.forEach((key, position) => {
    // Only the comma is a literal separator; the brackets and the space after each comma
    // belong to the adjacent number's link, so the whole `[1` / ` 2]` segment is its hover
    // and click target (not just the bare digit).
    if (position > 0) host.appendText(",");
    const index = references.findIndex((reference) => reference.id !== null && reference.id === key);
    const text = `${position === 0 ? "[" : " "}${index === -1 ? "?" : index}${position === last ? "]" : ""}`;
    const reference = index === -1 ? undefined : references[index];
    if (!reference) {
      const broken = host.createEl("span", { cls: "para-zk-citation is-unresolved", text });
      broken.setAttr("title", `No reference for ${key}`);
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

// Reading view: a code span `` `PZ[<id>]` `` cites a stable reference id.
// Live Preview is handled by the CM6 editor extension (citation-editor.ts).
export function registerCitationRenderers(plugin: ParaZkPluginContext): void {
  plugin.registerMarkdownPostProcessor((el, ctx) => renderCitations(plugin, el, ctx));
}

function renderCitations(plugin: ParaZkPluginContext, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
  let references: ReferenceRead[] | undefined;
  for (const codeEl of Array.from(el.querySelectorAll("code"))) {
    if (codeEl.closest("pre")) continue;
    const keys = parseCitationKeys(codeEl.textContent ?? "");
    if (!keys) continue;

    if (!references) {
      const file = plugin.app.vault.getFileByPath(ctx.sourcePath);
      if (!(file instanceof TFile)) return;
      references = resolveReferences(plugin, file);
    }
    const host = codeEl.ownerDocument.createElement("span");
    host.className = "para-zk-citation-host";
    buildCitationElement(plugin, references, keys, ctx.sourcePath, host);
    codeEl.replaceWith(host);
  }
}
