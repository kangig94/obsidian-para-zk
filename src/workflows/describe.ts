import { TFile } from "obsidian";
import { localePack } from "../i18n";
import { stripProjectSummaryManagedBlock, type TextRange } from "../vault/sections";
import type { CollectionKind, ReferenceRead, SurfaceAddressing, SurfaceDescription, TaskRead, WorkflowContext } from "./context";
import { readBacklinks } from "./backlinks";
import { readReferenceItemsFresh } from "./references";
import { readRootTaskMap } from "./tasks";
import { uniqueStrings } from "../text";

type ReadCollectionKind = CollectionKind;

type SectionTransformContext = {
  ctx: WorkflowContext;
  file: TFile;
  content: string;
  range?: TextRange;
  section: ReadSectionSpec;
};

export type ReadSectionSpec = {
  key: string;
  labelKey?: string;
  labels?: string[];
  skipManagedPrelude?: boolean;
  collection?: ReadCollectionKind;
  transform?: (content: string, context: SectionTransformContext) => unknown;
};

export type ReadSurfaceSpec = {
  frontmatter: string[];
  readonlyFrontmatter?: string[];
  sections?: ReadSectionSpec[];
  body?: boolean;
  children?: boolean;
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
  "llm-wiki",
  "journal",
  "retro",
  "subnote",
  "spark",
  "digest",
  "permanent",
  "note"
] as const;

type SurfaceType = typeof SURFACE_TYPES[number];

export const PROJECT_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: ["aliases", "areas", "status", "priority", "start_date", "due_date", "done_date"],
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
  frontmatter: ["aliases", "url", "first_author", "license", "kind"],
  sections: [
    { key: "references", labelKey: "references", transform: readReferences, collection: "reference" },
    BACKLINK_READ_SECTION
  ],
  body: true
};

export const LLM_WIKI_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: ["aliases"],
  readonlyFrontmatter: ["created_by", "updated_by"],
  sections: [
    { key: "references", labelKey: "references", transform: readReferences, collection: "reference" },
    BACKLINK_READ_SECTION
  ],
  body: true
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

const SUBNOTE_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: ["subnote_type"],
  sections: [
    { key: "references", labelKey: "references", transform: readReferences, collection: "reference" },
    BACKLINK_READ_SECTION
  ],
  body: true
};

const ZK_SPARK_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: ["processed"],
  sections: [
    { key: "references", labelKey: "references", transform: readReferences, collection: "reference" },
    BACKLINK_READ_SECTION
  ],
  body: true
};

const ZK_DIGEST_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: ["sourceTitle", "url", "first_author", "published"],
  sections: [
    { key: "references", labelKey: "references", transform: readReferences, collection: "reference" },
    BACKLINK_READ_SECTION
  ],
  body: true
};

const ZK_PERMANENT_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: ["maturity", "aliases"],
  sections: [
    { key: "references", labelKey: "references", transform: readReferences, collection: "reference" },
    BACKLINK_READ_SECTION
  ],
  body: true
};

const NOTE_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: [],
  sections: [
    BACKLINK_READ_SECTION
  ],
  body: true
};

export function specForType(type: string): ReadSurfaceSpec {
  if (type === "project") return PROJECT_READ_SPEC;
  if (type === "area") return AREA_READ_SPEC;
  if (type === "resource") return RESOURCE_READ_SPEC;
  if (type === "llm-wiki") return LLM_WIKI_READ_SPEC;
  if (type === "journal") return JOURNAL_READ_SPEC;
  if (type === "retro") return RETRO_READ_SPEC;
  if (type === "subnote") return SUBNOTE_READ_SPEC;
  if (type === "spark") return ZK_SPARK_READ_SPEC;
  if (type === "digest") return ZK_DIGEST_READ_SPEC;
  if (type === "permanent") return ZK_PERMANENT_READ_SPEC;
  return NOTE_READ_SPEC;
}

export function readSurfaceTopLevelKeys(spec: ReadSurfaceSpec): string[] {
  const keys = ["frontmatter"];
  for (const section of spec.sections ?? []) keys.push(section.key);
  if (spec.body) keys.push("body");
  if (spec.children) keys.push("children");
  return keys;
}

function readKeyHints(spec: ReadSurfaceSpec): string[] {
  const keys: string[] = [];
  const frontmatterKeys = readableFrontmatterKeys(spec);
  if (frontmatterKeys.length > 0) keys.push("frontmatter", `frontmatter/{${frontmatterKeys.join("|")}}`);
  for (const section of spec.sections ?? []) {
    if (section.collection === "task") {
      keys.push("tasks", "tasks/<id>", "tasks/<id>/{checkbox|name|due|scheduled|start|created|done|cancelled|priority}");
    } else if (section.collection === "reference") {
      keys.push("references", "references/<i>", "references/<i>/{id|link|description|kind|path|target}");
    } else if (section.collection === "backlink") {
      keys.push("backlinks", "backlinks/<i>", "backlinks/<i>/{link|path|title|type}");
    } else {
      keys.push(section.key);
    }
  }
  if (spec.body) keys.push("body");
  if (spec.children) keys.push("children");
  return keys;
}

