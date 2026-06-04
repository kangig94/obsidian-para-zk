import { TFile, type App } from "obsidian";
import { hasOwn, isRecord } from "../infra/records";
import {
  fileFrontmatter,
  readFileFrontmatterFresh,
  type Frontmatter
} from "../vault/note-frontmatter";
import {
  canonicalWikiLink,
  isExternalReference,
  normalizedReferenceTargetWithSubpath,
  parseMarkdownLink,
  parseWikiLink,
  referenceTargetWithSubpath,
  splitObsidianSubpath
} from "./reference-targets";

export type ReferenceContext = {
  app: App;
};

type ReferenceKind = "url" | "note" | "file" | "wiki" | "text";

export type ReferenceStoredItem = string | {
  link: string;
  description?: string;
};

export type ReferenceRead = {
  link: string;
  kind: ReferenceKind;
  description?: string;
  path?: string;
  target?: string;
};

export type ReferenceWritableField = "link" | "description";

export type ReferenceWriteInput = {
  link: unknown;
  description?: unknown;
  position?: unknown;
};

export type ReferenceMutationResult = {
  changed: boolean;
  index: number;
  link: string;
  added?: boolean;
};

type NormalizedReferenceItem = {
  link: string;
  description?: string;
};

type ParsedReferenceTarget = {
  syntax: "wiki" | "markdown" | "url" | "raw";
  target: string;
};

export function readReferenceItems(ctx: ReferenceContext, file: TFile): ReferenceRead[] {
  return referenceItemsFromFrontmatter(fileFrontmatter(ctx, file))
    .map((item) => deriveReferenceRead(ctx, file, item));
}

export async function readReferenceItemsFresh(ctx: ReferenceContext, file: TFile): Promise<ReferenceRead[]> {
  return referenceItemsFromFrontmatter(await readFileFrontmatterFresh(ctx, file))
    .map((item) => deriveReferenceRead(ctx, file, item));
}

export async function insertReferenceItem(
  ctx: ReferenceContext,
  file: TFile,
  input: ReferenceWriteInput
): Promise<ReferenceMutationResult> {
  const canonical = canonicalizeReferenceTarget(ctx, file, input.link);
  const description = hasOwn(input, "description")
    ? normalizeReferenceOptionalField(input.description, "description")
    : undefined;
  const item = normalizeReferenceItem({
    link: canonical.link,
    description
  });
  const items = referenceItemsFromFrontmatter(await readFileFrontmatterFresh(ctx, file));
  const itemKey = referenceDedupeKey(ctx, file, item.link);
  const duplicateIndex = items.findIndex((candidate) => referenceDedupeKey(ctx, file, candidate.link) === itemKey);
  if (duplicateIndex !== -1) {
    return {
      changed: false,
      index: duplicateIndex,
      link: item.link,
      added: false
    };
  }

  const position = normalizeReferenceInsertPosition(input.position, items.length);
  const next = [...items];
  next.splice(position, 0, item);
  await writeReferenceItems(ctx, file, next);
  return {
    changed: true,
    index: position,
    link: item.link,
    added: true
  };
}

export async function updateReferenceItem(
  ctx: ReferenceContext,
  file: TFile,
  index: number,
  patch: {
    link?: unknown;
    description?: unknown;
  }
): Promise<ReferenceMutationResult> {
  const items = referenceItemsFromFrontmatter(await readFileFrontmatterFresh(ctx, file));
  assertReferenceIndex(items, index);

  const current = items[index];
  const hasLink = hasOwn(patch, "link");
  const hasDescription = hasOwn(patch, "description");

  let link = current.link;
  let description = current.description;

  if (hasLink) {
    const canonical = canonicalizeReferenceTarget(ctx, file, patch.link);
    link = canonical.link;
  }
  if (hasDescription) {
    description = normalizeReferenceOptionalField(patch.description, "description");
  }

  const linkKey = referenceDedupeKey(ctx, file, link);
  const duplicateIndex = items.findIndex((candidate, candidateIndex) =>
    candidateIndex !== index && referenceDedupeKey(ctx, file, candidate.link) === linkKey);
  if (duplicateIndex !== -1) {
    throw new Error(`duplicate reference target: ${link}`);
  }

  const nextItem = normalizeReferenceItem({ link, description });
  if (referenceItemsEqual(current, nextItem)) {
    return {
      changed: false,
      index,
      link: nextItem.link
    };
  }

  const next = [...items];
  next[index] = nextItem;
  await writeReferenceItems(ctx, file, next);
  return {
    changed: true,
    index,
    link: nextItem.link
  };
}

export async function setReferenceItemField(
  ctx: ReferenceContext,
  file: TFile,
  index: number,
  field: string,
  value: unknown
): Promise<ReferenceMutationResult> {
  const writableField = readReferenceWritableField(field, `references/${index}/${field}`);
  return updateReferenceItem(ctx, file, index, { [writableField]: value });
}

