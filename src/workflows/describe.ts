import { TFile } from "obsidian";
import { localePack } from "../i18n";
import { stripProjectSummaryManagedBlock, type TextRange } from "../vault/sections";
import type { CollectionKind, ReferenceRead, SurfaceDescription, TaskRead, WorkflowContext } from "./context";
import { readBacklinks } from "./backlinks";
import { readReferenceItems } from "./references";
import { readRootTaskMap } from "./tasks";
import { uniqueStrings } from "../text";

type ReadMap = Record<string, unknown>;
type ReadCollectionKind = CollectionKind;

export type SectionTransformContext = {
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

export const BACKLINK_READ_SECTION: ReadSectionSpec = {
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

export const DOC_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: ["subnote_type"],
  sections: [
    BACKLINK_READ_SECTION
  ],
  body: true
};

export const ZK_FLEETING_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: ["processed"],
  sections: [
    { key: "thought_summary", labelKey: "thoughtSummary" },
    { key: "memo", labelKey: "memo" },
    { key: "tasks", labelKey: "tasks", transform: readTasks, collection: "task" },
    { key: "references", labelKey: "references", transform: readReferences, collection: "reference" },
    BACKLINK_READ_SECTION
  ]
};

export const ZK_LITERATURE_READ_SPEC: ReadSurfaceSpec = {
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

export const ZK_PERMANENT_READ_SPEC: ReadSurfaceSpec = {
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

export const NOTE_READ_SPEC: ReadSurfaceSpec = {
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
  if (type === "journal") return JOURNAL_READ_SPEC;
  if (type === "retro") return RETRO_READ_SPEC;
  if (type === "doc") return DOC_READ_SPEC;
  if (type === "zk_fleeting") return ZK_FLEETING_READ_SPEC;
  if (type === "zk_literature") return ZK_LITERATURE_READ_SPEC;
  if (type === "zk_permanent") return ZK_PERMANENT_READ_SPEC;
  return NOTE_READ_SPEC;
}

export function readSurfaceTopLevelKeys(spec: ReadSurfaceSpec): string[] {
  const keys = ["frontmatter"];
  for (const section of spec.sections ?? []) keys.push(section.key);
  if (spec.body) keys.push("body");
  if (spec.children) keys.push("children");
  return keys;
}

export function readKeyHints(spec: ReadSurfaceSpec): string[] {
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

export function writeKeyHints(spec: ReadSurfaceSpec): string[] {
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

export function keyParts(key: string): string[] {
  return key.split("/").map((part) => part.trim()).filter(Boolean);
}

function readReferences(_content: string, context: SectionTransformContext): Record<string, ReferenceRead> {
  return Object.fromEntries(
    readReferenceItems(context.ctx, context.file).map((item, index) => [String(index), item])
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
