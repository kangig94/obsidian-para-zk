import { TFile, type MarkdownPostProcessorContext } from "obsidian";
import type { ParaZkPluginContext } from "../plugin-interface";
import { workflowContext } from "../vault/host";
import { readReferenceItemsFresh, type ReferenceRead } from "../workflows";
import { referenceTitle, renderReferenceAnchor } from "./reference-link";

const CITATION_PREFIX = "PZ[";
// Stored as a source string; each use stamps a fresh /g regex so there is no shared
// lastIndex state across calls.
const CITATION_SOURCE = "PZ\\[(\\d+)\\]";

export type CitationToken =
  | { kind: "text"; value: string }
  | { kind: "cite"; index: number };

// Pure: split body text into literal runs and `PZ[n]` citation tokens (n = 0-based index
// into the note's reference registry). Multi-digit indices stay whole; malformed forms
// (`PZ[]`, `PZ[a]`) are left as literal text.
export function splitCitationTokens(text: string): CitationToken[] {
  const tokens: CitationToken[] = [];
  const pattern = new RegExp(CITATION_SOURCE, "g");
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) tokens.push({ kind: "text", value: text.slice(lastIndex, match.index) });
    tokens.push({ kind: "cite", index: Number(match[1]) });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) tokens.push({ kind: "text", value: text.slice(lastIndex) });
  return tokens;
}

// Reading-view only: inline `PZ[n]` cites the note's n-th registry reference, rendered as
// a `[n]` link with the registry item's native behavior (note/file/wiki → hover preview +
// open; url → external). Positional by design — the tooltip shows the resolved target so a
// reordered registry is visible at a glance. Live Preview is a later (CM6) phase.
export function registerCitationRenderers(plugin: ParaZkPluginContext): void {
  // Best-effort: if reference lookup throws (e.g. malformed `references` frontmatter),
  // leave the prose untouched rather than spamming the render loop — mirrors the
  // catch the other async renderers use.
  plugin.registerMarkdownPostProcessor((el, ctx) => renderCitations(plugin, el, ctx).catch(() => undefined));
}

async function renderCitations(
  plugin: ParaZkPluginContext,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
): Promise<void> {
  if (!el.textContent?.includes(CITATION_PREFIX)) return;
  const nodes = citationTextNodes(el);
  if (nodes.length === 0) return;

  const file = plugin.app.vault.getFileByPath(ctx.sourcePath);
  if (!(file instanceof TFile)) return;
  const references = await readReferenceItemsFresh(workflowContext(plugin), file);

  for (const node of nodes) {
    replaceCitationsInNode(plugin, node, references, ctx.sourcePath);
  }
}

function citationTextNodes(el: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    if (text.nodeValue?.includes(CITATION_PREFIX) && !isExcludedContext(text.parentElement)) {
      nodes.push(text);
    }
  }
  return nodes;
}

// Leave citations untouched inside code spans/blocks and inside the plugin's own managed
// blocks, so a literal `PZ[0]` in a code fence stays verbatim.
function isExcludedContext(start: Element | null): boolean {
  for (let el = start; el; el = el.parentElement) {
    if (el.tagName === "CODE" || el.tagName === "PRE") return true;
    if (
      el.classList.contains("para-zk-references")
      || el.classList.contains("para-zk-props")
      || el.classList.contains("para-zk-managed")
    ) return true;
  }
  return false;
}

function replaceCitationsInNode(
  plugin: ParaZkPluginContext,
  node: Text,
  references: ReferenceRead[],
  sourcePath: string
): void {
  const tokens = splitCitationTokens(node.nodeValue ?? "");
  if (!tokens.some((token) => token.kind === "cite")) return;

  const doc = node.ownerDocument;
  const hoverParent = node.parentElement;
  const replacements = tokens.map((token) =>
    token.kind === "text"
      ? doc.createTextNode(token.value)
      : citationElement(plugin, doc, references, token.index, sourcePath, hoverParent)
  );
  node.replaceWith(...replacements);
}

function citationElement(
  plugin: ParaZkPluginContext,
  doc: Document,
  references: ReferenceRead[],
  index: number,
  sourcePath: string,
  hoverParent: HTMLElement | null
): HTMLElement {
  // Detached holder only to satisfy Obsidian's `createEl`/renderReferenceAnchor (which
  // append to a parent); the element is reparented out by replaceWith at the call site.
  const holder = doc.createElement("div");
  const reference = references[index];
  if (!reference) {
    const broken = holder.createEl("span", { cls: "para-zk-citation is-unresolved", text: `[${index}]` });
    broken.setAttr("title", `No reference #${index}`);
    return broken;
  }
  return renderReferenceAnchor(plugin, holder, reference, {
    text: `[${index}]`,
    // Tooltip shows the resolved target's title so a reordered registry is visible at a
    // glance (citations are positional); reference-block rows show the path hint instead.
    title: referenceTitle(reference),
    cls: "para-zk-citation",
    hoverParent: hoverParent ?? holder,
    sourcePath
  });
}
