import type { App, TFile } from "obsidian";
import { localePack } from "../i18n";
import { hasOwn, isRecord } from "../infra/records";
import {
  findSectionContentRangeByHeading,
  isMarkdownScaffold,
  markdownBodyRange,
  readSection,
  skipProjectSummaryManagedBlock,
  spliceTextRange,
  stripManagedPrelude,
  stripProjectSummaryManagedBlock,
  trimMarkdownBlock,
  trimTextRange,
  trailingManagedBlockStart,
  type TextRange
} from "../markdown/sections";
import type { ParaZkSettings } from "../types";
import {
  ENERGY_CODE_HELP,
  MATURITY_CODE_HELP,
  PRIORITY_CODE_HELP,
  PROJECT_STATUS_CODE_HELP,
  SUBNOTE_TYPE_CODE_HELP,
  parseEnergyCode,
  parseMaturityCode,
  parsePriorityCode,
  parseProjectStatusCode,
  parseSubnoteTypeCode
} from "../vocabulary";
import { ensureFolder, parentFolder } from "../vault/files";
import {
  fileFrontmatter,
  pickFrontmatter,
  readFileFrontmatterFresh,
  readType,
  type Frontmatter
} from "../vault/note-frontmatter";
import { joinVaultPath, normalizeVaultPath, wikiLink } from "../vault/paths";
import { readOptionalCode } from "./code-options";
import {
  hasCollectionReadOptions,
  readCollectionPage,
  type CollectionKind as ReadCollectionKindModel,
  type CollectionReadOptions as CollectionReadOptionsModel
} from "./collection-pages";
import {
  archivedCounterpartFolder,
  assertVacantPath,
  folderName,
  folderStyleContainer,
  isArchivedFile,
  isArchivedPath,
  relativePathUnderRoot
} from "./note-locations";
import {
  deleteReferenceItem,
  insertReferenceItem,
  readReferenceItems,
  readReferenceWritableField,
  setReferenceItemField,
  type ReferenceRead,
  type ReferenceWritableField,
  type ReferenceWriteInput
} from "./reference-items";
import {
  parseWikiLink,
  pathBasenameWithoutExtension,
  splitObsidianSubpath
} from "./reference-targets";
import {
  assertRootTaskExists,
  deleteRootTask,
  insertRootTask,
  readRootTaskMap,
  readTaskWritableField,
  rootIdFromFrontmatter,
  setRootTaskField,
  taskShardPath,
  type TaskRead,
  type TaskWritableField
} from "./tasks";

type SurfaceContext = {
  app: App;
  settings: ParaZkSettings;
};

export type CollectionReadOptions = CollectionReadOptionsModel;

export type UpdateOperation = "set" | "insert" | "append" | "prepend" | "replace" | "delete";

export type UpdatePayloadOptions = {
  key?: string;
  operation?: string;
  value?: unknown;
  valueSource?: "value" | "value_json";
  match?: string;
  replacement?: string;
  all?: boolean;
};

export type UpdateSurfaceResult = {
  path: string;
  title: string;
  type: string;
  archived: boolean;
  key: string;
  operation: UpdateOperation;
  changed: boolean;
  matches?: number;
  index?: number;
  link?: string;
  added?: boolean;
  moved?: boolean;
  fromPath?: string;
  toPath?: string;
};

type ReadMap = Record<string, unknown>;
type SectionTransformContext = {
  ctx: SurfaceContext;
  file: TFile;
  content: string;
  range?: TextRange;
  section: ReadSectionSpec;
};
type ReadCollectionKind = ReadCollectionKindModel;
export type ReadSectionSpec = {
  key: string;
  labelKey?: string;
  labels?: string[];
  includeSubsections?: boolean;
  skipManagedPrelude?: boolean;
  collection?: ReadCollectionKind;
  transform?: (content: string, context: SectionTransformContext) => unknown | Promise<unknown>;
};
export type ReadSurfaceSpec = {
  frontmatter: string[];
  sections?: ReadSectionSpec[];
  body?: boolean;
  children?: boolean;
};
export type SurfaceDescription = {
  type: string;
  readKeys: string[];
  writeKeys: string[];
  frontmatterKeys?: string[];
  collections: Record<string, ReadCollectionKind>;
};
export type BacklinkRead = {
  link: string;
  path: string;
  title: string;
  type: string;
};

const BACKLINK_READ_SECTION: ReadSectionSpec = {
  key: "backlinks",
  labelKey: "backlinks",
  transform: readBacklinks,
  collection: "backlink"
};

const SURFACE_TYPES = [
  "project",
  "area",
  "resource",
  "journal",
  "retro",
  "doc",
  "zk_fleeting",
  "zk_literature",
  "zk_permanent",
  "note"
] as const;

type SurfaceType = typeof SURFACE_TYPES[number];

export const PROJECT_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: ["areas", "status", "priority", "start_date", "due_date", "done_date"],
  sections: [
    { key: "summary", labelKey: "summary", skipManagedPrelude: true, transform: stripProjectSummaryManagedBlock },
    { key: "goals", labelKey: "goals" },
    { key: "tasks", labelKey: "tasks", transform: readTasks, collection: "task" },
    { key: "references", labelKey: "references", transform: readReferences, collection: "reference" },
    BACKLINK_READ_SECTION
  ],
  children: true
};

export const AREA_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: ["parent"],
  sections: [
    { key: "overview", labelKey: "overview" },
    { key: "tasks", labelKey: "tasks", transform: readTasks, collection: "task" },
    { key: "references", labelKey: "references", transform: readReferences, collection: "reference" },
    BACKLINK_READ_SECTION
  ],
  children: true
};

