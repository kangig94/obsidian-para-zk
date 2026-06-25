import type { TFile } from "obsidian";
import { PARA_ZK_PATHS } from "../layout";
import { hasOwn, isRecord } from "../records";
import {
  findSectionContentRangeByHeading,
  isMarkdownScaffold,
  lineTextRangeAt,
  readLineSpan,
  removeTextRanges,
  spliceTextRange,
  trimTextRange,
  type TextRange
} from "../vault/sections";
import { ensureFolder, isInFolder } from "../vault/files";
import { readFileFrontmatterFresh, readFileTypeFresh, type Frontmatter } from "../vault/frontmatter";
import { joinVaultPath, normalizeVaultPath, parentFolder, sanitizeFileName } from "../vault/paths";
import { serializeFileWrite } from "../vault/write-serializer";
import type { RootTaskItem, TaskRead, TaskWritableField, WorkflowContext } from "./context";

export const ROOT_ID_FRONTMATTER_KEY = "id";


type TaskLineRead = {
  id: string;
  task: TaskRead;
};

type TaskWrite = {
  task: TaskRead;
  position: number | "end";
};

type TaskMetadata = Pick<TaskRead, "due" | "scheduled" | "start" | "created" | "done" | "cancelled" | "priority">;
type TaskDateMetadataField = Exclude<keyof TaskMetadata, "priority">;

type EditableTaskLine = {
  id: string;
  range: TextRange & { endWithoutBreak: number };
  prefix: string;
  checkboxSuffix: string;
  task: TaskRead;
  taskId?: string;
  blockId?: string;
};

const TASK_DATE_FIELDS: Array<{ key: TaskDateMetadataField; re: RegExp }> = [
  { key: "due", re: /\u{1F4C5}\s*(\d{4}-\d{2}-\d{2})/gu },
  { key: "scheduled", re: /\u{23F3}\s*(\d{4}-\d{2}-\d{2})/gu },
  { key: "start", re: /\u{1F6EB}\s*(\d{4}-\d{2}-\d{2})/gu },
  { key: "created", re: /\u{2795}\s*(\d{4}-\d{2}-\d{2})/gu },
  { key: "done", re: /\u{2705}\s*(\d{4}-\d{2}-\d{2})/gu },
  { key: "cancelled", re: /\u{274C}\s*(\d{4}-\d{2}-\d{2})/gu }
];

const TASK_PRIORITY_FIELDS: Array<{ value: string; re: RegExp }> = [
  { value: "highest", re: /\u{1F53A}/gu },
  { value: "high", re: /\u{23EB}/gu },
  { value: "medium", re: /\u{1F53C}/gu },
  { value: "low", re: /\u{1F53D}/gu },
  { value: "lowest", re: /\u{23EC}/gu }
];

const TASK_ID_SYMBOL = "\u{1F194}";
const TASK_ID_REGEX = /\u{1F194}\s*([a-zA-Z0-9-_]+)/u;
const TASK_ID_GLOBAL_REGEX = /\u{1F194}\s*([a-zA-Z0-9-_]+)/gu;
const TASK_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const TASK_ID_LENGTH = 8;
const TASK_SHARD_SCAFFOLD = "# Tasks\n";
const TASK_DATE_FIELD_SYMBOLS: Record<TaskDateMetadataField, string> = {
  due: "\u{1F4C5}",
  scheduled: "\u{23F3}",
  start: "\u{1F6EB}",
  created: "\u{2795}",
  done: "\u{2705}",
  cancelled: "\u{274C}"
};
const TASK_PRIORITY_FIELD_SYMBOLS: Record<string, string> = {
  highest: "\u{1F53A}",
  high: "\u{23EB}",
  medium: "\u{1F53C}",
  low: "\u{1F53D}",
  lowest: "\u{23EC}"
};

async function ensureTaskShardAtPath(ctx: WorkflowContext, path: string): Promise<TFile> {
  await ensureFolder(ctx.host, parentFolder(path));

  let shardFile = ctx.host.getFile(path);
  if (!shardFile) {
    shardFile = await ctx.host.create(path, TASK_SHARD_SCAFFOLD);
  }
  return shardFile;
}