export async function deleteReferenceItem(
  ctx: ReferenceContext,
  file: TFile,
  index: number
): Promise<ReferenceMutationResult> {
  const items = referenceItemsFromFrontmatter(await readFileFrontmatterFresh(ctx, file));
  assertReferenceIndex(items, index);
  const [removed] = items.splice(index, 1);
  await writeReferenceItems(ctx, file, items);
  return {
    changed: true,
    index,
    link: removed.link
  };
}

export async function reorderReferenceItems(
  ctx: ReferenceContext,
  file: TFile,
  links: string[]
): Promise<{ changed: boolean; items: ReferenceRead[] }> {
  const items = referenceItemsFromFrontmatter(await readFileFrontmatterFresh(ctx, file));
  if (links.length !== items.length) throw new Error("reference reorder requires the full current link order");

  const byLink = new Map<string, NormalizedReferenceItem>();
  for (const item of items) {
    if (byLink.has(item.link)) throw new Error(`duplicate reference link in current frontmatter: ${item.link}`);
    byLink.set(item.link, item);
  }

  const seen = new Set<string>();
  const next: NormalizedReferenceItem[] = [];
  for (const link of links) {
    if (seen.has(link)) throw new Error(`duplicate reference link in reorder: ${link}`);
    seen.add(link);
    const item = byLink.get(link);
    if (!item) throw new Error(`reference no longer present: ${link}`);
    next.push(item);
  }

  const changed = !items.every((item, itemIndex) => item.link === next[itemIndex]?.link);
  if (changed) await writeReferenceItems(ctx, file, next);
  return {
    changed,
    items: next.map((item) => deriveReferenceRead(ctx, file, item))
  };
}

export function readReferenceWritableField(value: string, originalKey: string): ReferenceWritableField {
  if (value === "link" || value === "description") return value;
  if (value === "kind" || value === "path" || value === "target") {
    throw new Error(`reference field is read-only for update key: ${originalKey}`);
  }
  throw new Error(`unknown reference field for update key: ${originalKey}`);
}

function referenceItemsFromFrontmatter(frontmatter: Frontmatter): NormalizedReferenceItem[] {
  const value = frontmatter.references;
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error("references frontmatter must be an array");
  return value.map((item, index) => normalizeReferenceStoredItem(item, index));
}

function normalizeReferenceStoredItem(value: unknown, index: number): NormalizedReferenceItem {
  if (typeof value === "string") {
    return normalizeReferenceItem({ link: value }, index);
  }
  if (!isRecord(value)) {
    throw new Error(`references[${index}] must be a string or object`);
  }
  return normalizeReferenceItem({
    link: value.link,
    description: hasOwn(value, "description") ? value.description : undefined
  }, index);
}

function normalizeReferenceItem(value: {
  link: unknown;
  description?: unknown;
}, index?: number): NormalizedReferenceItem {
  const keyPrefix = index === undefined ? "reference" : `references[${index}]`;
  const link = normalizeReferenceLinkValue(value.link, `${keyPrefix}.link`);
  const description = normalizeReferenceOptionalField(value.description, "description");
  return {
    link,
    ...(description !== undefined ? { description } : {})
  };
}

async function writeReferenceItems(
  ctx: ReferenceContext,
  file: TFile,
  items: NormalizedReferenceItem[]
): Promise<void> {
  const stored = items.map(serializeReferenceStoredItem);
  await ctx.app.fileManager.processFrontMatter(file, (fm) => {
    if (stored.length === 0) {
      delete fm.references;
    } else {
      fm.references = stored;
    }
  });
}

function serializeReferenceStoredItem(item: NormalizedReferenceItem): ReferenceStoredItem {
  if (item.description === undefined) return item.link;
  return {
    link: item.link,
    description: item.description
  };
}

function referenceItemsEqual(left: NormalizedReferenceItem, right: NormalizedReferenceItem): boolean {
  return left.link === right.link && left.description === right.description;
}

function assertReferenceIndex(items: NormalizedReferenceItem[], index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= items.length) {
    throw new Error(`reference not found: ${index}`);
  }
}

function normalizeReferenceInsertPosition(value: unknown, length: number): number {
  if (value === undefined || value === null || value === "" || value === "end") return length;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > length) {
    throw new Error(`reference position must be an integer between 0 and ${length}`);
  }
  return value;
}

function normalizeReferenceLinkValue(value: unknown, key: string): string {
  if (typeof value !== "string") throw new Error(`${key} must be a string`);
  const link = value.trim();
  if (!link) throw new Error(`${key} is required`);
  return link;
}

