import { TFile } from "obsidian";
import { hasOwn, isRecord } from "../records";
import {
  frontmatterLinks,
  readFileFrontmatterFresh,
  type Frontmatter
} from "../vault/frontmatter";
import { normalizeVaultPath, splitObsidianSubpath } from "../vault/paths";
import { serializeFileWrite } from "../vault/write-serializer";
import type {
  AddReferenceOptions,
  AddReferenceResult,
  ReferenceMutationResult,
  ReferenceRead,
  ReferenceStoredItem,
  ReferenceWritableField,
  ReferenceWriteInput,
  WorkflowContext
} from "./context";
import { resolveRequiredFile } from "./locations";

export function pathBasenameWithoutExtension(path: string): string {
  const last = path.split("/").filter(Boolean).pop() ?? path;
  return last.replace(/\.md$/i, "");
}

export function parseWikiLink(value: string): { target: string; alias?: string } | undefined {
  const match = value.trim().match(/^\[\[([^\]|]+)(?:\|([^\]]*))?\]\]$/);
  const target = match?.[1]?.trim();
  if (!target) return undefined;
  return {
    target,
    ...(match?.[2] !== undefined ? { alias: match[2].trim() } : {})
  };
}

function parseMarkdownLink(value: string): { target: string } | undefined {
  const match = value.trim().match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  const text = match?.[1]?.trim();
  const target = match?.[2]?.trim();
  if (!text || !target) return undefined;
  return { target };
}

function normalizedReferenceTargetWithSubpath(value: string): string {
  const split = splitObsidianSubpath(value);
  return referenceTargetWithSubpath(split.base, split.subpath);
}

function referenceTargetWithSubpath(base: string, subpath: string): string {
  return `${base}${subpath}`;
}

export function canonicalWikiLink(target: string, alias?: string): string {
  const display = alias?.trim();
  return display ? `[[${target}|${display}]]` : `[[${target}]]`;
}

export function isExternalReference(value: string): boolean {
  const trimmed = value.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || /^(mailto|tel):/i.test(trimmed);
}

export function isSourceScopedRetro(
  ctx: WorkflowContext,
  retro: TFile,
  frontmatter: Frontmatter,
  source: TFile,
  domain: "project" | "area"
): boolean {
  if (domain === "project") {
    return frontmatterLinks(frontmatter.project).some((link) => stringReferencesAnyTarget(ctx, retro.path, link, [source]));
  }

  if (frontmatterLinks(frontmatter.project).length > 0) return false;
  return frontmatterLinks(frontmatter.areas).some((link) => stringReferencesAnyTarget(ctx, retro.path, link, [source]));
}

export async function addReference(ctx: WorkflowContext, options: AddReferenceOptions): Promise<AddReferenceResult> {
  // GUI command-palette callers add a reference to the active/source note.
  const source = resolveRequiredFile(ctx, options.sourcePath, "source note");
  const reference = await insertReferenceItem(ctx, source, {
    link: options.target,
    ...(options.description !== undefined ? { description: options.description } : {})
  });
  if (options.open) await ctx.host.openFile(source);
  return {
    path: source.path,
    title: source.basename,
    index: reference.index,
    link: reference.link,
    added: reference.added === true,
    id: reference.id,
    opened: options.open || undefined
  };
}

type NormalizedReferenceItem = {
  id: string | null;
  link: string;
  description?: string;
};

type PersistedReferenceItem = NormalizedReferenceItem & {
  id: string;
};

type NormalizedReferenceItemsRead = {
  items: NormalizedReferenceItem[];
  needsBackfill: boolean;
};

type ParsedReferenceTarget = {
  syntax: "wiki" | "markdown" | "url" | "raw";
  target: string;
  alias?: string;
};

