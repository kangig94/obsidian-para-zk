import type { TFile } from "obsidian";
import { frontmatterTimeMs } from "../time";
import { fileFrontmatter, readType, type Frontmatter } from "../vault/frontmatter";
import { normalizeVaultPath } from "../vault/paths";
import type {
  WikiIngestCandidate,
  WikiIngestCandidateReason,
  WikiIngestCandidatesOptions,
  WikiIngestCandidatesResult,
  WikiIngestMode,
  WikiIngestStalePage,
  WorkflowContext
} from "./context";
import { isArchivedFile, isUnderAnyFolder, templateFolderPaths } from "./locations";

export const INGESTABLE_TYPES = ["resource", "digest", "permanent", "subnote"] as const;

type IngestableType = typeof INGESTABLE_TYPES[number];

export type IngestableCanonicalSource = {
  file: TFile;
  type: IngestableType;
  frontmatter: Frontmatter;
  updated: unknown;
  updatedMs: number | null;
};

type NormalizedWikiIngestOptions = {
  mode: WikiIngestMode;
  sourcePaths: string[];
  offset: number;
  limit: number | "all";
};

type CitingWikiPage = {
  path: string;
  title: string;
  updatedMs: number | null;
};

export async function wikiIngestCandidates(
  ctx: WorkflowContext,
  options: WikiIngestCandidatesOptions
): Promise<WikiIngestCandidatesResult> {
  const normalized = normalizeWikiIngestOptions(options);
  const sources = ingestableCanonicalSources(ctx);
  const citationsBySource = llmWikiCitationsBySource(ctx);
  const candidates = normalized.sourcePaths.length > 0
    ? targetedCandidates(ctx, normalized.mode, normalized.sourcePaths, citationsBySource)
    : sourceCandidates(normalized.mode, sources, citationsBySource);
  const page = pageCandidates(candidates, normalized);

  return {
    count: candidates.length,
    offset: normalized.offset,
    limit: normalized.limit,
    returned: page.length,
    has_more: normalized.offset + page.length < candidates.length,
    candidates: page
  };
}

export function ingestableCanonicalSource(
  ctx: WorkflowContext,
  file: TFile,
  frontmatter: Frontmatter = fileFrontmatter(ctx, file)
): IngestableCanonicalSource | undefined {
  if (isUnderAnyFolder(file.path, templateFolderPaths(ctx))) return undefined;
  if (isArchivedFile(ctx, file)) return undefined;

  const type = readType(frontmatter);
  if (!isIngestableType(type)) return undefined;
  const updated = frontmatter.updated;
  return {
    file,
    type,
    frontmatter,
    updated: updatedJsonValue(updated),
    updatedMs: frontmatterTimeMs(updated) ?? null
  };
}

function normalizeWikiIngestOptions(options: WikiIngestCandidatesOptions): NormalizedWikiIngestOptions {
  const mode = options.mode;
  if (!isWikiIngestMode(mode)) {
    throw new Error("mode must be one of per-import, delta, init, re-ingest");
  }

  const sourcePaths = normalizeSourcePaths(options);
  const targeted = mode === "per-import" || mode === "re-ingest";
  const hasTargetOption = Object.prototype.hasOwnProperty.call(options, "source_path")
    || Object.prototype.hasOwnProperty.call(options, "source_paths");
  if (targeted && sourcePaths.length === 0) {
    throw new Error("source_path or source_paths is required for per-import and re-ingest");
  }
  if (!targeted && hasTargetOption) {
    throw new Error("source_path and source_paths are only valid for per-import and re-ingest");
  }

  const offset = Math.max(0, options.offset ?? 0);
  const limit = options.limit === "all" ? "all" : Math.max(0, options.limit ?? 50);
  return {
    mode,
    sourcePaths,
    offset,
    limit
  };
}

function isWikiIngestMode(value: unknown): value is WikiIngestMode {
  return value === "per-import" || value === "delta" || value === "init" || value === "re-ingest";
}

function normalizeSourcePaths(options: WikiIngestCandidatesOptions): string[] {
  const rawPaths = [
    ...(typeof options.source_path === "string" ? [options.source_path] : []),
    ...(Array.isArray(options.source_paths) ? options.source_paths : [])
  ];
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawPaths) {
    if (typeof raw !== "string") continue;
    const path = normalizeVaultPath(raw);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    paths.push(path);
  }
  return paths;
}

function ingestableCanonicalSources(ctx: WorkflowContext): IngestableCanonicalSource[] {
  const sources: IngestableCanonicalSource[] = [];
  for (const file of ctx.host.getMarkdownFiles()) {
    const source = ingestableCanonicalSource(ctx, file);
    if (source) sources.push(source);
  }
  return sources.sort((left, right) => left.file.path.localeCompare(right.file.path));
}

