import { TFile } from "obsidian";
import { hasOwn, isRecord } from "../records";
import {
  findSectionContentRangeByHeading,
  isMarkdownScaffold,
  markdownBodyRange,
  readSection,
  stripManagedPrelude,
  trimMarkdownBlock,
  type TextRange
} from "../vault/sections";
import { pickFrontmatter, readFileFrontmatterFresh, readFileTypeFresh, readType, type Frontmatter } from "../vault/frontmatter";
import type {
  CollectionKind,
  CollectionReadOptions,
  ReadAreaOptions,
  ReadJournalOptions,
  ReadProjectOptions,
  ReadResourceOptions,
  ReadRetroOptions,
  ReadZkOptions,
  WorkflowContext
} from "./context";
import { hasCollectionReadOptions, readCollectionPage } from "./collections";
import {
  JOURNAL_READ_SPEC,
  PROJECT_READ_SPEC,
  AREA_READ_SPEC,
  RESOURCE_READ_SPEC,
  RETRO_READ_SPEC,
  readSurfaceTopLevelKeys,
  sectionHeadingCandidates,
  specForType,
  type ReadSectionSpec,
  type ReadSurfaceSpec,
  unknownReadKeyError
} from "./describe";
import { countBacklinks, readBacklinks } from "./backlinks";
import { childFiles, findChild, isArchivedFile, resolveRequiredArea, resolveRequiredJournal, resolveRequiredProject, resolveRequiredResource, resolveRequiredRetro, resolveRequiredZk } from "./locations";
import { parseWikiLink, pathBasenameWithoutExtension, splitObsidianSubpath } from "./references";

type ReadMap = Record<string, unknown>;
type ReadCollectionKind = CollectionKind;

export async function readProject(ctx: WorkflowContext, options: ReadProjectOptions): Promise<Record<string, unknown>> {
  return readSurface(ctx, await resolveRequiredProject(ctx, options), PROJECT_READ_SPEC, options.key, options.collection);
}

export async function readArea(ctx: WorkflowContext, options: ReadAreaOptions): Promise<Record<string, unknown>> {
  return readSurface(ctx, await resolveRequiredArea(ctx, options), AREA_READ_SPEC, options.key, options.collection);
}

export async function readResource(ctx: WorkflowContext, options: ReadResourceOptions): Promise<Record<string, unknown>> {
  return readSurface(ctx, await resolveRequiredResource(ctx, options), RESOURCE_READ_SPEC, options.key, options.collection);
}

export async function readZk(ctx: WorkflowContext, options: ReadZkOptions): Promise<Record<string, unknown>> {
  const file = await resolveRequiredZk(ctx, options);
  const type = await readFileTypeFresh(ctx, file);
  return readSurface(ctx, file, specForType(type), options.key, options.collection);
}

export async function readJournal(ctx: WorkflowContext, options: ReadJournalOptions): Promise<Record<string, unknown>> {
  return readSurface(ctx, await resolveRequiredJournal(ctx, options), JOURNAL_READ_SPEC, options.key, options.collection);
}

export async function readRetro(ctx: WorkflowContext, options: ReadRetroOptions): Promise<Record<string, unknown>> {
  return readSurface(ctx, await resolveRequiredRetro(ctx, options), RETRO_READ_SPEC, options.key, options.collection);
}

async function readSurface(
  ctx: WorkflowContext,
  file: TFile,
  spec: ReadSurfaceSpec,
  rawKey: string | undefined,
  collectionOptions?: CollectionReadOptions
): Promise<Record<string, unknown>> {
  const frontmatter = await readFileFrontmatterFresh(ctx, file);
  const type = readType(frontmatter);
  const surface = await readSurfaceMap(ctx, file, spec);
  const key = rawKey?.trim();

  if (!key) {
    if (hasCollectionReadOptions(collectionOptions)) {
      throw new Error("collection read options require key=<collection>");
    }
    return compactReadEnvelope(ctx, file, type, surface, spec);
  }

  return {
    path: file.path,
    title: file.basename,
    type,
    mode: "exact",
    ...archivedReadFlag(ctx, file),
    key,
    value: await readSurfaceKey(ctx, file, surface, spec, key, collectionOptions)
  };
}