export const RESOURCE_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: [],
  sections: [
    { key: "overview", labelKey: "overview" },
    { key: "body", labelKey: "body" },
    { key: "references", labelKey: "references", transform: readReferences, collection: "reference" },
    BACKLINK_READ_SECTION
  ]
};

export const JOURNAL_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: ["date", "energy"],
  sections: [
    { key: "focus", labelKey: "focus" },
    { key: "quick_memo", labelKey: "quickMemo" },
    { key: "timeline", labelKey: "timeline" },
    { key: "tasks", labelKey: "tasks", transform: readTasks, collection: "task" },
    { key: "short_review", labelKey: "shortReview" },
    { key: "references", labelKey: "references", transform: readReferences, collection: "reference" },
    BACKLINK_READ_SECTION
  ]
};

export const RETRO_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: ["project", "areas", "date", "week_iso", "week_start", "week_end"],
  sections: [
    { key: "week_progress", labelKey: "weekProgress" },
    { key: "good", labelKey: "good" },
    { key: "improve", labelKey: "improve" },
    { key: "risks", labelKey: "risks" },
    { key: "retro_summary", labelKey: "retroSummary" },
    BACKLINK_READ_SECTION
  ]
};

const DOC_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: ["subnote_type"],
  sections: [
    BACKLINK_READ_SECTION
  ],
  body: true
};

const ZK_FLEETING_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: ["processed"],
  sections: [
    { key: "thought_summary", labelKey: "thoughtSummary" },
    { key: "memo", labelKey: "memo" },
    { key: "tasks", labelKey: "tasks", transform: readTasks, collection: "task" },
    { key: "references", labelKey: "references", transform: readReferences, collection: "reference" },
    BACKLINK_READ_SECTION
  ]
};

const ZK_LITERATURE_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: ["sourceTitle", "authors", "published", "url"],
  sections: [
    { key: "highlight_block", labelKey: "highlightBlock" },
    { key: "summary", labelKey: "summary" },
    { key: "insight", labelKey: "insight" },
    { key: "evidence", labelKey: "evidence" },
    { key: "references", labelKey: "references", transform: readReferences, collection: "reference" },
    BACKLINK_READ_SECTION
  ]
};

const ZK_PERMANENT_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: ["maturity", "aliases"],
  sections: [
    { key: "one_sentence_summary", labelKey: "oneSentenceSummary" },
    { key: "body", labelKey: "body" },
    { key: "limitations", labelKey: "limitations" },
    { key: "related_questions", labelKey: "relatedQuestions" },
    { key: "references", labelKey: "references", transform: readReferences, collection: "reference" },
    BACKLINK_READ_SECTION
  ]
};

const NOTE_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: [],
  sections: [
    BACKLINK_READ_SECTION
  ],
  body: true
};