export async function readTaskShardFile(ctx: WorkflowContext, rootFile: TFile): Promise<TFile | undefined> {
  return taskShardFile(ctx, rootFile);
}

export function taskShardPath(ctx: WorkflowContext, rootId: string, archived: boolean): string {
  return joinVaultPath(taskShardFolder(ctx, archived), `${sanitizeFileName(rootId)}.md`);
}

export function rootIdFromFrontmatter(frontmatter: Frontmatter): string | undefined {
  const value = frontmatter[ROOT_ID_FRONTMATTER_KEY];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function newRootId(): string {
  return newId();
}

export async function assertRootTaskExists(ctx: WorkflowContext, rootFile: TFile, taskId: string): Promise<void> {
  const shardFile = await readTaskShardFile(ctx, rootFile);
  if (!shardFile) throw new Error(`task not found: ${taskId}`);
  const content = await ctx.host.read(shardFile);
  const range = taskShardTaskRange(content);
  const line = range ? findEditableTaskLine(shardFile.path, content, range, taskId) : undefined;
  if (!line) throw new Error(`task not found: ${taskId}`);
}

export async function readRootTaskMap(ctx: WorkflowContext, rootFile: TFile): Promise<Record<string, TaskRead>> {
  const items: Record<string, TaskRead> = {};
  const shardFile = await readTaskShardFile(ctx, rootFile);
  if (!shardFile) return items;

  const content = await ctx.host.read(shardFile);
  const range = taskShardTaskRange(content);
  if (!range) return items;

  let cursor = range.start;
  while (cursor < range.end) {
    const span = readLineSpan(content, cursor, range.end);
    if (!span) break;

    const task = readTaskLine(span.text);
    if (task) {
      const id = uniqueReadId(task.id, items);
      items[id] = task.task;
    }

    cursor = span.next;
  }

  return items;
}

export async function readAllTaskItems(ctx: WorkflowContext): Promise<RootTaskItem[]> {
  const rootFiles = await rootFilesById(ctx);
  const results: RootTaskItem[] = [];
  for (const file of ctx.host.getMarkdownFiles()) {
    if (!isInFolder(file, taskCurrentFolder(ctx))) continue;
    const rootFile = rootFiles.get(file.basename);
    if (!rootFile) continue;
    const content = await ctx.host.read(file);
    const range = taskShardTaskRange(content);
    if (!range) continue;
    const rootType = await readFileTypeFresh(ctx, rootFile);
    let cursor = range.start;
    const seen: Record<string, true> = {};
    while (cursor < range.end) {
      const span = readLineSpan(content, cursor, range.end);
      if (!span) break;
      const task = readTaskLine(span.text);
      if (task) {
        const id = uniqueReadId(task.id, seen);
        seen[id] = true;
        results.push({
          rootPath: rootFile.path,
          rootTitle: rootFile.basename,
          rootType,
          id,
          task: task.task
        });
      }
      cursor = span.next;
    }
  }
  return results;
}

export async function insertRootTask(ctx: WorkflowContext, rootFile: TFile, value: unknown): Promise<string> {
  const write = normalizeTaskWriteValue(value);
  const rootId = await ensureRootId(ctx, rootFile);
  const shardPath = taskShardPath(ctx, rootId, isArchivedFile(ctx, rootFile));
  return serializeFileWrite(shardPath, async () => {
    const taskId = await newTaskId(ctx);
    const line = serializeNewTaskLine(write.task, taskId);
    const shardFile = await ensureTaskShardAtPath(ctx, shardPath);
    const base = await ctx.host.read(shardFile);
    const normalized = ensureTaskShardTaskSection(base);
    const current = normalized.content.slice(normalized.range.start, normalized.range.end);
    const next = insertTaskLine(current, line, write.position);
    if (current !== next || base !== normalized.content) {
      await ctx.host.modify(shardFile, spliceTextRange(normalized.content, normalized.range, next));
    }
    return taskId;
  });
}

export async function setRootTaskField(
  ctx: WorkflowContext,
  rootFile: TFile,
  taskId: string,
  field: TaskWritableField,
  value: unknown
): Promise<boolean> {
  const shardPath = await existingTaskShardPath(ctx, rootFile);
  if (!shardPath) throw new Error(`task not found: ${taskId}`);
  return serializeFileWrite(shardPath, async () => {
    const shardFile = ctx.host.getFile(shardPath);
    if (!shardFile) throw new Error(`task not found: ${taskId}`);
    const before = await ctx.host.read(shardFile);
    const range = taskShardTaskRange(before);
    const line = range ? findEditableTaskLine(shardFile.path, before, range, taskId) : undefined;
    if (!line) throw new Error(`task not found: ${taskId}`);
    const nextValue = normalizeTaskFieldUpdateValue(field, value);
    const nextTask = applyTaskFieldUpdate(line.task, field, nextValue);
    const nextLine = serializeEditableTaskLine(line, nextTask);
    const currentLine = before.slice(line.range.start, line.range.endWithoutBreak);
    if (currentLine === nextLine) return false;
    await ctx.host.modify(shardFile, spliceTextRange(before, line.range, nextLine));
    return true;
  });
}

export async function reorderRootTasks(ctx: WorkflowContext, rootFile: TFile, taskIds: string[]): Promise<boolean> {
  const shardPath = await existingTaskShardPath(ctx, rootFile);
  if (!shardPath) throw new Error("task list not found");
  return serializeFileWrite(shardPath, async () => {
    const shardFile = ctx.host.getFile(shardPath);
    if (!shardFile) throw new Error("task list not found");
    const before = await ctx.host.read(shardFile);
    const range = taskShardTaskRange(before);
    if (!range) throw new Error("task list not found");

    const lines = readEditableTaskLines(shardFile.path, before, range);
    validateTaskReorderIds(lines, taskIds);

    const byId = new Map(lines.map((line) => [line.id, line]));
    const section = before.slice(range.start, range.end);
    const nonTaskContent = removeTextRanges(
      section,
      lines.map((line) => ({
        start: line.range.start - range.start,
        end: line.range.end - range.start
      }))
    );
    if (nonTaskContent.trim()) throw new Error("task reorder only supports managed task lines");

    const nextSection = taskIds
      .map((id) => {
        const line = byId.get(id);
        if (!line) throw new Error(`task not found: ${id}`);
        return before.slice(line.range.start, line.range.endWithoutBreak);
      })
      .join("\n");
    if (section === nextSection) return false;

    await ctx.host.modify(shardFile, spliceTextRange(before, range, nextSection));
    return true;
  });
}

export async function deleteRootTask(ctx: WorkflowContext, rootFile: TFile, taskId: string): Promise<boolean> {
  const shardPath = await existingTaskShardPath(ctx, rootFile);
  if (!shardPath) throw new Error(`task not found: ${taskId}`);
  return serializeFileWrite(shardPath, async () => {
    const shardFile = ctx.host.getFile(shardPath);
    if (!shardFile) throw new Error(`task not found: ${taskId}`);
    const before = await ctx.host.read(shardFile);
    const range = taskShardTaskRange(before);
    const line = range ? findEditableTaskLine(shardFile.path, before, range, taskId) : undefined;
    if (!line) throw new Error(`task not found: ${taskId}`);
    const after = removeTextRanges(before, [line.range]);
    if (before === after) return false;
    if (isBareTaskShard(after)) {
      await ctx.host.trashFile(shardFile);
      return true;
    }
    await ctx.host.modify(shardFile, after);
    return true;
  });
}

export function cycleTaskCheckbox(checkbox: string): string {
  const cycle = [" ", "/", "x", "-"];
  const index = cycle.indexOf(checkbox.toLowerCase());
  return cycle[index === -1 || index === cycle.length - 1 ? 0 : index + 1];
}

export function readTaskWritableField(value: string, originalKey: string): TaskWritableField {
  if (TASK_WRITABLE_FIELDS.includes(value as TaskWritableField)) return value as TaskWritableField;
  throw new Error(`unknown task field for update key: ${originalKey}`);
}

async function ensureRootId(ctx: WorkflowContext, file: TFile): Promise<string> {
  const existing = rootIdFromFrontmatter(await readFileFrontmatterFresh(ctx, file));
  if (existing) return existing;

  const id = newRootId();
  let resolved = id;
  await ctx.host.processFrontMatter(file, (fm) => {
    const current = rootIdFromFrontmatter(fm);
    if (current) {
      resolved = current;
    } else {
      fm[ROOT_ID_FRONTMATTER_KEY] = id;
      resolved = id;
    }
  });
  return resolved;
}

async function taskShardFile(ctx: WorkflowContext, rootFile: TFile): Promise<TFile | undefined> {
  const path = await existingTaskShardPath(ctx, rootFile);
  return path ? ctx.host.getFile(path) ?? undefined : undefined;
}

async function existingTaskShardPath(ctx: WorkflowContext, rootFile: TFile): Promise<string | undefined> {
  const rootId = rootIdFromFrontmatter(await readFileFrontmatterFresh(ctx, rootFile));
  return rootId ? taskShardPath(ctx, rootId, isArchivedFile(ctx, rootFile)) : undefined;
}

function taskShardFolder(ctx: WorkflowContext, archived: boolean): string {
  return archived ? taskArchivesFolder(ctx) : taskCurrentFolder(ctx);
}

function taskCurrentFolder(ctx: WorkflowContext): string {
  return joinVaultPath(PARA_ZK_PATHS.tasksFolder, "current");
}

function taskArchivesFolder(ctx: WorkflowContext): string {
  return joinVaultPath(PARA_ZK_PATHS.tasksFolder, "archives");
}

function taskRegistryFolder(ctx: WorkflowContext): string {
  return normalizeVaultPath(PARA_ZK_PATHS.tasksFolder);
}

function taskShardTaskRange(content: string): TextRange | undefined {
  const range = findSectionContentRangeByHeading(content, "Tasks", {
    offset: 0
  });
  return range ? trimTextRange(content, range.start, range.end) : undefined;
}

function ensureTaskShardTaskSection(content: string): { content: string; range: TextRange } {
  const existing = taskShardTaskRange(content);
  if (existing) return { content, range: existing };

  const next = `${content.replace(/\s*$/, "")}\n\n${TASK_SHARD_SCAFFOLD}`;
  return {
    content: next,
    range: {
      start: next.length,
      end: next.length
    }
  };
}

function isBareTaskShard(content: string): boolean {
  const text = content.trim();
  return text === "" || text === TASK_SHARD_SCAFFOLD.trim();
}

function insertTaskLine(content: string, line: string, position: number | "end"): string {
  const current = isMarkdownScaffold(content) ? "" : content;
  if (!current.trim()) return line;
  if (position === "end") return `${current}${current.endsWith("\n") ? "" : "\n"}${line}`;

  const taskLines = editableTaskLineSpans(current);
  if (position > taskLines.length) return `${current}${current.endsWith("\n") ? "" : "\n"}${line}`;
  const target = taskLines[position - 1];
  return spliceTextRange(current, { start: target.start, end: target.start }, `${line}\n`);
}

function editableTaskLineSpans(content: string): Array<TextRange & { endWithoutBreak: number }> {
  const spans: Array<TextRange & { endWithoutBreak: number }> = [];
  let cursor = 0;
  while (cursor < content.length) {
    const span = lineTextRangeAt(content, cursor, content.length);
    if (!span) break;
    const text = content.slice(span.start, span.endWithoutBreak);
    if (/^\s*(?:[-*+]|\d+[.)])\s+\[[^\]\r\n]?\]\s*/.test(text)) spans.push(span);
    cursor = span.end;
  }
  return spans;
}

