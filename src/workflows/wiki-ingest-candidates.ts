import type { TFile } from "obsidian";
import { frontmatterTimeMs } from "../time";
import { fileFrontmatter, readType, type Frontmatter } from "../vault/frontmatter";
import { normalizeVaultPath } from "../vault/paths";
import type {
  WikiIngestCandidate,
  WikiIngestCandidateReason,
  WikiIngestCandidatesOptions,
  WikiIngestCandidatesResult,
  WikiIngestLedgerRow,
  WikiIngestMode,
  WorkflowContext
} from "./context";
import { isArchivedFile, isUnderAnyFolder, isWikiLedgerPath, templateFolderPaths } from "./locations";
import { ledgerJsonValue, readWikiLedgerRows } from "./wiki-ledger";

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

export async function wikiIngestCandidates(
  ctx: WorkflowContext,
  options: WikiIngestCandidatesOptions
): Promise<WikiIngestCandidatesResult> {
  const normalized = normalizeWikiIngestOptions(options);
  const sources = ingestableCanonicalSources(ctx);
  const ledger = await readWikiLedgerRows(ctx);
  const candidates = normalized.sourcePaths.length > 0
    ? targetedCandidates(ctx, normalized.mode, normalized.sourcePaths, ledger.latestRowsBySource)
    : sourceCandidates(normalized.mode, sources, citedSourcePaths(ctx), ledger.latestRowsBySource);
  const page = pageCandidates(candidates, normalized);

  return {
    count: candidates.length,
    offset: normalized.offset,
    limit: normalized.limit,
    returned: page.length,
    has_more: normalized.offset + page.length < candidates.length,
    ledger_warnings: ledger.ledger_warnings,
    candidates: page
  };
}

export function ingestableCanonicalSource(
  ctx: WorkflowContext,
  file: TFile,
  frontmatter: Frontmatter = fileFrontmatter(ctx, file)
): IngestableCanonicalSource | undefined {
  if (isWikiLedgerPath(ctx.settings, file.path)) return undefined;
  if (isUnderAnyFolder(file.path, templateFolderPaths(ctx))) return undefined;
  if (isArchivedFile(ctx, file)) return undefined;

  const type = readType(frontmatter);
  if (!isIngestableType(type)) return undefined;
  const updated = frontmatter.updated;
  return {
    file,
    type,
    frontmatter,
    updated: ledgerJsonValue(updated),
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

function citedSourcePaths(ctx: WorkflowContext): Set<string> {
  const cited = new Set<string>();
  for (const [sourcePath, targets] of Object.entries(ctx.host.resolvedLinks())) {
    if (isWikiLedgerPath(ctx.settings, sourcePath)) continue;
    const sourceFile = ctx.host.getFile(sourcePath);
    if (!sourceFile) continue;
    if (readType(fileFrontmatter(ctx, sourceFile)) !== "llm-wiki") continue;

    for (const [targetPath, count] of Object.entries(targets)) {
      if (count > 0) cited.add(normalizeVaultPath(targetPath));
    }
  }
  return cited;
}

function sourceCandidates(
  mode: WikiIngestMode,
  sources: IngestableCanonicalSource[],
  cited: Set<string>,
  latestRowsBySource: Map<string, WikiIngestLedgerRow>
): WikiIngestCandidate[] {
  const candidates: WikiIngestCandidate[] = [];
  for (const source of sources) {
    const path = source.file.path;
    const lastRow = latestRowsBySource.get(path);
    const reason = candidateReason(mode, source, cited.has(path), lastRow);
    if (!reason) continue;
    candidates.push(candidateFromSource(source, lastRow, reason));
  }
  return candidates;
}

function targetedCandidates(
  ctx: WorkflowContext,
  mode: WikiIngestMode,
  sourcePaths: string[],
  latestRowsBySource: Map<string, WikiIngestLedgerRow>
): WikiIngestCandidate[] {
  const reason = mode === "per-import" ? "per_import" : "reingest_requested";
  return sourcePaths.map((path) => {
    const file = ctx.host.getFile(path);
    if (!file) throw new Error(`source_path not found: ${path}`);

    const source = ingestableCanonicalSource(ctx, file);
    if (!source) throw new Error(`source_path is not an active non-template ingestable source: ${path}`);
    return candidateFromSource(source, latestRowsBySource.get(path), reason);
  });
}

function candidateReason(
  mode: WikiIngestMode,
  source: IngestableCanonicalSource,
  cited: boolean,
  lastRow: WikiIngestLedgerRow | undefined
): WikiIngestCandidateReason | undefined {
  if (mode === "init") {
    return cited ? undefined : "missing_wiki_citation";
  }
  if (mode !== "delta") return undefined;
  if (!cited) return "missing_wiki_citation";
  if (!lastRow) return "missing_ingest_record";
  if (source.updatedMs !== null && lastRow.source_updated_ms !== null && source.updatedMs > lastRow.source_updated_ms) {
    return "stale_since_ingest";
  }
  return undefined;
}

function candidateFromSource(
  source: IngestableCanonicalSource,
  lastRow: WikiIngestLedgerRow | undefined,
  reason: WikiIngestCandidateReason
): WikiIngestCandidate {
  return {
    path: source.file.path,
    type: source.type,
    title: source.file.basename,
    updated: source.updated,
    updated_ms: source.updatedMs,
    last_source_updated_ms: lastRow?.source_updated_ms ?? null,
    last_completed_at: lastRow?.at ?? null,
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