const REFERENCE_ID_RE = /^[A-Za-z0-9_-]+$/;
const REFERENCE_ID_SPACE = 36 ** 6;
const UINT32_SPACE = 2 ** 32;
const REFERENCE_ID_REJECTION_LIMIT = Math.floor(UINT32_SPACE / REFERENCE_ID_SPACE) * REFERENCE_ID_SPACE;

// Pure read: never writes. Reference ids are assigned only on writes (insert/reorder/
// field edits) and when the citation suggester picks a still-id-less reference
// (ensureReferenceItemId) — a deliberate cite action, not a read.
export async function readReferenceItemsFresh(
  ctx: WorkflowContext,
  file: TFile
): Promise<ReferenceRead[]> {
  const read = referenceItemsReadFromFrontmatter(await readFileFrontmatterFresh(ctx, file));
  return read.items.map((item) => deriveReferenceRead(ctx, file, item));
}

export async function backfillReferenceIds(
  ctx: WorkflowContext,
  file: TFile
): Promise<{ changed: boolean; items: ReferenceRead[] }> {
  return serializeFileWrite(file.path, () => backfillReferenceIdsUnlocked(ctx, file));
}

async function backfillReferenceIdsUnlocked(
  ctx: WorkflowContext,
  file: TFile
): Promise<{ changed: boolean; items: ReferenceRead[] }> {
  const read = referenceItemsReadFromFrontmatter(await readFileFrontmatterFresh(ctx, file));
  const items = read.needsBackfill
    ? await writeReferenceItems(ctx, file, read.items)
    : read.items;
  return {
    changed: read.needsBackfill,
    items: items.map((item) => deriveReferenceRead(ctx, file, item))
  };
}

// Synchronous variant for renderers that already hold the note's cached frontmatter
// (markdown post-processors, CM6 decorations) — those run in a sync context and cannot
// await a fresh file read. Throws on a malformed `references` value; callers degrade.
export function readReferenceItemsFromFrontmatter(
  ctx: WorkflowContext,
  file: TFile,
  frontmatter: Frontmatter
): ReferenceRead[] {
  return referenceItemsFromFrontmatter(frontmatter).map((item) => deriveReferenceRead(ctx, file, item));
}

export async function insertReferenceItem(
  ctx: WorkflowContext,
  file: TFile,
  input: ReferenceWriteInput
): Promise<ReferenceMutationResult> {
  return serializeFileWrite(file.path, () => insertReferenceItemUnlocked(ctx, file, input));
}