async function newTaskId(ctx: WorkflowContext): Promise<string> {
  const existing = await existingTaskIds(ctx);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = randomAlphabetId(TASK_ID_LENGTH, TASK_ID_ALPHABET);
    if (!existing.has(id)) return id;
  }
  throw new Error("failed to generate a unique task id");
}

function newId(): string {
  const crypto = typeof window === "undefined" ? undefined : window.crypto;
  if (crypto && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return fallbackUuid();
}

function fallbackUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

async function existingTaskIds(ctx: WorkflowContext): Promise<Set<string>> {
  const ids = new Set<string>();
  const tasksFolder = taskRegistryFolder(ctx);
  for (const file of ctx.host.getMarkdownFiles()) {
    if (tasksFolder && !isInFolder(file, tasksFolder)) continue;
    const content = await ctx.host.cachedRead(file);
    collectTaskIds(content, ids);
  }
  return ids;
}

function collectTaskIds(content: string, ids: Set<string>): void {
  for (const match of content.matchAll(TASK_ID_GLOBAL_REGEX)) {
    const id = match[1]?.trim();
    if (id) ids.add(id);
  }
}

function randomAlphabetId(length: number, alphabet: string): string {
  const chars: string[] = [];
  const limit = 256 - (256 % alphabet.length);
  while (chars.length < length) {
    for (const byte of randomBytes(length - chars.length)) {
      if (byte >= limit) continue;
      chars.push(alphabet[byte % alphabet.length] ?? alphabet[0]);
      if (chars.length === length) break;
    }
  }
  return chars.join("");
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  const crypto = typeof window === "undefined" ? undefined : window.crypto;
  if (crypto && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
    return bytes;
  }
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

async function rootFilesById(ctx: WorkflowContext): Promise<Map<string, TFile>> {
  const roots = new Map<string, TFile>();
  for (const file of ctx.host.getMarkdownFiles()) {
    if (isInFolder(file, taskRegistryFolder(ctx)) || isArchivedFile(ctx, file)) continue;
    const rootId = rootIdFromFrontmatter(await readFileFrontmatterFresh(ctx, file));
    if (rootId && !roots.has(rootId)) roots.set(rootId, file);
  }
  return roots;
}

function readTaskLine(text: string): TaskLineRead | undefined {
  const match = text.match(/^\s*(?:[-*+]|\d+[.)])\s+\[([^\]\r\n]?)\]\s*(.*)$/);
  if (!match) return undefined;

  const checkbox = match[1] ?? " ";
  const parsed = parseTaskBody(match[2] ?? "");
  if (!parsed.name || !parsed.taskId) return undefined;

  return {
    id: parsed.taskId,
    task: {
      checkbox,
      name: parsed.name,
      ...parsed.metadata
    }
  };
}

