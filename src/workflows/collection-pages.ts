import { isRecord } from "../infra/records";

export type CollectionKind = "task" | "reference" | "backlink";

export type CollectionReadOptions = {
  offset?: number;
  limit?: number | "all";
  query?: string;
  type?: string;
  checkbox?: string;
  priority?: string;
  dueBefore?: string;
  dueAfter?: string;
  refKind?: string;
};

type NormalizedCollectionReadOptions = {
  offset: number;
  limit: number | "all";
  query?: string;
  type?: string;
  checkbox?: string;
  priority?: string;
  dueBefore?: string;
  dueAfter?: string;
  refKind?: string;
};

const DEFAULT_COLLECTION_READ_LIMIT = 50;
const REFERENCE_KINDS = new Set<string>(["url", "note", "file", "wiki", "text"]);

export function hasCollectionReadOptions(options?: CollectionReadOptions): boolean {
  return !!options && Object.values(options).some((value) => value !== undefined);
}

export function readCollectionPage(
  value: unknown,
  kind: CollectionKind,
  rawOptions?: CollectionReadOptions
): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("collection read target is not a map");

  const options = normalizeCollectionReadOptions(rawOptions);
  const entries = Object.entries(value).filter(([, item]) => matchesCollectionItem(kind, item, options));
  const pageEntries = options.limit === "all"
    ? entries.slice(options.offset)
    : entries.slice(options.offset, options.offset + options.limit);
  return {
    count: entries.length,
    offset: options.offset,
    limit: options.limit,
    returned: pageEntries.length,
    has_more: options.offset + pageEntries.length < entries.length,
    items: Object.fromEntries(pageEntries)
  };
}

function normalizeCollectionReadOptions(rawOptions?: CollectionReadOptions): NormalizedCollectionReadOptions {
  const offset = rawOptions?.offset ?? 0;
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error("offset must be a non-negative integer");
  }

  const limit = rawOptions?.limit ?? DEFAULT_COLLECTION_READ_LIMIT;
  if (limit !== "all" && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error("limit must be a positive integer or all");
  }

  const refKind = trimOptional(rawOptions?.refKind);
  if (refKind && !REFERENCE_KINDS.has(refKind)) {
    throw new Error(`ref_kind must be one of ${Array.from(REFERENCE_KINDS).join(", ")}`);
  }

  return {
    offset,
    limit,
    query: trimOptional(rawOptions?.query),
    type: trimOptional(rawOptions?.type),
    checkbox: normalizeCheckboxFilter(rawOptions?.checkbox),
    priority: trimOptional(rawOptions?.priority),
    dueBefore: normalizeIsoDateFilter(rawOptions?.dueBefore, "due_before"),
    dueAfter: normalizeIsoDateFilter(rawOptions?.dueAfter, "due_after"),
    refKind
  };
}

function matchesCollectionItem(
  kind: CollectionKind,
  item: unknown,
  options: NormalizedCollectionReadOptions
): boolean {
  if (!isRecord(item)) return false;

  if (options.query && !collectionSearchText(kind, item).toLowerCase().includes(options.query.toLowerCase())) {
    return false;
  }

  if (kind === "task") return matchesTaskCollectionItem(item, options);
  if (kind === "reference") return matchesReferenceCollectionItem(item, options);
  return matchesBacklinkCollectionItem(item, options);
}

function matchesTaskCollectionItem(
  item: Record<string, unknown>,
  options: NormalizedCollectionReadOptions
): boolean {
  if (options.checkbox !== undefined && readRecordString(item, "checkbox") !== options.checkbox) return false;
  if (options.priority && readRecordString(item, "priority") !== options.priority) return false;
  if (options.dueBefore && !dateOnOrBefore(readRecordString(item, "due"), options.dueBefore)) return false;
  if (options.dueAfter && !dateOnOrAfter(readRecordString(item, "due"), options.dueAfter)) return false;
  return true;
}

function matchesReferenceCollectionItem(
  item: Record<string, unknown>,
  options: NormalizedCollectionReadOptions
): boolean {
  if (options.refKind && readRecordString(item, "kind") !== options.refKind) return false;
  return true;
}

function matchesBacklinkCollectionItem(
  item: Record<string, unknown>,
  options: NormalizedCollectionReadOptions
): boolean {
  if (options.type && readRecordString(item, "type") !== options.type) return false;
  return true;
}

function collectionSearchText(kind: CollectionKind, item: Record<string, unknown>): string {
  let keys = ["title", "path"];
  switch (kind) {
    case "task":
      keys = ["name", "checkbox", "priority", "due", "scheduled", "start", "created", "done", "cancelled"];
      break;
    case "reference":
      keys = ["link", "kind", "description", "target", "path"];
      break;
    case "backlink":
      break;
  }
  return keys.map((key) => readRecordString(item, key) ?? "").join("\n");
}

function normalizeCheckboxFilter(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "space" || trimmed === "blank" || trimmed === "todo" || trimmed === "open") return " ";
  return trimmed;
}

function normalizeIsoDateFilter(value: string | undefined, key: string): string | undefined {
  const trimmed = trimOptional(value);
  if (!trimmed) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) throw new Error(`${key} must be YYYY-MM-DD`);
  return trimmed;
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readRecordString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function dateOnOrBefore(value: string | undefined, limit: string): boolean {
  const date = readIsoDate(value);
  return !!date && date <= limit;
}

function dateOnOrAfter(value: string | undefined, limit: string): boolean {
  const date = readIsoDate(value);
  return !!date && date >= limit;
}

function readIsoDate(value: string | undefined): string | undefined {
  return value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
}