function llmWikiCitationsBySource(ctx: WorkflowContext): Map<string, CitingWikiPage[]> {
  const bySource = new Map<string, CitingWikiPage[]>();
  for (const [sourcePath, targets] of Object.entries(ctx.host.resolvedLinks())) {
    const sourceFile = ctx.host.getFile(sourcePath);
    if (!sourceFile) continue;
    const frontmatter = fileFrontmatter(ctx, sourceFile);
    if (readType(frontmatter) !== "llm-wiki") continue;

    const citingPage: CitingWikiPage = {
      path: sourceFile.path,
      title: sourceFile.basename,
      updatedMs: frontmatterTimeMs(frontmatter.updated) ?? null
    };

    for (const [targetPath, count] of Object.entries(targets)) {
      if (!positiveCount(count)) continue;
      const normalizedTarget = normalizeVaultPath(targetPath);
      const pages = bySource.get(normalizedTarget) ?? [];
      pages.push(citingPage);
      bySource.set(normalizedTarget, pages);
    }
  }

  for (const pages of bySource.values()) {
    pages.sort((left, right) => left.path.localeCompare(right.path));
  }
  return bySource;
}

function sourceCandidates(
  mode: WikiIngestMode,
  sources: IngestableCanonicalSource[],
  citationsBySource: Map<string, CitingWikiPage[]>
): WikiIngestCandidate[] {
  const candidates: WikiIngestCandidate[] = [];
  for (const source of sources) {
    const path = source.file.path;
    const citingPages = citationsBySource.get(path) ?? [];
    const stalePages = stalePagesForSource(source, citingPages);
    const reason = candidateReason(mode, citingPages.length > 0, stalePages.length > 0);
    if (!reason) continue;
    candidates.push(candidateFromSource(source, stalePages, reason));
  }
  return candidates;
}

function targetedCandidates(
  ctx: WorkflowContext,
  mode: WikiIngestMode,
  sourcePaths: string[],
  citationsBySource: Map<string, CitingWikiPage[]>
): WikiIngestCandidate[] {
  const reason = mode === "per-import" ? "per_import" : "reingest_requested";
  return sourcePaths.map((path) => {
    const file = ctx.host.getFile(path);
    if (!file) throw new Error(`source_path not found: ${path}`);

    const source = ingestableCanonicalSource(ctx, file);
    if (!source) throw new Error(`source_path is not an active non-template ingestable source: ${path}`);
    return candidateFromSource(source, stalePagesForSource(source, citationsBySource.get(source.file.path) ?? []), reason);
  });
}

function candidateReason(
  mode: WikiIngestMode,
  cited: boolean,
  stale: boolean
): WikiIngestCandidateReason | undefined {
  if (mode === "init") {
    return cited ? undefined : "missing_wiki_citation";
  }
  if (mode !== "delta") return undefined;
  if (!cited) return "missing_wiki_citation";
  if (stale) return "source_newer_than_wiki";
  return undefined;
}

function stalePagesForSource(
  source: IngestableCanonicalSource,
  citingPages: CitingWikiPage[]
): WikiIngestStalePage[] {
  const sourceUpdatedMs = source.updatedMs;
  if (sourceUpdatedMs === null) return [];
  return citingPages
    .filter((page): page is CitingWikiPage & { updatedMs: number } =>
      page.updatedMs !== null && page.updatedMs < sourceUpdatedMs)
    .map((page) => ({
      path: page.path,
      title: page.title,
      updated_ms: page.updatedMs
    }));
}

function candidateFromSource(
  source: IngestableCanonicalSource,
  stalePages: WikiIngestStalePage[],
  reason: WikiIngestCandidateReason
): WikiIngestCandidate {
  return {
    path: source.file.path,
    type: source.type,
    title: source.file.basename,
    updated: source.updated,
    updated_ms: source.updatedMs,
    stale_llm_wikis: stalePages,
    reason
  };
}

function pageCandidates(candidates: WikiIngestCandidate[], options: NormalizedWikiIngestOptions): WikiIngestCandidate[] {
  return options.limit === "all"
    ? candidates.slice(options.offset)
    : candidates.slice(options.offset, options.offset + options.limit);
}

function isIngestableType(value: string): value is IngestableType {
  return (INGESTABLE_TYPES as readonly string[]).includes(value);
}

function positiveCount(value: unknown): boolean {
  return typeof value === "number" && value > 0;
}

function updatedJsonValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  // Luxon DateTime (the metadataCache shape for date frontmatter): toISO() returns string | null.
  if (hasToIso(value)) {
    const iso = value.toISO();
    return typeof iso === "string" ? iso : null;
  }
  return value;
}

function hasToIso(value: unknown): value is { toISO: () => unknown } {
  const candidate = value as { toISO?: unknown } | null;
  return typeof candidate?.toISO === "function";
}