function findEditableTaskLine(path: string, content: string, range: TextRange, taskId: string): EditableTaskLine | undefined {
  const seen: Record<string, true> = {};
  let cursor = range.start;
  let line = lineNumberAt(content, range.start);
  while (cursor < range.end) {
    const span = lineTextRangeAt(content, cursor, range.end);
    if (!span) break;

    const text = content.slice(span.start, span.endWithoutBreak);
    const task = readEditableTaskLine(path, line, text, span);
    if (task) {
      const id = uniqueReadId(task.id, seen);
      seen[id] = true;
      if (id === taskId) return {
        ...task,
        id
      };
    }

    cursor = span.end;
    line += 1;
  }
  return undefined;
}

function readEditableTaskLines(path: string, content: string, range: TextRange): EditableTaskLine[] {
  const lines: EditableTaskLine[] = [];
  const seen: Record<string, true> = {};
  let cursor = range.start;
  let line = lineNumberAt(content, range.start);
  while (cursor < range.end) {
    const span = lineTextRangeAt(content, cursor, range.end);
    if (!span) break;

    const text = content.slice(span.start, span.endWithoutBreak);
    const task = readEditableTaskLine(path, line, text, span);
    if (task) {
      const id = uniqueReadId(task.id, seen);
      seen[id] = true;
      lines.push({
        ...task,
        id
      });
    }

    cursor = span.end;
    line += 1;
  }
  return lines;
}