async function readSurfaceMap(ctx: WorkflowContext, file: TFile, spec: ReadSurfaceSpec): Promise<ReadMap> {
  const content = await ctx.host.read(file);
  const frontmatter = await readFileFrontmatterFresh(ctx, file);
  const surface: ReadMap = {
    frontmatter: pickFrontmatter(frontmatter, spec.frontmatter)
  };

  if (spec.body) surface.body = stripManagedPrelude(content);

  for (const section of spec.sections ?? []) {
    if (section.collection === "backlink") continue;
    if (section.collection === "reference" && section.transform) {
      surface[section.key] = await section.transform("", {
        ctx,
        file,
        content,
        section
      });
      continue;
    }
    const value = readSection(content, sectionHeadingCandidates(section));
    surface[section.key] = section.transform
      ? await section.transform(value, {
        ctx,
        file,
        content,
        range: findSectionContentRange(content, section),
        section
      })
      : value;
  }

  if (spec.children) surface.children = await childIndex(ctx, file);
  return surface;
}

function compactReadEnvelope(
  ctx: WorkflowContext,
  file: TFile,
  type: string,
  surface: ReadMap,
  spec: ReadSurfaceSpec
): Record<string, unknown> {
  const compact = compactReadMap(surface, spec);

  if (specHasBacklinkSection(spec)) {
    const backlinkCount = countBacklinks(ctx, file);
    if (backlinkCount > 0) compact.backlinks = { count: backlinkCount };
  }

  return {
    mode: "compact",
    path: file.path,
    title: file.basename,
    type,
    ...archivedReadFlag(ctx, file),
    ...compact
  };
}

function archivedReadFlag(ctx: WorkflowContext, file: TFile): { archived?: true } {
  return isArchivedFile(ctx, file) ? { archived: true } : {};
}

function compactReadMap(value: ReadMap, spec: ReadSurfaceSpec): ReadMap {
  const result: ReadMap = {};
  const collectionKeys = collectionKeysForSpec(spec);
  for (const [key, item] of Object.entries(value)) {
    const compact = key === "frontmatter"
      ? compactFrontmatter(item)
      : collectionKeys.has(key)
        ? compactCollectionCount(item)
        : compactSectionLength(item);
    if (compact !== undefined) result[key] = compact;
  }
  return result;
}

function compactCollectionCount(value: unknown): unknown {
  if (!isRecord(value)) return compactReadValue(value);
  const entries = Object.entries(value);
  if (entries.length === 0) return undefined;
  return {
    count: entries.length
  };
}

// Compact reads summarize prose sections by character count, mirroring the
// count-only treatment of collections, so a full read stays bounded for
// long-form notes. The full text is read on demand with `key=<section>`.
function compactSectionLength(value: unknown): unknown {
  if (typeof value !== "string") return compactReadValue(value);
  const trimmed = trimMarkdownBlock(value);
  if (trimmed.length === 0 || isMarkdownScaffold(trimmed)) return undefined;
  return { chars: trimmed.length };
}

function compactFrontmatter(value: unknown): unknown {
  if (!isRecord(value)) return compactReadValue(value);
  const result: Frontmatter = {};
  for (const [key, item] of Object.entries(value)) {
    const compact = compactFrontmatterValue(item);
    if (compact !== undefined) result[key] = compact;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function compactFrontmatterValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(compactFrontmatterValue).filter((item) => item !== undefined);
    return items.length > 0 ? items : undefined;
  }
  if (typeof value === "string") {
    const linkLabel = readWikiLinkLabel(value);
    return compactReadValue(linkLabel ?? value);
  }
  return compactReadValue(value);
}

function compactReadValue(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const trimmed = trimMarkdownBlock(value);
    return isMarkdownScaffold(trimmed) ? undefined : trimmed;
  }
  if (Array.isArray(value)) {
    const items = value.map(compactReadValue).filter((item) => item !== undefined);
    return items.length > 0 ? items : undefined;
  }
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const compact = compactReadValue(item);
      if (compact !== undefined) result[key] = compact;
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }
  return value;
}

async function readSurfaceKey(
  ctx: WorkflowContext,
  source: TFile,
  surface: ReadMap,
  spec: ReadSurfaceSpec,
  key: string,
  collectionOptions?: CollectionReadOptions,
  originalKey = key
): Promise<unknown> {
  const parts = keyParts(key);
  if (parts.length === 0) throw new Error("key is required");

  if (parts[0] !== "children") {
    if (parts[0] === "backlinks") {
      return readBacklinkSurfaceKey(ctx, source, spec, parts, originalKey, collectionOptions);
    }
    if (readSurfaceTopLevelKeys(spec).includes(parts[0])) {
      return readSurfaceMapKey(surface, spec, parts, originalKey, collectionOptions);
    }
    throw unknownReadKeyError(spec, originalKey);
  }

  if (!hasOwn(surface, "children")) {
    throw unknownReadKeyError(spec, originalKey);
  }
  if (parts.length === 1) return surface.children;

  const childTitle = parts[1];
  const child = findChild(ctx, source, childTitle);
  if (!child) throw new Error(`child not found: ${childTitle}`);

  const childType = await readFileTypeFresh(ctx, child);
  const childSpec = specForType(childType);
  if (parts.length > 2) {
    const childParts = parts.slice(2);
    if (childParts[0] === "backlinks") {
      return readBacklinkSurfaceKey(ctx, child, childSpec, childParts, originalKey, collectionOptions);
    }
  }

  const childSurface = await readSurfaceMap(ctx, child, childSpec);
  if (parts.length === 2) {
    return compactReadEnvelope(ctx, child, childType, childSurface, childSpec);
  }
  return readSurfaceKey(ctx, child, childSurface, childSpec, parts.slice(2).join("/"), collectionOptions, originalKey);
}