function compactReadKeys(spec: ReadSurfaceSpec): string[] {
  const keys: string[] = [];
  if (readableFrontmatterKeys(spec).length > 0) keys.push("frontmatter");
  for (const section of spec.sections ?? []) keys.push(section.key);
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

// Frontmatter keys whose value is a multi-value list supporting add/remove ops
// (set|append|prepend|delete), unlike scalar keys (set only). resolve: "area" means a value
// may be given as an area title and is stored as its canonical link. `aliases` is also a list
// but intentionally single-value, so it is not listed here and stays set-only.
export const LIST_FRONTMATTER_KEYS: Record<string, { resolve?: "area" }> = {
  areas: { resolve: "area" }
};

function writeKeyHints(spec: ReadSurfaceSpec): string[] {
  const keys: string[] = [];
  const scalarKeys = spec.frontmatter.filter((key) => !(key in LIST_FRONTMATTER_KEYS));
  if (scalarKeys.length > 0) keys.push(`frontmatter/{${scalarKeys.join("|")}}=set`);
  for (const key of spec.frontmatter) {
    if (key in LIST_FRONTMATTER_KEYS) keys.push(`frontmatter/${key}=set|append|prepend|delete`);
  }
  for (const section of spec.sections ?? []) {
    if (section.collection === "task") {
      keys.push("tasks=insert", "tasks/<id>=delete", "tasks/<id>/<field>=set");
    } else if (section.collection === "reference") {
      keys.push("references=insert|backfill", "references/<i>=delete", "references/<i>/{link|description}=set");
    } else if (section.collection === "backlink") {
      continue;
    } else {
      keys.push(`${section.key}=set|append|prepend|replace`);
    }
  }
  if (spec.body) keys.push("body=set|append|prepend|replace");
  return keys;
}

export function writeKeyOperations(spec: ReadSurfaceSpec, key: string): string[] | undefined {
  for (const hint of writeKeyHints(spec)) {
    const split = hint.indexOf("=");
    if (split === -1) continue;
    const pattern = hint.slice(0, split);
    if (writeKeyPatternMatches(pattern, key)) return hint.slice(split + 1).split("|");
  }
  return undefined;
}

function writeKeyPatternMatches(pattern: string, key: string): boolean {
  const patternParts = keyParts(pattern);
  const keyPath = keyParts(key);
  if (patternParts.length !== keyPath.length) return false;
  return patternParts.every((part, index) => writeKeyPartMatches(part, keyPath[index]));
}

function writeKeyPartMatches(pattern: string, value: string): boolean {
  if (pattern.startsWith("<") && pattern.endsWith(">")) return value.length > 0;
  if (pattern.startsWith("{") && pattern.endsWith("}")) {
    return pattern.slice(1, -1).split("|").includes(value);
  }
  return pattern === value;
}

export function unknownReadKeyError(spec: ReadSurfaceSpec, key: string): Error {
  return new Error(`unknown read key: ${key} (valid: ${readKeyHints(spec).join(", ")})`);
}

export function unknownUpdateKeyError(spec: ReadSurfaceSpec, key: string): Error {
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
  if ((SURFACE_TYPES as readonly string[]).includes(normalized)) return normalized as SurfaceType;
  throw new Error(`unknown surface type: ${type} (valid: ${SURFACE_TYPES.join(", ")})`);
}

function specForSurfaceType(type: SurfaceType): ReadSurfaceSpec {
  if (type === "note") return NOTE_READ_SPEC;
  return specForType(type);
}

const CHILD_AREA_ADDRESSING =
  "Root areas are directly addressable by title. Nested areas are child notes: create/read/update/delete/rename them with the *-child commands using root_type=area + root_title + relpath (ancestor chain to the immediate parent) + title.";
const RESOURCE_PATH_ADDRESSING =
  "A resource title may be a Resources-relative path using /: title=\"AI/Foo\" addresses or creates <Resources>/AI/Foo.md. A bare title resolves anywhere under Resources and is ambiguous if duplicated.";
const LLM_WIKI_PATH_ADDRESSING =
  "An llm-wiki title may be an LLM-Wiki-relative path using /: title=\"AI/Foo\" addresses or creates <LLM-Wiki>/AI/Foo.md. A bare title resolves anywhere under LLM-Wiki and is ambiguous if duplicated.";
const CHILD_NOTE_ADDRESSING =
  "not directly addressable — create/read/update/delete/rename it with the *-child commands: root_type (project|area) + root_title + relpath (ancestor chain to the immediate parent) + title";
const GENERIC_NOTE_ADDRESSING =
  "not directly addressable — read/update/delete/rename it with the *-child commands: root_type (project|area) + root_title + relpath (ancestor chain to the immediate parent) + title";
const ZK_ADDRESSING: SurfaceAddressing = {
  addressable: true,
  selectors: ["title", "kind"],
  create: "para-zk:create-zk",
  rename: true
};

const SURFACE_ADDRESSING: Record<SurfaceType, SurfaceAddressing> = {
  project: { addressable: true, selectors: ["title", "archived"], create: "para-zk:create-project", rename: true },
  area: {
    addressable: true,
    selectors: ["title", "archived"],
    addressVia: CHILD_AREA_ADDRESSING,
    create: "para-zk:create-area",
    rename: true
  },
  resource: {
    addressable: true,
    selectors: ["title", "archived"],
    addressVia: RESOURCE_PATH_ADDRESSING,
    create: "para-zk:create-resource",
    rename: true
  },
  "llm-wiki": {
    addressable: true,
    selectors: ["title"],
    addressVia: LLM_WIKI_PATH_ADDRESSING,
    create: "para-zk:create-llm-wiki",
    read: "para-zk:read-llm-wiki",
    update: "para-zk:update-llm-wiki",
    rename: true,
    refile: "para-zk:refile-llm-wiki"
  },
  journal: { addressable: true, selectors: ["date"], create: "para-zk:capture-journal", rename: false },
  retro: { addressable: true, selectors: ["title", "date", "archived"], create: "para-zk:create-retro", rename: false },
  subnote: { addressable: false, addressVia: CHILD_NOTE_ADDRESSING, create: "para-zk:create-child", rename: true },
  spark: ZK_ADDRESSING,
  digest: ZK_ADDRESSING,
  permanent: ZK_ADDRESSING,
  note: { addressable: false, addressVia: GENERIC_NOTE_ADDRESSING, rename: true }
};

// Addressing facet: how an LLM reaches/creates a note of this type. Separated from
// the surface (keys) facet because some types are create-able but not directly
// addressable for R/U/R/D — they are reached through the dedicated *-child CLI family.
function addressingForType(type: SurfaceType): SurfaceAddressing {
  const addressing = SURFACE_ADDRESSING[type];
  return {
    ...addressing,
    ...(addressing.selectors ? { selectors: [...addressing.selectors] } : {}),
    ...(addressing.createInputs ? { createInputs: [...addressing.createInputs] } : {})
  };
}

function describeSurfaceSpec(type: SurfaceType, spec: ReadSurfaceSpec): SurfaceDescription {
  const frontmatterKeys = readableFrontmatterKeys(spec);
  return {
    type,
    addressing: addressingForType(type),
    readKeys: compactReadKeys(spec),
    // writeKeys carry op detail (frontmatter/{...}=set, tasks=insert, ...) so a caller learns
    // exactly what is mutable, and how, before attempting — the same hints the update-key error
    // reports. Keys absent here are not writable (e.g. created/updated are vault-managed).
    writeKeys: writeKeyHints(spec),
    ...(frontmatterKeys.length > 0 ? { frontmatterKeys } : {}),
    collections: collectionMap(spec)
  };
}

export function readableFrontmatterKeys(spec: ReadSurfaceSpec): string[] {
  return uniqueStrings([...spec.frontmatter, ...(spec.readonlyFrontmatter ?? [])]);
}

export function keyParts(key: string): string[] {
  return key.split("/").map((part) => part.trim()).filter(Boolean);
}

async function readReferences(_content: string, context: SectionTransformContext): Promise<Record<string, ReferenceRead>> {
  return Object.fromEntries(
    (await readReferenceItemsFresh(context.ctx, context.file))
      .map((item, index) => [String(index), item])
  );
}

async function readTasks(_content: string, context: SectionTransformContext): Promise<Record<string, TaskRead>> {
  return readRootTaskMap(context.ctx, context.file);
}

function sectionLabels(labelKey: string): string[] {
  return uniqueStrings([
    localePack("en").labels[labelKey],
    localePack("ko").labels[labelKey]
  ]);
}

export function sectionHeadingCandidates(section: ReadSectionSpec): string[] {
  return uniqueStrings([
    ...(section.labelKey ? sectionLabels(section.labelKey) : []),
    ...(section.labels ?? [])
  ]);
}