function validateTaskReorderIds(lines: EditableTaskLine[], taskIds: string[]): void {
  if (lines.length !== taskIds.length) {
    throw new Error("task reorder requires the full current task id order");
  }
  const ids = new Set<string>();
  for (const id of taskIds) {
    if (ids.has(id)) throw new Error(`duplicate task id in reorder: ${id}`);
    ids.add(id);
  }
  for (const line of lines) {
    if (!ids.has(line.id)) throw new Error(`missing task id in reorder: ${line.id}`);
  }
}

function readEditableTaskLine(
  path: string,
  line: number,
  text: string,
  range: TextRange & { endWithoutBreak: number }
): EditableTaskLine | undefined {
  const match = text.match(/^(\s*(?:[-*+]|\d+[.)])\s+\[)([^\]\r\n]?)(\]\s*)(.*)$/);
  if (!match) return undefined;

  const parsed = parseTaskBody(match[4] ?? "");
  if (!parsed.name) return undefined;

  return {
    id: parsed.taskId ?? syntheticTaskReadId(path, line),
    range,
    prefix: match[1] ?? "- [",
    checkboxSuffix: match[3] ?? "] ",
    task: {
      checkbox: match[2] ?? " ",
      name: parsed.name,
      ...parsed.metadata
    },
    taskId: parsed.taskId,
    blockId: parsed.blockId
  };
}

