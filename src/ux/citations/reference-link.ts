import { Notice } from "obsidian";
import type { ParaZkPluginContext } from "../../plugin-interface";
import { splitObsidianSubpath } from "../../vault/paths";
import {
  isExternalReference,
  parseWikiLink,
  pathBasenameWithoutExtension,
  type ReferenceRead
} from "../../workflows";
import { registryErrorMessage } from "../blocks/registry";

// Render a reference (registry item) as a clickable anchor, shared by the references
// block rows and inline `PZ[<id>]` citations. Note/file/wiki refs get native internal-link
// behavior (hover preview + click-to-open); URLs open externally; the visible text and
// tooltip are supplied by the caller so the same anchor can show a title or a citation index.
export function renderReferenceAnchor(
  plugin: ParaZkPluginContext,
  parent: HTMLElement,
  reference: ReferenceRead,
  opts: { text: string; title: string; cls: string; hoverParent: HTMLElement; sourcePath: string; subpath?: string }
): HTMLAnchorElement {
  const link = parent.createEl("a", { cls: opts.cls, text: opts.text });
  link.setAttr("href", referenceHref(reference));
  link.setAttr("title", opts.title);
  attachReferenceLinkBehavior(plugin, link, reference, opts.hoverParent, opts.sourcePath, opts.subpath);
  link.addEventListener("click", (event) => {
    event.preventDefault();
    void openReferenceLink(
      plugin,
      reference,
      opts.sourcePath,
      event.ctrlKey || event.metaKey || event.button === 1,
      opts.subpath
    ).catch((error: unknown) => {
      new Notice(registryErrorMessage(error));
    });
  });
  return link;
}

async function openReferenceLink(
  plugin: ParaZkPluginContext,
  reference: ReferenceRead,
  sourcePath: string,
  newLeaf = false,
  subpath?: string
): Promise<void> {
  if (isExternalReference(reference.link)) {
    window.open(reference.link, "_blank", "noopener");
    return;
  }
  await plugin.app.workspace.openLinkText(referenceOpenText(reference, subpath), sourcePath, newLeaf);
}

function attachReferenceLinkBehavior(
  plugin: ParaZkPluginContext,
  link: HTMLAnchorElement,
  reference: ReferenceRead,
  hoverParent: HTMLElement,
  sourcePath: string,
  subpath?: string
): void {
  if (!isInternalReference(reference)) return;

  const linktext = referenceOpenText(reference, subpath);
  link.addClass("internal-link");
  link.setAttr("href", linktext);
  link.setAttr("data-href", linktext);
  link.addEventListener("mouseover", (event) => {
    plugin.app.workspace.trigger("hover-link", {
      event,
      source: "para-zk-references",
      hoverParent,
      targetEl: link,
      linktext,
      sourcePath
    });
  });
}

function isInternalReference(reference: ReferenceRead): boolean {
  return reference.kind === "note" || reference.kind === "file" || reference.kind === "wiki";
}

function referenceHref(reference: ReferenceRead): string {
  return isExternalReference(reference.link) ? reference.link : "#";
}

// The link text Obsidian resolves on open/hover. A reference always resolves to its base
// target — any anchor in the stored link is ignored. A section comes only from the citation
// `subpath` (a heading or `^block`), specified at the citation site.
function referenceOpenText(reference: ReferenceRead, subpath?: string): string {
  const base = splitObsidianSubpath(parseWikiLink(reference.link)?.target ?? reference.link).base;
  return subpath ? `${base}#${subpath.replace(/^#+/, "")}` : base;
}

export function referenceTargetHint(reference: ReferenceRead): string {
  return reference.path ?? reference.target ?? reference.link;
}

export function referenceTitle(reference: ReferenceRead): string {
  if (reference.kind === "url") return reference.target ?? reference.link;
  if (reference.kind === "text") return reference.link;

  const wiki = parseWikiLink(reference.link);
  const alias = wiki?.alias?.trim();
  if (alias) return alias;

  const target = reference.path ?? reference.target ?? wiki?.target ?? reference.link;
  const base = splitObsidianSubpath(target).base;
  return pathBasenameWithoutExtension(base) || target;
}