function normalizeReferenceOptionalField(value: unknown, key: "description"): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`reference ${key} must be a string or null`);
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function deriveReferenceRead(ctx: ReferenceContext, file: TFile, item: NormalizedReferenceItem): ReferenceRead {
  const link = item.link;
  const wiki = parseWikiLink(link);
  let derived: ReferenceRead;
  if (wiki) {
    derived = deriveWikiReferenceRead(ctx, file, link, wiki.target);
  } else if (isExternalReference(link)) {
    derived = { link, kind: "url", target: link };
  } else {
    derived = { link, kind: "text" };
  }

  return {
    ...derived,
    ...(item.description !== undefined ? { description: item.description } : {})
  };
}

function deriveWikiReferenceRead(ctx: ReferenceContext, file: TFile, link: string, target: string): ReferenceRead {
  const resolved = resolveWikiReferenceFile(ctx, file, target);
  const normalized = normalizedReferenceTargetWithSubpath(target);
  if (resolved) {
    return {
      link,
      kind: resolved.file.path.endsWith(".md") ? "note" : "file",
      path: resolved.file.path
    };
  }
  return {
    link,
    kind: "wiki",
    target: normalized
  };
}

// Dedupe identity for a stored reference link. Resolution-based so two textual forms of
// the same vault target collide, while distinct Obsidian subpaths remain distinct.
function referenceDedupeKey(ctx: ReferenceContext, source: TFile, link: string): string {
  const wiki = parseWikiLink(link);
  if (wiki) {
    const resolved = resolveWikiReferenceFile(ctx, source, wiki.target);
    if (resolved) return `file:${resolved.file.path}#${resolved.subpath}`;
    return `wiki:${normalizedReferenceTargetWithSubpath(wiki.target)}`;
  }
  if (isExternalReference(link)) return `url:${link.trim()}`;
  return `text:${link}`;
}

function canonicalizeReferenceTarget(
  ctx: ReferenceContext,
  source: TFile,
  target: unknown
): {
  link: string;
  targetPath?: string;
} {
  const value = normalizeReferenceLinkValue(target, "reference target");
  const parsed = parseReferenceTargetInput(value);

  if (parsed.syntax === "url" || (parsed.syntax === "markdown" && isExternalReference(parsed.target))) {
    return {
      link: parsed.target.trim()
    };
  }

  if (parsed.syntax === "wiki") {
    const resolved = resolveWikiReferenceFile(ctx, source, parsed.target);
    if (resolved) {
      return {
        link: canonicalWikiLink(referenceTargetWithSubpath(resolved.file.path, resolved.subpath)),
        targetPath: resolved.file.path
      };
    }
    return {
      link: canonicalWikiLink(normalizedReferenceTargetWithSubpath(parsed.target))
    };
  }

  if (parsed.syntax === "markdown") {
    const resolved = resolveRawReferenceFile(ctx, source, parsed.target);
    if (!resolved) {
      throw new Error(`markdown reference target must be a URL or existing vault file: ${parsed.target}`);
    }
    return {
      link: canonicalWikiLink(referenceTargetWithSubpath(resolved.file.path, resolved.subpath)),
      targetPath: resolved.file.path
    };
  }

  const resolved = resolveRawReferenceFile(ctx, source, parsed.target);
  if (resolved) {
    return {
      link: canonicalWikiLink(referenceTargetWithSubpath(resolved.file.path, resolved.subpath)),
      targetPath: resolved.file.path
    };
  }

  return {
    link: value
  };
}

function parseReferenceTargetInput(value: string): ParsedReferenceTarget {
  const wiki = parseWikiLink(value);
  if (wiki) {
    return {
      syntax: "wiki",
      target: wiki.target
    };
  }

  const markdown = parseMarkdownLink(value);
  if (markdown) {
    return {
      syntax: "markdown",
      target: markdown.target
    };
  }

  if (isExternalReference(value)) {
    return {
      syntax: "url",
      target: value
    };
  }

  return {
    syntax: "raw",
    target: value
  };
}

function resolveWikiReferenceFile(
  ctx: ReferenceContext,
  source: TFile,
  target: string
): { file: TFile; subpath: string } | undefined {
  const split = splitObsidianSubpath(target);
  const normalized = referenceTargetWithSubpath(split.base, split.subpath);
  const resolved = ctx.app.metadataCache.getFirstLinkpathDest(normalized, source.path)
    ?? (split.base ? ctx.app.metadataCache.getFirstLinkpathDest(split.base, source.path) : null);
  if (resolved) {
    return {
      file: resolved,
      subpath: split.subpath
    };
  }
  if (!split.base && split.subpath) {
    return {
      file: source,
      subpath: split.subpath
    };
  }
  return undefined;
}

function resolveRawReferenceFile(
  ctx: ReferenceContext,
  source: TFile,
  target: string
): { file: TFile; subpath: string } | undefined {
  const split = splitObsidianSubpath(target);
  if (!split.base && split.subpath) {
    return {
      file: source,
      subpath: split.subpath
    };
  }
  const file = ctx.app.vault.getAbstractFileByPath(split.base);
  if (!(file instanceof TFile)) return undefined;
  return {
    file,
    subpath: split.subpath
  };
}