const TASK_WRITABLE_FIELDS: TaskWritableField[] = [
  "checkbox",
  "name",
  "priority",
  "due",
  "scheduled",
  "start",
  "created",
  "done",
  "cancelled"
];

const TASK_METADATA_WRITE_FIELDS: Array<keyof TaskMetadata> = [
  "priority",
  "due",
  "scheduled",
  "start",
  "created",
  "done",
  "cancelled"
];

const TASK_PRIORITIES = new Set(["highest", "high", "medium", "low", "lowest"]);

function normalizeTaskWriteValue(value: unknown): TaskWrite {
  if (!isRecord(value)) throw new Error("task insert requires value_json object");
  assertKnownTaskWriteKeys(value);

  const name = normalizeTaskNameValue(value.name);
  const task: TaskRead = {
    checkbox: hasOwn(value, "checkbox") ? normalizeTaskCheckboxValue(value.checkbox) : " ",
    name
  };

  for (const field of TASK_METADATA_WRITE_FIELDS) {
    if (!hasOwn(value, field)) continue;
    const normalized = normalizeTaskMetadataWriteValue(field, value[field]);
    if (normalized !== undefined) task[field] = normalized;
  }
  return {
    task,
    position: normalizeTaskInsertPosition(value.position)
  };
}

function assertKnownTaskWriteKeys(value: Record<string, unknown>): void {
  for (const key of Object.keys(value)) {
    if (key !== "position" && !TASK_WRITABLE_FIELDS.includes(key as TaskWritableField)) {
      throw new Error(`unknown task field: ${key}`);
    }
  }
}

function normalizeTaskInsertPosition(value: unknown): number | "end" {
  if (value === undefined || value === null || value === "" || value === "end") return "end";
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error("task position must be a positive integer or end");
  }
  return value;
}

function normalizeTaskFieldUpdateValue(field: TaskWritableField, value: unknown): string | undefined {
  if (field === "checkbox") return normalizeTaskCheckboxValue(value);
  if (field === "name") return normalizeTaskNameValue(value);
  return normalizeTaskMetadataWriteValue(field, value);
}

function normalizeTaskCheckboxValue(value: unknown): string {
  if (typeof value !== "string") throw new Error("task checkbox must be a string");
  const checkbox = normalizeCheckboxFilter(value);
  if (checkbox === undefined) throw new Error("task checkbox is required");
  if (checkbox.length > 1 || checkbox === "]" || checkbox.includes("\n") || checkbox.includes("\r")) {
    throw new Error("task checkbox must be a single status character");
  }
  return checkbox;
}

function normalizeTaskNameValue(value: unknown): string {
  if (typeof value !== "string") throw new Error("task name must be a string");
  const name = value.trim();
  if (!name) throw new Error("task name is required");
  if (/[\r\n]/.test(name)) throw new Error("task name must be a single line");
  return name;
}

function normalizeTaskMetadataWriteValue(field: keyof TaskMetadata, value: unknown): string | undefined {
  if (typeof value !== "string") throw new Error(`task ${field} must be a string`);
  const normalized = normalizeTaskMetadataValue(field, value.trim());
  if (!normalized) return undefined;
  if (field !== "priority" && !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`task ${field} must be YYYY-MM-DD`);
  }
  if (field === "priority" && !TASK_PRIORITIES.has(normalized)) {
    throw new Error("task priority must be one of: highest|high|medium|low|lowest");
  }
  return normalized;
}

function applyTaskFieldUpdate(task: TaskRead, field: TaskWritableField, value: string | undefined): TaskRead {
  const next: TaskRead = { ...task };
  if (value === undefined) {
    if (field === "checkbox" || field === "name") throw new Error(`task ${field} is required`);
    delete next[field];
  } else {
    next[field] = value;
  }
  return next;
}