async function insertReferenceItemUnlocked(
  ctx: WorkflowContext,
  file: TFile,
  input: ReferenceWriteInput
): Promise<ReferenceMutationResult> {
  const canonical = canonicalizeReferenceTarget(ctx, file, input.link);
  const description = hasOwn(input, "description")
    ? normalizeReferenceOptionalField(input.description, "description")
    : undefined;
  const read = referenceItemsReadFromFrontmatter(await readFileFrontmatterFresh(ctx, file));
  const items = read.items;
  const newId = generateUniqueReferenceId(referenceIdsInUse(items));
  const item = normalizeReferenceItem({
    id: newId,
    link: canonical.link,
    description
  });
  const itemKey = referenceDedupeKey(ctx, file, item.link);
  const duplicateIndex = items.findIndex((candidate) => referenceDedupeKey(ctx, file, candidate.link) === itemKey);
  if (duplicateIndex !== -1) {
    // Re-inserting an existing link is a no-op, but still return a citable id: reuse the
    // existing reference's id, or backfill an id-less match with a fresh one so the caller
    // can cite it immediately.
    const existing = items[duplicateIndex];
    const id = existing.id ?? newId;
    if (existing.id === null) {
      items[duplicateIndex] = { ...existing, id };
      await writeReferenceItems(ctx, file, items);
    } else if (read.needsBackfill) {
      await writeReferenceItems(ctx, file, items);
    }
    return {
      changed: false,
      index: duplicateIndex,
      link: existing.link,
      added: false,
      id
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
    added: true,
    id: newId
  };
}

export async function updateReferenceItem(
  ctx: WorkflowContext,
  file: TFile,
  index: number,
  patch: {
    link?: unknown;
    description?: unknown;
  }
): Promise<ReferenceMutationResult> {
  return serializeFileWrite(file.path, () => updateReferenceItemUnlocked(ctx, file, index, patch));
}

async function updateReferenceItemUnlocked(
  ctx: WorkflowContext,
  file: TFile,
  index: number,
  patch: {
    link?: unknown;
    description?: unknown;
  }
): Promise<ReferenceMutationResult> {
  const read = referenceItemsReadFromFrontmatter(await readFileFrontmatterFresh(ctx, file));
  const items = read.items;
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

  const nextItem = normalizeReferenceItem({ id: current.id, link, description });
  if (referenceItemsEqual(current, nextItem)) {
    if (read.needsBackfill) await writeReferenceItems(ctx, file, items);
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
  ctx: WorkflowContext,
  file: TFile,
  index: number,
  field: string,
  value: unknown
): Promise<ReferenceMutationResult> {
  const writableField = readReferenceWritableField(field, `references/${index}/${field}`);
  return serializeFileWrite(file.path, () => updateReferenceItemUnlocked(ctx, file, index, { [writableField]: value }));
}

export async function deleteReferenceItem(
  ctx: WorkflowContext,
  file: TFile,
  index: number
): Promise<ReferenceMutationResult> {
  return serializeFileWrite(file.path, () => deleteReferenceItemUnlocked(ctx, file, index));
}

async function deleteReferenceItemUnlocked(
  ctx: WorkflowContext,
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
  ctx: WorkflowContext,
  file: TFile,
  links: string[]
): Promise<{ changed: boolean; items: ReferenceRead[] }> {
  return serializeFileWrite(file.path, () => reorderReferenceItemsUnlocked(ctx, file, links));
}

async function reorderReferenceItemsUnlocked(
  ctx: WorkflowContext,
  file: TFile,
  links: string[]
): Promise<{ changed: boolean; items: ReferenceRead[] }> {
  const read = referenceItemsReadFromFrontmatter(await readFileFrontmatterFresh(ctx, file));
  const items = read.items;
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
  const persisted = changed || read.needsBackfill
    ? await writeReferenceItems(ctx, file, next)
    : next;
  return {
    changed,
    items: persisted.map((item) => deriveReferenceRead(ctx, file, item))
  };
}

export async function ensureReferenceItemId(
  ctx: WorkflowContext,
  file: TFile,
  reference: Pick<ReferenceRead, "id" | "link" | "description">,
  preferredIndex?: number
): Promise<ReferenceRead> {
  return serializeFileWrite(file.path, () => ensureReferenceItemIdUnlocked(ctx, file, reference, preferredIndex));
}

async function ensureReferenceItemIdUnlocked(
  ctx: WorkflowContext,
  file: TFile,
  reference: Pick<ReferenceRead, "id" | "link" | "description">,
  preferredIndex?: number
): Promise<ReferenceRead> {
  const read = referenceItemsReadFromFrontmatter(await readFileFrontmatterFresh(ctx, file));
  let index = reference.id === null
    ? -1
    : read.items.findIndex((item) => item.id === reference.id);

  if (index === -1 && preferredIndex !== undefined) {
    const preferred = read.items[preferredIndex];
    if (preferred && referenceItemsMatchSuggestion(preferred, reference)) index = preferredIndex;
  }

  if (index === -1) {
    index = read.items.findIndex((item) => referenceItemsMatchSuggestion(item, reference));
  }

  if (index === -1) throw new Error(`reference no longer present: ${reference.link}`);
  if (read.needsBackfill || read.items[index].id === null) {
    const persisted = await writeReferenceItems(ctx, file, read.items);
    return deriveReferenceRead(ctx, file, persisted[index]);
  }
  return deriveReferenceRead(ctx, file, read.items[index]);
}

export function readReferenceWritableField(value: string, originalKey: string): ReferenceWritableField {
  if (value === "link" || value === "description") return value;
  if (value === "id" || value === "kind" || value === "path" || value === "target") {
    throw new Error(`reference field is read-only for update key: ${originalKey}`);
  }
  throw new Error(`unknown reference field for update key: ${originalKey}`);
}

function referenceItemsFromFrontmatter(frontmatter: Frontmatter): NormalizedReferenceItem[] {
  return referenceItemsReadFromFrontmatter(frontmatter).items;
}

function referenceItemsReadFromFrontmatter(frontmatter: Frontmatter): NormalizedReferenceItemsRead {
  const value = frontmatter.references;
  if (value === undefined || value === null) return { items: [], needsBackfill: false };
  if (!Array.isArray(value)) throw new Error("references frontmatter must be an array");
  const usedIds = new Set<string>();
  let needsBackfill = false;
  const items = value.map((item, index) => {
    const normalized = normalizeReferenceStoredItem(item, index, usedIds);
    if (normalized.needsBackfill) needsBackfill = true;
    return normalized.item;
  });
  return { items, needsBackfill };
}

function normalizeReferenceStoredItem(
  value: unknown,
  index: number,
  usedIds: Set<string>
): { item: NormalizedReferenceItem; needsBackfill: boolean } {
  if (typeof value === "string") {
    const link = normalizeReferenceLinkValue(value, `references[${index}].link`);
    return {
      item: { id: null, link },
      needsBackfill: true
    };
  }
  if (!isRecord(value)) {
    throw new Error(`references[${index}] must be a string or object`);
  }
  const id = readReferenceStoredId(hasOwn(value, "id") ? value.id : undefined, usedIds);
  const link = normalizeReferenceLinkValue(value.link, `references[${index}].link`);
  const description = normalizeReferenceOptionalField(
    hasOwn(value, "description") ? value.description : undefined,
    "description"
  );
  const item: NormalizedReferenceItem = {
    id: id.value,
    link,
    ...(description !== undefined ? { description } : {})
  };
  return {
    item,
    needsBackfill: id.needsBackfill
  };
}

function normalizeReferenceItem(value: {
  id?: unknown;
  link: unknown;
  description?: unknown;
}, index?: number, usedIds?: Set<string>): PersistedReferenceItem {
  const keyPrefix = index === undefined ? "reference" : `references[${index}]`;
  const id = normalizeReferenceId(value.id, `${keyPrefix}.id`, usedIds);
  const link = normalizeReferenceLinkValue(value.link, `${keyPrefix}.link`);
  const description = normalizeReferenceOptionalField(value.description, "description");
  return {
    id,
    link,
    ...(description !== undefined ? { description } : {})
  };
}

async function writeReferenceItems(
  ctx: WorkflowContext,
  file: TFile,
  items: NormalizedReferenceItem[]
): Promise<PersistedReferenceItem[]> {
  const usedIds = new Set<string>();
  const normalized = items.map((item, index) => normalizeReferenceItem(item, index, usedIds));
  const stored = normalized.map(serializeReferenceStoredItem);
  await ctx.host.processFrontMatter(file, (fm) => {
    if (stored.length === 0) {
      delete fm.references;
    } else {
      fm.references = stored;
    }
  });
  return normalized;
}

function serializeReferenceStoredItem(item: PersistedReferenceItem): ReferenceStoredItem {
  return {
    link: item.link,
    id: item.id,
    ...(item.description !== undefined ? { description: item.description } : {})
  };
}

function referenceItemsMatchSuggestion(
  item: NormalizedReferenceItem,
  reference: Pick<ReferenceRead, "link" | "description">
): boolean {
  return item.link === reference.link && item.description === reference.description;
}

function normalizeReferenceId(value: unknown, key: string, usedIds?: Set<string>): string {
  if (value !== undefined && value !== null && value !== "") {
    if (typeof value !== "string") throw new Error(`${key} must be a string`);
    const id = value.trim();
    if (!REFERENCE_ID_RE.test(id)) throw new Error(`${key} must match ${REFERENCE_ID_RE.source}`);
    if (/[A-Za-z]/.test(id)) {
      if (usedIds?.has(id)) throw new Error(`${key}: duplicate reference id "${id}" — reference ids must be unique`);
      usedIds?.add(id);
      return id;
    }
  }

  const id = generateUniqueReferenceId(usedIds ?? new Set<string>());
  usedIds?.add(id);
  return id;
}

function readReferenceStoredId(
  value: unknown,
  usedIds: Set<string>
): { value: string | null; needsBackfill: boolean } {
  if (typeof value !== "string") return { value: null, needsBackfill: true };

  const id = value.trim();
  if (!id || !REFERENCE_ID_RE.test(id) || !/[A-Za-z]/.test(id)) {
    return { value: null, needsBackfill: true };
  }

  const duplicate = usedIds.has(id);
  usedIds.add(id);
  return {
    value: id,
    needsBackfill: duplicate || id !== value
  };
}

function referenceIdsInUse(items: NormalizedReferenceItem[]): Set<string> {
  return new Set(items.flatMap((item) => item.id === null ? [] : [item.id]));
}

function generateUniqueReferenceId(usedIds: Set<string>): string {
  while (true) {
    const id = randomBase36Id();
    if (usedIds.has(id)) continue;
    if (!/[a-z]/i.test(id)) continue;
    return id;
  }
}

function randomBase36Id(): string {
  let value = randomUint32();
  while (value >= REFERENCE_ID_REJECTION_LIMIT) {
    value = randomUint32();
  }
  return (value % REFERENCE_ID_SPACE).toString(36).padStart(6, "0");
}

function randomUint32(): number {
  const crypto = typeof window === "undefined" ? undefined : window.crypto;
  if (crypto && typeof crypto.getRandomValues === "function") {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0];
  }
  return Math.floor(Math.random() * UINT32_SPACE);
}

function referenceItemsEqual(left: NormalizedReferenceItem, right: NormalizedReferenceItem): boolean {
  return left.id === right.id && left.link === right.link && left.description === right.description;
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

function deriveReferenceRead(ctx: WorkflowContext, file: TFile, item: NormalizedReferenceItem): ReferenceRead {
  const link = item.link;
  const wiki = parseWikiLink(link);
  let derived: Omit<ReferenceRead, "id" | "description">;
  if (wiki) {
    derived = deriveWikiReferenceRead(ctx, file, link, wiki.target);
  } else if (isExternalReference(link)) {
    derived = { link, kind: "url", target: link };
  } else {
    derived = { link, kind: "text" };
  }

  return {
    id: item.id,
    ...derived,
    ...(item.description !== undefined ? { description: item.description } : {})
  };
}

function deriveWikiReferenceRead(
  ctx: WorkflowContext,
  file: TFile,
  link: string,
  target: string
): Omit<ReferenceRead, "id" | "description"> {
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
function referenceDedupeKey(ctx: WorkflowContext, source: TFile, link: string): string {
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
  ctx: WorkflowContext,
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
    assertUnambiguousReferenceTarget(ctx, splitObsidianSubpath(parsed.target).base);
    const resolved = resolveWikiReferenceFile(ctx, source, parsed.target);
    if (resolved) {
      return {
        link: canonicalWikiLink(referenceTargetWithSubpath(resolved.file.path, resolved.subpath), parsed.alias),
        targetPath: resolved.file.path
      };
    }
    throw new Error(
      `reference target must resolve to an existing vault note: ${parsed.target} (an alias alone is ambiguous - pick the note from the suggester or use its path)`
    );
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
      target: wiki.target,
      ...(wiki.alias !== undefined ? { alias: wiki.alias } : {})
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

// A bare reference target (basename only, no folder) silently resolves to Obsidian's FIRST
// match — wrong once several notes share that basename (e.g. an LLM-Wiki concept page named
// after the source it synthesizes). Refuse the ambiguity and require an explicit path. An
// explicit path still resolves to ANY note, so a human can deliberately cite a wiki page.
function assertUnambiguousReferenceTarget(ctx: WorkflowContext, base: string): void {
  if (base.includes("/")) return;
  const wanted = base.toLowerCase();
  const matches = ctx.host
    .getMarkdownFiles()
    .filter((file) => file.basename.toLowerCase() === wanted)
    .map((file) => file.path)
    .sort();
  if (matches.length > 1) {
    throw new Error(
      `reference target "${base}" is ambiguous - ${matches.length} notes share that name (${matches.join(", ")}); pass an explicit path, e.g. [[${matches[0]}|${base}]]`
    );
  }
}

function resolveWikiReferenceFile(
  ctx: WorkflowContext,
  source: TFile,
  target: string
): { file: TFile; subpath: string } | undefined {
  const split = splitObsidianSubpath(target);
  const normalized = referenceTargetWithSubpath(split.base, split.subpath);
  const resolved = ctx.host.getFirstLinkpathDest(normalized, source.path)
    ?? (split.base ? ctx.host.getFirstLinkpathDest(split.base, source.path) : null);
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
  ctx: WorkflowContext,
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
  const file = ctx.host.getAbstractFile(split.base);
  if (!(file instanceof TFile)) return undefined;
  return {
    file,
    subpath: split.subpath
  };
}


export function stringReferencesAnyTarget(
  ctx: WorkflowContext,
  sourcePath: string,
  value: string,
  targets: TFile[]
): boolean {
  const wikiTarget = readWikiLinkPath(value);
  if (wikiTarget) return linkReferencesAnyTarget(ctx, sourcePath, wikiTarget, targets);

  const markdown = parseMarkdownLink(value);
  if (markdown) {
    const target = splitObsidianSubpath(markdown.target).base;
    return target ? linkReferencesAnyTarget(ctx, sourcePath, target, targets) : false;
  }

  return bareStringReferencesAnyTarget(ctx, sourcePath, value, targets);
}

function linkReferencesAnyTarget(
  ctx: WorkflowContext,
  sourcePath: string,
  linkPath: string,
  targets: TFile[]
): boolean {
  const targetPaths = new Set(targets.map((target) => target.path));
  const resolved = resolveLinkReference(ctx, sourcePath, linkPath);
  if (resolved) return targetPaths.has(resolved.path);

  const normalized = normalizeVaultPath(linkPath.split("#")[0]);
  return targets.some((target) => normalized === target.path || normalized === target.basename);
}

function bareStringReferencesAnyTarget(
  ctx: WorkflowContext,
  sourcePath: string,
  value: string,
  targets: TFile[]
): boolean {
  const targetPaths = new Set(targets.map((target) => target.path));
  if (targetPaths.has(normalizeVaultPath(value))) return true;

  const resolved = resolveLinkReference(ctx, sourcePath, value);
  return resolved ? targetPaths.has(resolved.path) : false;
}

function resolveLinkReference(ctx: WorkflowContext, sourcePath: string, linkPath: string): TFile | null {
  if (!linkPath.trim()) return null;
  const split = splitObsidianSubpath(linkPath);
  const withSubpath = referenceTargetWithSubpath(split.base, split.subpath);
  return ctx.host.getFirstLinkpathDest(withSubpath, sourcePath)
    ?? (split.base ? ctx.host.getFirstLinkpathDest(split.base, sourcePath) : null);
}

function readWikiLinkPath(value: string): string | undefined {
  const match = value.trim().match(/^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]$/);
  return match?.[1]?.trim();
}