export async function readSurface(
  ctx: SurfaceContext,
  file: TFile,
  spec: ReadSurfaceSpec,
  rawKey: string | undefined,
  collectionOptions?: CollectionReadOptions
): Promise<Record<string, unknown>> {
  const frontmatter = fileFrontmatter(ctx, file);
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

async function readSurfaceMap(ctx: SurfaceContext, file: TFile, spec: ReadSurfaceSpec): Promise<ReadMap> {
  const content = await ctx.app.vault.read(file);
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
    const value = readSection(content, sectionHeadingCandidates(section), {
      includeSubsections: section.includeSubsections ?? false
    });
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

  if (spec.children) surface.children = childIndex(ctx, file);
  return surface;
}

function compactReadEnvelope(
  ctx: SurfaceContext,
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

function archivedReadFlag(ctx: SurfaceContext, file: TFile): { archived?: true } {
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
  ctx: SurfaceContext,
  source: TFile,
  surface: ReadMap,
  spec: ReadSurfaceSpec,
  key: string,
  collectionOptions?: CollectionReadOptions
): Promise<unknown> {
  const parts = keyParts(key);
  if (parts.length === 0) throw new Error("key is required");

  if (parts[0] !== "children") {
    if (parts[0] === "backlinks") {
      return readBacklinkSurfaceKey(ctx, source, spec, parts, key, collectionOptions);
    }
    return readSurfaceMapKey(surface, spec, parts, key, collectionOptions);
  }

  if (!hasOwn(surface, "children")) {
    throw unknownReadKeyError(spec, key);
  }
  if (parts.length === 1) return surface.children;

  const childTitle = parts[1];
  const child = findChild(ctx, source, childTitle);
  if (!child) throw new Error(`child not found: ${childTitle}`);

  const childType = readType(fileFrontmatter(ctx, child));
  const childSpec = specForType(childType);
  if (parts.length > 2) {
    const childParts = parts.slice(2);
    if (childParts[0] === "backlinks") {
      return readBacklinkSurfaceKey(ctx, child, childSpec, childParts, key, collectionOptions);
    }
  }

  const childSurface = await readSurfaceMap(ctx, child, childSpec);
  if (parts.length === 2) {
    return compactReadEnvelope(ctx, child, childType, childSurface, childSpec);
  }
  return readSurfaceMapKey(childSurface, childSpec, parts.slice(2), key, collectionOptions);
}

function readBacklinkSurfaceKey(
  ctx: SurfaceContext,
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
      file,
      content: "",
      section: BACKLINK_READ_SECTION
    }), "backlink", collectionOptions);
  }

  if (hasCollectionReadOptions(collectionOptions)) {
    throw new Error("collection read options require key to select a collection root");
  }
  return readMapPath({ backlinks: readBacklinks("", {
    ctx,
    file,
    content: "",
    section: BACKLINK_READ_SECTION
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

type WritableSurfaceTarget =
  | {
    kind: "frontmatter";
    file: TFile;
    frontmatterKey: string;
  }
  | {
    kind: "text";
    file: TFile;
    range: TextRange;
  }
  | {
    kind: "taskCollection";
    file: TFile;
  }
  | {
    kind: "taskItem";
    file: TFile;
    taskId: string;
    field?: TaskWritableField;
  }
  | {
    kind: "referenceCollection";
    file: TFile;
  }
  | {
    kind: "referenceItem";
    file: TFile;
    index: number;
    field?: ReferenceWritableField;
  };

type TextUpdateResult = {
  changed: boolean;
  matches?: number;
  index?: number;
  link?: string;
  added?: boolean;
  file?: TFile;
  moved?: boolean;
  fromPath?: string;
  toPath?: string;
};

export async function updateSurface(
  ctx: SurfaceContext,
  file: TFile,
  spec: ReadSurfaceSpec,
  options: UpdatePayloadOptions
): Promise<UpdateSurfaceResult> {
  const key = requireUpdateKey(options.key);
  const operation = parseUpdateOperation(options.operation);
  const target = await resolveWritableSurfaceTarget(ctx, file, spec, key, key);
  let result: TextUpdateResult;
  switch (target.kind) {
    case "frontmatter":
      result = await updateFrontmatterSurface(ctx, target, operation, options);
      break;
    case "text":
      result = await updateTextSurface(ctx, target, operation, options);
      break;
    case "taskCollection":
      result = await updateTaskCollectionSurface(ctx, target, operation, options);
      break;
    case "taskItem":
      result = await updateTaskItemSurface(ctx, target, operation, options);
      break;
    case "referenceCollection":
      result = await updateReferenceCollectionSurface(ctx, target, operation, options);
      break;
    case "referenceItem":
      result = await updateReferenceItemSurface(ctx, target, operation, options);
      break;
    default:
      throw new Error("unknown update target");
  }
  const resultFile = result.file ?? target.file;

  return {
    path: resultFile.path,
    title: resultFile.basename,
    type: readType(fileFrontmatter(ctx, resultFile)),
    archived: isArchivedFile(ctx, resultFile),
    key,
    operation,
    changed: result.changed,
    matches: result.matches,
    index: result.index,
    link: result.link,
    added: result.added,
    moved: result.moved,
    fromPath: result.fromPath,
    toPath: result.toPath
  };
}

async function resolveWritableSurfaceTarget(
  ctx: SurfaceContext,
  file: TFile,
  spec: ReadSurfaceSpec,
  key: string,
  originalKey: string
): Promise<WritableSurfaceTarget> {
  const parts = keyParts(key);
  if (parts.length === 0) throw new Error("key is required");

  if (parts[0] === "children") {
    if (!spec.children) throw unknownUpdateKeyError(spec, originalKey);
    if (parts.length < 3) throw new Error(`children map is read-only; use children/<title>/<key>`);

    const childTitle = parts[1];
    const child = findChild(ctx, file, childTitle);
    if (!child) throw new Error(`child not found: ${childTitle}`);

    return resolveWritableSurfaceTarget(
      ctx,
      child,
      specForType(readType(fileFrontmatter(ctx, child))),
      parts.slice(2).join("/"),
      originalKey
    );
  }

  if (parts[0] === "frontmatter") {
    if (parts.length !== 2) throw new Error(`frontmatter map is read-only; use frontmatter/<key>`);
    const frontmatterKey = parts[1];
    if (!spec.frontmatter.includes(frontmatterKey)) throw unknownUpdateKeyError(spec, originalKey);
    return {
      kind: "frontmatter",
      file,
      frontmatterKey
    };
  }

  if (parts[0] === "body" && parts.length === 1 && spec.body) {
    const content = await ctx.app.vault.read(file);
    return {
      kind: "text",
      file,
      range: writableBodyRange(content)
    };
  }

  const section = spec.sections?.find((item) => item.key === parts[0]);
  if (!section) throw unknownUpdateKeyError(spec, originalKey);

  if (section.collection) {
    return resolveWritableCollectionTarget(ctx, file, section, parts, originalKey);
  }

  if (parts.length !== 1) throw new Error(`unknown update key: ${originalKey}`);

  const content = await ctx.app.vault.read(file);
  return {
    kind: "text",
    file,
    range: writableSectionRange(content, section, originalKey)
  };
}

async function resolveWritableCollectionTarget(
  ctx: SurfaceContext,
  file: TFile,
  section: ReadSectionSpec,
  parts: string[],
  originalKey: string
): Promise<WritableSurfaceTarget> {
  if (section.collection === "reference") {
    return resolveWritableReferenceCollectionTarget(file, parts, originalKey);
  }
  if (section.collection !== "task") throw new Error(`unknown update key: ${originalKey}`);

  if (parts.length === 1) {
    return {
      kind: "taskCollection",
      file
    };
  }
  if (parts.length === 2 || parts.length === 3) {
    await assertRootTaskExists(ctx, file, parts[1]);
    const field = parts.length === 3 ? readTaskWritableField(parts[2], originalKey) : undefined;
    return {
      kind: "taskItem",
      file,
      taskId: parts[1],
      field
    };
  }

  throw new Error(`unknown update key: ${originalKey}`);
}

async function resolveWritableReferenceCollectionTarget(
  file: TFile,
  parts: string[],
  originalKey: string
): Promise<WritableSurfaceTarget> {
  if (parts.length === 1) {
    return {
      kind: "referenceCollection",
      file
    };
  }
  if (parts.length === 2 || parts.length === 3) {
    const index = parseReferenceIndex(parts[1], originalKey);
    const field = parts.length === 3 ? readReferenceWritableField(parts[2], originalKey) : undefined;
    return {
      kind: "referenceItem",
      file,
      index,
      field
    };
  }

  throw new Error(`unknown update key: ${originalKey}`);
}

async function updateFrontmatterSurface(
  ctx: SurfaceContext,
  target: Extract<WritableSurfaceTarget, { kind: "frontmatter" }>,
  operation: UpdateOperation,
  options: UpdatePayloadOptions
): Promise<TextUpdateResult> {
  if (operation !== "set") throw new Error("frontmatter keys only support op=set");

  const value = normalizeFrontmatterUpdateValue(
    readType(fileFrontmatter(ctx, target.file)),
    target.frontmatterKey,
    requireUpdateValue(options)
  );
  const movePlan = projectStatusMovePlan(ctx, target.file, target.frontmatterKey, value);
  if (movePlan) assertCanMoveNoteBetweenRoots(ctx, target.file, movePlan.fromRoot, movePlan.toRoot);
  const before = fileFrontmatter(ctx, target.file)[target.frontmatterKey];
  const frontmatterChanged = !frontmatterValuesEqual(before, value);

  if (frontmatterChanged) {
    await ctx.app.fileManager.processFrontMatter(target.file, (fm) => {
      fm[target.frontmatterKey] = value;
    });
  }
  if (!movePlan) return { changed: frontmatterChanged };

  const moved = await moveNoteBetweenRoots(ctx, target.file, movePlan.fromRoot, movePlan.toRoot);
  return {
    changed: true,
    file: moved.file,
    moved: true,
    fromPath: moved.fromPath,
    toPath: moved.toPath
  };
}

async function updateTextSurface(
  ctx: SurfaceContext,
  target: Extract<WritableSurfaceTarget, { kind: "text" }>,
  operation: UpdateOperation,
  options: UpdatePayloadOptions
): Promise<TextUpdateResult> {
  if (operation === "delete") throw new Error("op=delete only supports structured item keys");
  const before = await ctx.app.vault.read(target.file);
  const current = before.slice(target.range.start, target.range.end);
  const update = applyTextOperation(current, operation, options);
  if (!update.changed) return update;

  const after = spliceTextRange(before, target.range, update.value);
  if (before !== after) await ctx.app.vault.modify(target.file, after);
  return {
    changed: before !== after,
    matches: update.matches
  };
}

async function updateTaskCollectionSurface(
  ctx: SurfaceContext,
  target: Extract<WritableSurfaceTarget, { kind: "taskCollection" }>,
  operation: UpdateOperation,
  options: UpdatePayloadOptions
): Promise<TextUpdateResult> {
  if (operation !== "insert") throw new Error("task collection root only supports op=insert");

  if (options.valueSource === "value") throw new Error("task insert requires value_json object");
  await insertRootTask(ctx, target.file, requireUpdateValue(options));
  return { changed: true };
}

async function updateTaskItemSurface(
  ctx: SurfaceContext,
  target: Extract<WritableSurfaceTarget, { kind: "taskItem" }>,
  operation: UpdateOperation,
  options: UpdatePayloadOptions
): Promise<TextUpdateResult> {
  if (!target.field) {
    if (operation !== "delete") throw new Error("task item keys only support op=delete; use tasks/<id>/<field> for op=set");
    return { changed: await deleteRootTask(ctx, target.file, target.taskId) };
  }

  if (operation !== "set") throw new Error("task fields only support op=set");
  if (options.valueSource === "value_json") throw new Error("task field updates require value");
  return {
    changed: await setRootTaskField(ctx, target.file, target.taskId, target.field, requireUpdateValue(options))
  };
}

async function updateReferenceCollectionSurface(
  ctx: SurfaceContext,
  target: Extract<WritableSurfaceTarget, { kind: "referenceCollection" }>,
  operation: UpdateOperation,
  options: UpdatePayloadOptions
): Promise<TextUpdateResult> {
  if (operation !== "insert") throw new Error("references collection root only supports op=insert");
  if (options.valueSource !== "value_json") throw new Error("reference insert requires value_json object");
  const write = normalizeReferenceInsertValue(requireUpdateValue(options));
  const result = await insertReferenceItem(ctx, target.file, write);
  return {
    changed: result.changed,
    index: result.index,
    link: result.link,
    added: result.added
  };
}

async function updateReferenceItemSurface(
  ctx: SurfaceContext,
  target: Extract<WritableSurfaceTarget, { kind: "referenceItem" }>,
  operation: UpdateOperation,
  options: UpdatePayloadOptions
): Promise<TextUpdateResult> {
  if (!target.field) {
    if (operation !== "delete") throw new Error("reference item keys only support op=delete; use references/<i>/<field> for op=set");
    const result = await deleteReferenceItem(ctx, target.file, target.index);
    return {
      changed: result.changed,
      index: result.index,
      link: result.link
    };
  }

  if (operation !== "set") throw new Error("reference fields only support op=set");
  const value = readReferenceFieldUpdateValue(target.field, options);
  const result = await setReferenceItemField(ctx, target.file, target.index, target.field, value);
  return {
    changed: result.changed,
    index: result.index,
    link: result.link
  };
}

function applyTextOperation(
  current: string,
  operation: UpdateOperation,
  options: UpdatePayloadOptions
): TextUpdateResult & { value: string } {
  switch (operation) {
    case "set": {
      const value = requireUpdateText(options, { allowEmpty: true });
      return {
        changed: current !== value,
        value
      };
    }
    case "insert":
      throw new Error("op=insert only supports task collection keys");
    case "append": {
      const value = requireUpdateText(options, { allowEmpty: false });
      const next = current.trim() ? `${current}${current.endsWith("\n") ? "" : "\n"}${value}` : value;
      return {
        changed: current !== next,
        value: next
      };
    }
    case "prepend": {
      const value = requireUpdateText(options, { allowEmpty: false });
      const next = current.trim() ? `${value}${value.endsWith("\n") ? "" : "\n"}${current}` : value;
      return {
        changed: current !== next,
        value: next
      };
    }
    case "replace": {
      const match = requireReplaceMatch(options);
      const replacement = requireReplacementText(options);
      const matches = literalOccurrences(current, match);
      if (matches === 0) throw new Error("replace text was not found");
      if (matches > 1 && !options.all) {
        throw new Error(`replace text matched ${matches} times; pass all=true to replace all`);
      }
      const value = options.all
        ? current.split(match).join(replacement)
        : replaceFirstLiteral(current, match, replacement);
      return {
        changed: current !== value,
        matches,
        value
      };
    }
    case "delete":
      throw new Error("op=delete only supports structured item keys");
  }
}

function writableSectionRange(content: string, section: ReadSectionSpec, originalKey: string): TextRange {
  const range = findSectionContentRange(content, section);
  if (!range) throw new Error(`section not found for update key: ${originalKey}`);
  const editableStart = section.skipManagedPrelude
    ? skipProjectSummaryManagedBlock(content, range.start, range.end)
    : range.start;
  const editableEnd = trailingManagedBlockStart(content, editableStart, range.end) ?? range.end;
  return trimTextRange(content, editableStart, editableEnd);
}

function writableBodyRange(content: string): TextRange {
  const body = markdownBodyRange(content);
  const prelude = content.slice(body.start, body.end).match(/^\s*```para-zk-props\r?\n[\s\S]*?\r?\n```\s*/);
  const start = body.start + (prelude?.[0].length ?? 0);
  return trimTextRange(content, start, body.end);
}

function findSectionContentRange(content: string, section: ReadSectionSpec): TextRange | undefined {
  const body = markdownBodyRange(content);
  const markdown = content.slice(body.start, body.end);

  for (const label of sectionHeadingCandidates(section)) {
    const range = findSectionContentRangeByHeading(markdown, label, {
      includeSubsections: section.includeSubsections ?? false,
      offset: body.start
    });
    if (range) return range;
  }
  return undefined;
}

function requireUpdateKey(value: string | undefined): string {
  const key = value?.trim() ?? "";
  if (!key) throw new Error("key is required");
  return key;
}

function parseUpdateOperation(value: string | undefined): UpdateOperation {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "set" || normalized === "insert" || normalized === "append" || normalized === "prepend" || normalized === "replace" || normalized === "delete") {
    return normalized;
  }
  throw new Error("op must be one of: set|insert|append|prepend|replace|delete");
}

function requireUpdateValue(options: UpdatePayloadOptions): unknown {
  if (!hasOwn(options, "value")) throw new Error("value is required");
  return options.value;
}

function requireUpdateText(options: UpdatePayloadOptions, config: { allowEmpty: boolean }): string {
  if (options.valueSource === "value_json") throw new Error("section/body text updates require value");
  const value = requireUpdateValue(options);
  if (typeof value !== "string") throw new Error("section/body value must be a string");
  if (!config.allowEmpty && !value) throw new Error("value must not be empty");
  return value;
}

function requireReplaceMatch(options: UpdatePayloadOptions): string {
  const match = options.match;
  if (typeof match !== "string" || match.length === 0) throw new Error("match is required for op=replace");
  return match;
}

function requireReplacementText(options: UpdatePayloadOptions): string {
  if (!hasOwn(options, "replacement")) {
    throw new Error("with is required for op=replace");
  }
  const replacement = options.replacement;
  if (typeof replacement !== "string") throw new Error("with must be a string");
  return replacement;
}

function normalizeFrontmatterUpdateValue(type: string, key: string, value: unknown): unknown {
  if (type === "project" && key === "status") {
    return readOptionalCode(String(value), parseProjectStatusCode, "status", PROJECT_STATUS_CODE_HELP);
  }
  if (type === "project" && key === "priority") {
    return readOptionalCode(String(value), parsePriorityCode, "priority", PRIORITY_CODE_HELP);
  }
  if (type === "journal" && key === "energy") {
    return readOptionalCode(String(value), parseEnergyCode, "energy", ENERGY_CODE_HELP);
  }
  if (type === "doc" && key === "subnote_type") {
    return readOptionalCode(String(value), parseSubnoteTypeCode, "subnote_type", SUBNOTE_TYPE_CODE_HELP);
  }
  if (type === "zk_permanent" && key === "maturity") {
    return readOptionalCode(String(value), parseMaturityCode, "maturity", MATURITY_CODE_HELP);
  }
  if (type === "zk_fleeting" && key === "processed") {
    if (typeof value === "boolean") return value;
    const normalized = String(value).trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
    throw new Error("processed must be a boolean");
  }
  return value;
}

function projectStatusMovePlan(
  ctx: SurfaceContext,
  file: TFile,
  frontmatterKey: string,
  value: unknown
): { fromRoot: string; toRoot: string } | undefined {
  if (frontmatterKey !== "status" || readType(fileFrontmatter(ctx, file)) !== "project") return undefined;

  const archiveRoot = archivedCounterpartFolder(ctx, ctx.settings.paths.projectsFolder);
  const shouldBeArchived = value === "archived";
  const archived = isArchivedFile(ctx, file);
  if (shouldBeArchived && !archived) {
    return {
      fromRoot: ctx.settings.paths.projectsFolder,
      toRoot: archiveRoot
    };
  }
  if (!shouldBeArchived && archived) {
    return {
      fromRoot: archiveRoot,
      toRoot: ctx.settings.paths.projectsFolder
    };
  }
  return undefined;
}

function assertCanMoveNoteBetweenRoots(
  ctx: SurfaceContext,
  file: TFile,
  fromRoot: string,
  toRoot: string
): void {
  const normalizedFromRoot = normalizeVaultPath(fromRoot);
  const normalizedToRoot = normalizeVaultPath(toRoot);
  assertCanMoveTaskShardBetweenArchiveStates(ctx, file, normalizedFromRoot, normalizedToRoot);
  const folderStyleFolder = folderStyleContainer(file);
  if (folderStyleFolder) {
    const relativeFolder = relativePathUnderRoot(folderStyleFolder.path, normalizedFromRoot);
    assertVacantPath(ctx, joinVaultPath(normalizedToRoot, relativeFolder));
    return;
  }

  const relativeFile = relativePathUnderRoot(file.path, normalizedFromRoot);
  assertVacantPath(ctx, joinVaultPath(normalizedToRoot, relativeFile));
}

async function moveNoteBetweenRoots(
  ctx: SurfaceContext,
  file: TFile,
  fromRoot: string,
  toRoot: string
): Promise<{ file: TFile; fromPath: string; toPath: string }> {
  const normalizedFromRoot = normalizeVaultPath(fromRoot);
  const normalizedToRoot = normalizeVaultPath(toRoot);
  const fromPath = file.path;
  const rootId = rootIdFromFrontmatter(fileFrontmatter(ctx, file));
  const folderStyleFolder = folderStyleContainer(file);
  assertCanMoveNoteBetweenRoots(ctx, file, normalizedFromRoot, normalizedToRoot);

  if (folderStyleFolder) {
    const relativeFolder = relativePathUnderRoot(folderStyleFolder.path, normalizedFromRoot);
    const targetFolder = joinVaultPath(normalizedToRoot, relativeFolder);
    const toPath = joinVaultPath(targetFolder, file.name);
    await ensureFolder(ctx.app, parentFolder(targetFolder));
    await ctx.app.fileManager.renameFile(folderStyleFolder, targetFolder);
    const moved = ctx.app.vault.getFileByPath(toPath);
    if (!moved) throw new Error(`failed to move ${fromPath} to ${toPath}`);
    await moveTaskShardBetweenArchiveStates(ctx, rootId, normalizedFromRoot, normalizedToRoot);
    return { file: moved, fromPath, toPath };
  }

  const relativeFile = relativePathUnderRoot(file.path, normalizedFromRoot);
  const toPath = joinVaultPath(normalizedToRoot, relativeFile);
  await ensureFolder(ctx.app, parentFolder(toPath));
  await ctx.app.fileManager.renameFile(file, toPath);
  const moved = ctx.app.vault.getFileByPath(toPath);
  if (!moved) throw new Error(`failed to move ${fromPath} to ${toPath}`);
  await moveTaskShardBetweenArchiveStates(ctx, rootId, normalizedFromRoot, normalizedToRoot);
  return { file: moved, fromPath, toPath };
}

function assertCanMoveTaskShardBetweenArchiveStates(
  ctx: SurfaceContext,
  file: TFile,
  fromRoot: string,
  toRoot: string
): void {
  const rootId = rootIdFromFrontmatter(fileFrontmatter(ctx, file));
  if (!rootId) return;

  const fromArchived = isArchivedPath(ctx, fromRoot);
  const toArchived = isArchivedPath(ctx, toRoot);
  if (fromArchived === toArchived) return;

  const source = ctx.app.vault.getFileByPath(taskShardPath(ctx, rootId, fromArchived));
  if (!source) return;

  const targetPath = taskShardPath(ctx, rootId, toArchived);
  const existing = ctx.app.vault.getAbstractFileByPath(targetPath);
  if (existing && existing !== source) throw new Error(`target already exists: ${targetPath}`);
}

async function moveTaskShardBetweenArchiveStates(
  ctx: SurfaceContext,
  rootId: string | undefined,
  fromRoot: string,
  toRoot: string
): Promise<void> {
  if (!rootId) return;

  const fromArchived = isArchivedPath(ctx, fromRoot);
  const toArchived = isArchivedPath(ctx, toRoot);
  if (fromArchived === toArchived) return;

  const source = ctx.app.vault.getFileByPath(taskShardPath(ctx, rootId, fromArchived));
  if (!source) return;

  const targetPath = taskShardPath(ctx, rootId, toArchived);
  await ensureFolder(ctx.app, parentFolder(targetPath));
  await ctx.app.fileManager.renameFile(source, targetPath);
}

function frontmatterValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function literalOccurrences(text: string, needle: string): number {
  if (!needle) throw new Error("replace text must not be empty");
  let count = 0;
  let index = 0;
  while (true) {
    const found = text.indexOf(needle, index);
    if (found === -1) return count;
    count += 1;
    index = found + needle.length;
  }
}

function replaceFirstLiteral(text: string, needle: string, replacement: string): string {
  const index = text.indexOf(needle);
  if (index === -1) return text;
  return `${text.slice(0, index)}${replacement}${text.slice(index + needle.length)}`;
}

function childIndex(ctx: SurfaceContext, parent: TFile): Record<string, unknown> {
  const entries: Record<string, unknown> = {};
  for (const file of childFiles(ctx, parent)) {
    const frontmatter = fileFrontmatter(ctx, file);
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

function childFiles(ctx: SurfaceContext, parent: TFile): TFile[] {
  const directFolder = folderStyleChildFolder(parent);
  const parentLink = linkToFile(parent);
  const byPath = new Map<string, TFile>();

  for (const file of ctx.app.vault.getMarkdownFiles()) {
    if (file.path === parent.path) continue;
    const frontmatter = fileFrontmatter(ctx, file);
    if ((directFolder && file.parent?.path === directFolder) || frontmatter.parent === parentLink) {
      byPath.set(file.path, file);
    }
  }

  return Array.from(byPath.values()).sort((left, right) => left.path.localeCompare(right.path));
}

function folderStyleChildFolder(file: TFile): string | undefined {
  const parentPath = file.parent?.path ?? "";
  const parentName = folderName(parentPath);
  return parentPath && parentName === file.basename ? parentPath : undefined;
}

function findChild(ctx: SurfaceContext, parent: TFile, title: string): TFile | undefined {
  const matches = childFiles(ctx, parent).filter((file) => file.basename === title);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`child title is ambiguous: ${title}`);
  return undefined;
}

export function specForType(type: string): ReadSurfaceSpec {
  if (type === "project") return PROJECT_READ_SPEC;
  if (type === "area") return AREA_READ_SPEC;
  if (type === "resource") return RESOURCE_READ_SPEC;
  if (type === "journal") return JOURNAL_READ_SPEC;
  if (type === "retro") return RETRO_READ_SPEC;
  if (type === "doc") return DOC_READ_SPEC;
  if (type === "zk_fleeting") return ZK_FLEETING_READ_SPEC;
  if (type === "zk_literature") return ZK_LITERATURE_READ_SPEC;
  if (type === "zk_permanent") return ZK_PERMANENT_READ_SPEC;
  return NOTE_READ_SPEC;
}

function readSurfaceTopLevelKeys(spec: ReadSurfaceSpec): string[] {
  const keys = ["frontmatter"];
  for (const section of spec.sections ?? []) keys.push(section.key);
  if (spec.body) keys.push("body");
  if (spec.children) keys.push("children");
  return keys;
}

function readKeyHints(spec: ReadSurfaceSpec): string[] {
  const keys: string[] = [];
  if (spec.frontmatter.length > 0) keys.push("frontmatter", `frontmatter/{${spec.frontmatter.join("|")}}`);
  for (const section of spec.sections ?? []) {
    if (section.collection === "task") {
      keys.push("tasks", "tasks/<id>", "tasks/<id>/{checkbox|name|due|scheduled|start|created|done|cancelled|priority}");
    } else if (section.collection === "reference") {
      keys.push("references", "references/<i>", "references/<i>/{link|description}");
    } else if (section.collection === "backlink") {
      keys.push("backlinks", "backlinks/<i>", "backlinks/<i>/{link|path|title|type}");
    } else {
      keys.push(section.key);
    }
  }
  if (spec.body) keys.push("body");
  if (spec.children) keys.push("children", "children/<title>/<key>");
  return keys;
}

function compactReadKeys(spec: ReadSurfaceSpec): string[] {
  const keys: string[] = [];
  if (spec.frontmatter.length > 0) keys.push("frontmatter");
  for (const section of spec.sections ?? []) keys.push(section.key);
  if (spec.body) keys.push("body");
  if (spec.children) keys.push("children");
  return keys;
}

function compactWriteKeys(spec: ReadSurfaceSpec): string[] {
  const keys: string[] = [];
  if (spec.frontmatter.length > 0) keys.push("frontmatter");
  for (const section of spec.sections ?? []) {
    if (section.collection === "backlink") continue;
    keys.push(section.key);
  }
  if (spec.body) keys.push("body");
  if (spec.children) keys.push("children");
  return keys;
}

function collectionMap(spec: ReadSurfaceSpec): Record<string, ReadCollectionKind> {
  const collections: Record<string, ReadCollectionKind> = {};
  for (const section of spec.sections ?? []) {
    if (section.collection) collections[section.key] = section.collection;
  }
  return collections;
}

function writeKeyHints(spec: ReadSurfaceSpec): string[] {
  const keys: string[] = [];
  if (spec.frontmatter.length > 0) keys.push(`frontmatter/{${spec.frontmatter.join("|")}}=set`);
  for (const section of spec.sections ?? []) {
    if (section.collection === "task") {
      keys.push("tasks=insert", "tasks/<id>=delete", "tasks/<id>/<field>=set");
    } else if (section.collection === "reference") {
      keys.push("references=insert", "references/<i>=delete", "references/<i>/{link|description}=set");
    } else if (section.collection === "backlink") {
      continue;
    } else {
      keys.push(`${section.key}=set|append|prepend|replace`);
    }
  }
  if (spec.body) keys.push("body=set|append|prepend|replace");
  if (spec.children) keys.push("children/<title>/<key>");
  return keys;
}

function unknownReadKeyError(spec: ReadSurfaceSpec, key: string): Error {
  return new Error(`unknown read key: ${key} (valid: ${readKeyHints(spec).join(", ")})`);
}

function unknownUpdateKeyError(spec: ReadSurfaceSpec, key: string): Error {
  return new Error(`unknown update key: ${key} (writable: ${writeKeyHints(spec).join(", ")})`);
}

export function surfaceReadKeys(type: string): string[] {
  return readKeyHints(specForType(type));
}

export function surfaceWriteKeys(type: string): string[] {
  return writeKeyHints(specForType(type));
}

export function surfaceTypes(): string[] {
  return [...SURFACE_TYPES];
}

export function describeSurface(type: string): SurfaceDescription {
  const normalized = normalizeSurfaceType(type);
  return describeSurfaceSpec(normalized, specForSurfaceType(normalized));
}

export function describeSurfaces(): SurfaceDescription[] {
  return SURFACE_TYPES.map((type) => describeSurfaceSpec(type, specForSurfaceType(type)));
}

function normalizeSurfaceType(type: string): SurfaceType {
  const normalized = type.trim().toLocaleLowerCase();
  if (normalized === "fleeting") return "zk_fleeting";
  if (normalized === "literature") return "zk_literature";
  if (normalized === "permanent") return "zk_permanent";
  if ((SURFACE_TYPES as readonly string[]).includes(normalized)) return normalized as SurfaceType;
  throw new Error(`unknown surface type: ${type} (valid: ${SURFACE_TYPES.join(", ")})`);
}

function specForSurfaceType(type: SurfaceType): ReadSurfaceSpec {
  if (type === "note") return NOTE_READ_SPEC;
  return specForType(type);
}

function describeSurfaceSpec(type: SurfaceType, spec: ReadSurfaceSpec): SurfaceDescription {
  const frontmatterKeys = [...spec.frontmatter];
  return {
    type,
    readKeys: compactReadKeys(spec),
    writeKeys: compactWriteKeys(spec),
    ...(frontmatterKeys.length > 0 ? { frontmatterKeys } : {}),
    collections: collectionMap(spec)
  };
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

function readReferences(_content: string, context: SectionTransformContext): Record<string, ReferenceRead> {
  return Object.fromEntries(
    readReferenceItems(context.ctx, context.file).map((item, index) => [String(index), item])
  );
}

type BacklinkSourceVisitor = (sourceFile: TFile, index: number) => void;

export const backlinkReadInstrumentation = {
  enumerateSources: enumerateBacklinkSources
};

function countBacklinks(ctx: SurfaceContext, file: TFile): number {
  return backlinkReadInstrumentation.enumerateSources(ctx, file);
}

function readBacklinks(_content: string, context: SectionTransformContext): Record<string, BacklinkRead> {
  const items: Record<string, BacklinkRead> = {};
  backlinkReadInstrumentation.enumerateSources(context.ctx, context.file, (sourceFile, index) => {
    items[String(index)] = {
      link: wikiLink(sourceFile.path),
      path: sourceFile.path,
      title: sourceFile.basename,
      type: readType(fileFrontmatter(context.ctx, sourceFile))
    };
  });
  return items;
}

function enumerateBacklinkSources(
  ctx: SurfaceContext,
  targetFile: TFile,
  visitor?: BacklinkSourceVisitor
): number {
  const sourcePaths = Object.entries(ctx.app.metadataCache.resolvedLinks)
    .filter(([sourcePath, targets]) => sourcePath !== targetFile.path
      && isRecord(targets)
      && hasOwn(targets, targetFile.path))
    .map(([sourcePath]) => sourcePath)
    .sort((left, right) => left.localeCompare(right));

  let count = 0;
  for (const sourcePath of sourcePaths) {
    const sourceFile = ctx.app.vault.getFileByPath(sourcePath);
    if (!sourceFile || sourceFile.path === targetFile.path) continue;
    visitor?.(sourceFile, count);
    count += 1;
  }
  return count;
}

function parseReferenceIndex(value: string, originalKey: string): number {
  if (!/^\d+$/.test(value)) throw new Error(`reference index must be a non-negative integer for update key: ${originalKey}`);
  return Number(value);
}

function normalizeReferenceInsertValue(value: unknown): ReferenceWriteInput {
  if (!isRecord(value)) throw new Error("reference insert requires value_json object");
  for (const key of Object.keys(value)) {
    if (key !== "link" && key !== "description" && key !== "position") {
      throw new Error(`unknown reference field: ${key}`);
    }
  }
  return {
    link: value.link,
    ...(hasOwn(value, "description") ? { description: value.description } : {}),
    ...(hasOwn(value, "position") ? { position: value.position } : {})
  };
}

function readReferenceFieldUpdateValue(field: ReferenceWritableField, options: UpdatePayloadOptions): unknown {
  const value = requireUpdateValue(options);
  if (options.valueSource === "value_json") {
    if (value === null && field === "description") return null;
    if (typeof value === "string") return value;
    throw new Error(`reference ${field} update requires ${field === "link" ? "a string" : "a string or null"}`);
  }
  if (typeof value !== "string") throw new Error(`reference ${field} update requires value`);
  if (field === "link" && !value.trim()) throw new Error("reference link is required");
  return value;
}

async function readTasks(_content: string, context: SectionTransformContext): Promise<Record<string, TaskRead>> {
  return readRootTaskMap(context.ctx, context.file);
}

function readWikiLinkLabel(value: string): string | undefined {
  const match = parseWikiLink(value);
  if (!match) return undefined;
  const target = splitObsidianSubpath(match.target).base || match.target;
  return (match.alias?.trim() || pathBasenameWithoutExtension(target)).trim();
}

function sectionLabels(labelKey: string): string[] {
  return uniqueStrings([
    localePack("en").labels[labelKey],
    localePack("ko").labels[labelKey]
  ]);
}

function sectionHeadingCandidates(section: ReadSectionSpec): string[] {
  return uniqueStrings([
    ...(section.labelKey ? sectionLabels(section.labelKey) : []),
    ...(section.labels ?? [])
  ]);
}

function linkToFile(file: TFile): string {
  return wikiLink(file.path, file.basename);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