function serializeNewTaskLine(task: TaskRead, taskId: string): string {
  return `- [${task.checkbox}] ${serializeTaskBody(task, { taskId })}`;
}

function serializeEditableTaskLine(line: EditableTaskLine, task: TaskRead): string {
  return `${line.prefix}${task.checkbox}${line.checkboxSuffix}${serializeTaskBody(task, {
    taskId: line.taskId,
    blockId: line.blockId
  })}`;
}

function serializeTaskBody(task: TaskRead, options: { taskId?: string; blockId?: string } = {}): string {
  const name = normalizeTaskNameValue(task.name);
  const parts = [name];
  if (options.taskId) parts.push(`${TASK_ID_SYMBOL} ${options.taskId}`);
  for (const field of TASK_METADATA_WRITE_FIELDS) {
    const value = task[field];
    if (typeof value === "string" && value.trim()) {
      parts.push(serializeTaskMetadataField(field, value));
    }
  }
  if (options.blockId) parts.push(`^${options.blockId}`);
  return parts.join(" ");
}

function serializeTaskMetadataField(field: keyof TaskMetadata, value: string): string {
  const normalized = normalizeTaskMetadataWriteValue(field, value);
  if (!normalized) return "";
  if (field === "priority") return TASK_PRIORITY_FIELD_SYMBOLS[normalized];
  return `${TASK_DATE_FIELD_SYMBOLS[field]} ${normalized}`;
}

function parseTaskBody(value: string): { name: string; taskId?: string; blockId?: string; metadata: TaskMetadata } {
  let body = value.trim();
  const blockId = readTrailingBlockId(body);
  if (blockId) body = body.replace(/\s+\^[A-Za-z0-9_-]+\s*$/, "").trim();

  const metadata: TaskMetadata = {};
  const taskId = readTaskId(body);
  body = stripTaskIdField(body);
  body = stripEmojiTaskDates(body, metadata);
  body = stripEmojiTaskPriority(body, metadata);

  return {
    name: body.replace(/\s{2,}/g, " ").trim(),
    taskId,
    blockId,
    metadata
  };
}

function readTaskId(value: string): string | undefined {
  return value.match(TASK_ID_REGEX)?.[1];
}

function stripTaskIdField(value: string): string {
  return value.replace(TASK_ID_GLOBAL_REGEX, " ");
}

function readTrailingBlockId(value: string): string | undefined {
  return value.match(/\s+\^([A-Za-z0-9_-]+)\s*$/)?.[1];
}

function stripEmojiTaskDates(value: string, metadata: TaskMetadata): string {
  let result = value;
  for (const field of TASK_DATE_FIELDS) {
    result = result.replace(field.re, (_match, rawDate: string) => {
      if (metadata[field.key] === undefined) metadata[field.key] = rawDate;
      return " ";
    });
  }
  return result;
}

function stripEmojiTaskPriority(value: string, metadata: TaskMetadata): string {
  let result = value;
  for (const priority of TASK_PRIORITY_FIELDS) {
    result = result.replace(priority.re, () => {
      if (metadata.priority === undefined) metadata.priority = priority.value;
      return " ";
    });
  }
  return result;
}

function normalizeTaskMetadataValue(key: keyof TaskMetadata, value: string): string {
  return key === "priority" ? value.toLowerCase() : value;
}

function uniqueReadId(id: string, items: Record<string, unknown>): string {
  if (!hasOwn(items, id)) return id;
  let index = 2;
  while (hasOwn(items, `${id}-${index}`)) index += 1;
  return `${id}-${index}`;
}

function syntheticTaskReadId(path: string, line: number): string {
  return `task-${hashReadId(`${path}:${line}`)}`;
}

function hashReadId(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function lineNumberAt(content: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (content.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

function normalizeCheckboxFilter(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "space" || trimmed === "blank" || trimmed === "todo" || trimmed === "open") return " ";
  return trimmed;
}

function isArchivedFile(ctx: WorkflowContext, file: TFile): boolean {
  return isInFolder(file, PARA_ZK_PATHS.archivesFolder);
}