function readBacklinkSurfaceKey(
  ctx: WorkflowContext,
  file: TFile,
  spec: ReadSurfaceSpec,
  parts: string[],
  originalKey: string,
  collectionOptions?: CollectionReadOptions
): unknown {
  if (!specHasBacklinkSection(spec)) throw unknownReadKeyError(spec, originalKey);
  if (parts.length === 1) {
    return readCollectionPage(readBacklinks("", {
      ctx,
      file
    }), "backlink", collectionOptions);
  }

  if (hasCollectionReadOptions(collectionOptions)) {
    throw new Error("collection read options require key to select a collection root");
  }
  return readMapPath({ backlinks: readBacklinks("", {
    ctx,
    file
  }) }, parts, originalKey);
}

function readSurfaceMapKey(
  surface: ReadMap,
  spec: ReadSurfaceSpec,
  parts: string[],
  originalKey: string,
  collectionOptions?: CollectionReadOptions
): unknown {
  if (parts.length === 0) throw new Error("key is required");

  const collectionKind = collectionKindForKey(spec, parts[0]);
  if (collectionKind && parts.length === 1) {
    return readCollectionPage(surface[parts[0]], collectionKind, collectionOptions);
  }

  if (hasCollectionReadOptions(collectionOptions)) {
    throw new Error("collection read options require key to select a collection root");
  }

  if (!readSurfaceTopLevelKeys(spec).includes(parts[0])) {
    throw unknownReadKeyError(spec, originalKey);
  }
  if (parts[0] === "frontmatter" && parts.length >= 2 && !spec.frontmatter.includes(parts[1])) {
    throw unknownReadKeyError(spec, originalKey);
  }

  return readMapPath(surface, parts, originalKey);
}

function collectionKeysForSpec(spec: ReadSurfaceSpec): Set<string> {
  return new Set((spec.sections ?? [])
    .filter((section) => section.collection)
    .map((section) => section.key));
}

function collectionKindForKey(spec: ReadSurfaceSpec, key: string): ReadCollectionKind | undefined {
  return (spec.sections ?? []).find((section) => section.key === key)?.collection;
}

function specHasBacklinkSection(spec: ReadSurfaceSpec): boolean {
  return collectionKindForKey(spec, "backlinks") === "backlink";
}

async function childIndex(ctx: WorkflowContext, parent: TFile): Promise<Record<string, unknown>> {
  const entries: Record<string, unknown> = {};
  for (const file of childFiles(ctx, parent)) {
    const frontmatter = await readFileFrontmatterFresh(ctx, file);
    const type = readType(frontmatter);
    const item: Record<string, unknown> = {
      path: file.path,
      type,
      ...archivedReadFlag(ctx, file)
    };
    const subnoteType = frontmatter.subnote_type;
    if (subnoteType !== undefined) item.subnote_type = subnoteType;
    entries[file.basename] = item;
  }
  return entries;
}

function findSectionContentRange(content: string, section: ReadSectionSpec): TextRange | undefined {
  const body = markdownBodyRange(content);
  const markdown = content.slice(body.start, body.end);

  for (const label of sectionHeadingCandidates(section)) {
    const range = findSectionContentRangeByHeading(markdown, label, {
      offset: body.start
    });
    if (range) return range;
  }
  return undefined;
}

function readMapPath(map: ReadMap, parts: string[], originalKey: string): unknown {
  let current: unknown = map;
  for (const part of parts) {
    if (!isRecord(current) || !hasOwn(current, part)) {
      throw new Error(`unknown read key: ${originalKey}`);
    }
    current = current[part];
  }
  return current;
}

function keyParts(key: string): string[] {
  return key.split("/").map((part) => part.trim()).filter(Boolean);
}

function readWikiLinkLabel(value: string): string | undefined {
  const match = parseWikiLink(value);
  if (!match) return undefined;
  const target = splitObsidianSubpath(match.target).base || match.target;
  return (match.alias?.trim() || pathBasenameWithoutExtension(target)).trim();
}
