import { TFile } from "obsidian";
import { hasOwn, isRecord } from "../records";
import {
  findSectionContentRangeByHeading,
  markdownBodyRange,
  skipProjectSummaryManagedBlock,
  spliceTextRange,
  trimTextRange,
  trailingManagedBlockStart,
  type TextRange
} from "../vault/sections";
import { ensureFolder, parentFolder } from "../vault/files";
import { fileFrontmatter, readFileTypeFresh, readType } from "../vault/frontmatter";
import { joinVaultPath, normalizeVaultPath } from "../vault/paths";
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
import { readOptionalCode } from "./code-options";
import type {
  ReferenceWritableField,
  ReferenceWriteInput,
  TaskWritableField,
  UpdateAreaOptions,
  UpdateJournalOptions,
  UpdateOperation,
  UpdatePayloadOptions,
  UpdateProjectOptions,
  UpdateResourceOptions,
  UpdateRetroOptions,
  UpdateSurfaceResult,
  UpdateZkOptions,
  WorkflowContext
} from "./context";
import {
  AREA_READ_SPEC,
  JOURNAL_READ_SPEC,
  PROJECT_READ_SPEC,
  RESOURCE_READ_SPEC,
  RETRO_READ_SPEC,
  keyParts,
  sectionHeadingCandidates,
  specForType,
  type ReadSectionSpec,
  type ReadSurfaceSpec,
  unknownUpdateKeyError
} from "./describe";
import {
  archivedCounterpartFolder,
  assertVacantPath,
  findChild,
  folderStyleContainer,
  isArchivedFile,
  isArchivedPath,
  relativePathUnderRoot,
  resolveRequiredArea,
  resolveRequiredJournal,
  resolveRequiredProject,
  resolveRequiredResource,
  resolveRequiredRetro,
  resolveRequiredZk
} from "./locations";
import {
  deleteReferenceItem,
  insertReferenceItem,
  readReferenceWritableField,
  setReferenceItemField
} from "./references";
import {
  assertRootTaskExists,
  deleteRootTask,
  insertRootTask,
  readTaskWritableField,
  rootIdFromFrontmatter,
  setRootTaskField,
  taskShardPath
} from "./tasks";

export async function updateProject(ctx: WorkflowContext, options: UpdateProjectOptions): Promise<UpdateSurfaceResult> {
  return updateSurface(ctx, await resolveRequiredProject(ctx, options), PROJECT_READ_SPEC, options);
}

export async function updateArea(ctx: WorkflowContext, options: UpdateAreaOptions): Promise<UpdateSurfaceResult> {
  return updateSurface(ctx, await resolveRequiredArea(ctx, options), AREA_READ_SPEC, options);
}

export async function updateResource(ctx: WorkflowContext, options: UpdateResourceOptions): Promise<UpdateSurfaceResult> {
  return updateSurface(ctx, await resolveRequiredResource(ctx, options), RESOURCE_READ_SPEC, options);
}

export async function updateZk(ctx: WorkflowContext, options: UpdateZkOptions): Promise<UpdateSurfaceResult> {
  const file = await resolveRequiredZk(ctx, options);
  const type = await readFileTypeFresh(ctx, file);
  return updateSurface(ctx, file, specForType(type), options);
}

export async function updateJournal(ctx: WorkflowContext, options: UpdateJournalOptions): Promise<UpdateSurfaceResult> {
  return updateSurface(ctx, await resolveRequiredJournal(ctx, options), JOURNAL_READ_SPEC, options);
}

export async function updateRetro(ctx: WorkflowContext, options: UpdateRetroOptions): Promise<UpdateSurfaceResult> {
  return updateSurface(ctx, await resolveRequiredRetro(ctx, options), RETRO_READ_SPEC, options);
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
  ctx: WorkflowContext,
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
  ctx: WorkflowContext,
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
  ctx: WorkflowContext,
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
  ctx: WorkflowContext,
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
  ctx: WorkflowContext,
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
  ctx: WorkflowContext,
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
  ctx: WorkflowContext,
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
  ctx: WorkflowContext,
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
  ctx: WorkflowContext,
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
  ctx: WorkflowContext,
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
  ctx: WorkflowContext,
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
  ctx: WorkflowContext,
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
  ctx: WorkflowContext,
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
  ctx: WorkflowContext,
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
