import type { TFile } from "obsidian";
import { frontmatterTimeMs } from "../time";
import { fileFrontmatter, readType, type Frontmatter } from "../vault/frontmatter";
import type {
  AuditCheckCode,
  AuditFinding,
  AuditFixedItem,
  AuditOptions,
  AuditResult,
  AuditSeverity,
  ReferenceRead,
  WorkflowContext
} from "./context";
import { isArchivedFile, isUnderAnyFolder, templateFolderPaths } from "./locations";
import { backfillReferenceIds, readReferenceItemsFresh } from "./references";

type AuditableNote = {
  file: TFile;
  type: string;
  frontmatter: Frontmatter;
};

type NormalizedAuditOptions = {
  check?: AuditCheckCode;
  severity?: AuditSeverity;
  type?: string;
  offset: number;
  limit: number | "all";
  fix: boolean;
};

const AUDIT_CHECKS: AuditCheckCode[] = [
  "broken_link",
  "dangling_reference",
  "idless_reference",
  "orphan_note",
  "upward_wiki_link",
  "unprocessed_spark",
  "stale_draft_permanent"
];

const CHECK_SEVERITY: Record<AuditCheckCode, AuditSeverity> = {
  broken_link: "high",
  dangling_reference: "high",
  idless_reference: "medium",
  orphan_note: "medium",
  upward_wiki_link: "medium",
  unprocessed_spark: "low",
  stale_draft_permanent: "low"
};

// Keep these equal to the Home/ZK dashboard thresholds.
const SPARK_STALE_DAYS = 7;
const DRAFT_STALE_DAYS = 14;
const DEFAULT_AUDIT_LIMIT = 50;

export async function auditVault(ctx: WorkflowContext, options: AuditOptions = {}): Promise<AuditResult> {
  const normalized = normalizeAuditOptions(options);
  const notes = auditableNotes(ctx);
  const enabledChecks = new Set<AuditCheckCode>(normalized.check ? [normalized.check] : AUDIT_CHECKS);
  let findings = await collectAuditFindings(ctx, notes, enabledChecks);
  let fixed: AuditFixedItem[] | undefined;

  if (normalized.fix) {
    const idlessFindings = enabledChecks.has("idless_reference")
      ? findings.filter((finding) => finding.code === "idless_reference")
      : await referenceFindings(ctx, notes, new Set<AuditCheckCode>(["idless_reference"]));
    fixed = await backfillIdlessReferences(ctx, notes, idlessFindings);
    if (fixed.length > 0) {
      // Backfill mutates references frontmatter, so pre-fix findings are stale.
      findings = await collectAuditFindings(ctx, notes, enabledChecks);
    }
  }

  const filtered = findings.filter((finding) => matchesAuditFilters(finding, normalized));
  const page = pageAuditFindings(filtered, normalized);
  return {
    counts: auditCounts(filtered),
    count: filtered.length,
    offset: page.offset,
    limit: page.limit,
    returned: page.findings.length,
    has_more: page.offset + page.findings.length < filtered.length,
    findings: page.findings,
    ...(fixed ? { fixed } : {})
  };
}

function normalizeAuditOptions(options: AuditOptions): NormalizedAuditOptions {
  const check = normalizeAuditCheck(options.check);
  const severity = normalizeAuditSeverity(options.severity);
  const offset = options.offset ?? 0;
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error("offset must be a non-negative integer");
  }

  const limit = options.limit ?? DEFAULT_AUDIT_LIMIT;
  if (limit !== "all" && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error("limit must be a positive integer or all");
  }

  const type = options.type?.trim();
  return {
    ...(check ? { check } : {}),
    ...(severity ? { severity } : {}),
    ...(type ? { type } : {}),
    offset,
    limit,
    fix: options.fix === true
  };
}

function normalizeAuditCheck(value: string | undefined): AuditCheckCode | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if ((AUDIT_CHECKS as string[]).includes(trimmed)) return trimmed as AuditCheckCode;
  throw new Error(`check must be one of ${AUDIT_CHECKS.join(", ")}`);
}

function normalizeAuditSeverity(value: AuditSeverity | undefined): AuditSeverity | undefined {
  if (value === undefined) return undefined;
  if (value === "high" || value === "medium" || value === "low") return value;
  throw new Error("severity must be one of high, medium, low");
}

function auditableNotes(ctx: WorkflowContext): AuditableNote[] {
  const templateFolders = templateFolderPaths(ctx);

  const notes: AuditableNote[] = [];
  for (const file of ctx.host.getMarkdownFiles()) {
    if (isUnderAnyFolder(file.path, templateFolders)) continue;
    if (isArchivedFile(ctx, file)) continue;
    const frontmatter = fileFrontmatter(ctx, file);
    notes.push({
      file,
      type: readType(frontmatter),
      frontmatter
    });
  }
  return notes.sort((left, right) => left.file.path.localeCompare(right.file.path));
}

async function collectAuditFindings(
  ctx: WorkflowContext,
  notes: AuditableNote[],
  enabledChecks: Set<AuditCheckCode>
): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];
  if (enabledChecks.has("broken_link")) findings.push(...brokenLinkFindings(ctx, notes));
  if (enabledChecks.has("dangling_reference") || enabledChecks.has("idless_reference")) {
    findings.push(...await referenceFindings(ctx, notes, enabledChecks));
  }
  if (enabledChecks.has("orphan_note")) findings.push(...orphanNoteFindings(ctx, notes));
  if (enabledChecks.has("upward_wiki_link")) findings.push(...upwardWikiLinkFindings(ctx, notes));
  if (enabledChecks.has("unprocessed_spark")) findings.push(...unprocessedSparkFindings(notes));
  if (enabledChecks.has("stale_draft_permanent")) findings.push(...staleDraftPermanentFindings(notes));
  return findings;
}

function brokenLinkFindings(ctx: WorkflowContext, notes: AuditableNote[]): AuditFinding[] {
  const notesByPath = notePathMap(notes);
  const findings: AuditFinding[] = [];
  for (const [sourcePath, targets] of Object.entries(ctx.host.unresolvedLinks())
    .sort(([left], [right]) => left.localeCompare(right))) {
    const note = notesByPath.get(sourcePath);
    if (!note) continue;
    for (const [target, count] of Object.entries(targets).sort(([left], [right]) => left.localeCompare(right))) {
      if (!count) continue;
      findings.push({
        code: "broken_link",
        severity: CHECK_SEVERITY.broken_link,
        path: note.file.path,
        type: note.type,
        detail: { target, count },
        fix: "Fix the wikilink/embed target or create the target note."
      });
    }
  }
  return findings;
}

async function referenceFindings(
  ctx: WorkflowContext,
  notes: AuditableNote[],
  enabledChecks: Set<AuditCheckCode>
): Promise<AuditFinding[]> {
  const danglingFindings: AuditFinding[] = [];
  const idlessFindings: AuditFinding[] = [];
  const checkDangling = enabledChecks.has("dangling_reference");
  const checkIdless = enabledChecks.has("idless_reference");
  for (const note of notes) {
    const references = await readReferenceItemsFresh(ctx, note.file);
    references.forEach((reference, index) => {
      if (checkDangling && isDanglingReference(reference)) {
        danglingFindings.push({
          code: "dangling_reference",
          severity: CHECK_SEVERITY.dangling_reference,
          path: note.file.path,
          type: note.type,
          detail: referenceDetail(reference, index),
          fix: "Correct or remove the reference with key=references."
        });
      }
      if (checkIdless && reference.id === null) {
        idlessFindings.push({
          code: "idless_reference",
          severity: CHECK_SEVERITY.idless_reference,
          path: note.file.path,
          type: note.type,
          detail: referenceDetail(reference, index),
          fix: "Run para-zk:audit fix=true or update the note with key=references op=backfill."
        });
      }
    });
  }
  return [...danglingFindings, ...idlessFindings];
}

function isDanglingReference(reference: ReferenceRead): boolean {
  // Only wiki references can dangle: resolved note/file refs carry path, and url/text have no vault target.
  // Revisit this exhaustive case when adding a new ReferenceRead kind.
  return reference.kind === "wiki" && typeof reference.target === "string" && !reference.path;
}

function referenceDetail(reference: ReferenceRead, index: number): Record<string, unknown> {
  return {
    index,
    link: reference.link,
    kind: reference.kind,
    ...(reference.target !== undefined ? { target: reference.target } : {}),
    ...(reference.path !== undefined ? { path: reference.path } : {}),
    ...(reference.description !== undefined ? { description: reference.description } : {}),
    ...(reference.id !== undefined ? { id: reference.id } : {})
  };
}

function orphanNoteFindings(ctx: WorkflowContext, notes: AuditableNote[]): AuditFinding[] {
  const resolvedLinks = ctx.host.resolvedLinks();
  const findings: AuditFinding[] = [];
  for (const note of notes) {
    if (!isOrphanCandidate(ctx, note)) continue;
    const incoming = incomingResolvedLinks(resolvedLinks, note.file.path);
    const outgoing = outgoingResolvedLinks(resolvedLinks, note.file.path);
    if (incoming > 0 || outgoing > 0) continue;
    findings.push({
      code: "orphan_note",
      severity: CHECK_SEVERITY.orphan_note,
      path: note.file.path,
      type: note.type,
      detail: { incoming, outgoing },
      fix: "Link this note from an area, project, or hub note."
    });
  }
  return findings;
}

function isOrphanCandidate(ctx: WorkflowContext, note: AuditableNote): boolean {
  if (!["resource", "digest", "permanent"].includes(note.type)) return false;
  if (isFolderMainNote(note.file)) return false;
  if (isUnderAnyFolder(note.file.path, [ctx.settings.paths.dashboardFolder])) {
    return false;
  }
  return true;
}

function upwardWikiLinkFindings(ctx: WorkflowContext, notes: AuditableNote[]): AuditFinding[] {
  const resolvedLinks = ctx.host.resolvedLinks();
  const findings: AuditFinding[] = [];
  for (const note of notes) {
    if (note.type === "llm-wiki") continue;
    const targets = resolvedLinks[note.file.path] ?? {};
    for (const [targetPath, value] of Object.entries(targets).sort(([left], [right]) => left.localeCompare(right))) {
      if (positiveCount(value) === 0) continue;
      const targetFile = ctx.host.getFile(targetPath);
      if (!targetFile) continue;
      if (readType(fileFrontmatter(ctx, targetFile)) !== "llm-wiki") continue;
      findings.push({
        code: "upward_wiki_link",
        severity: CHECK_SEVERITY.upward_wiki_link,
        path: note.file.path,
        type: note.type,
        detail: { target: targetPath },
        fix: "Remove the link; the wiki cites the note, not vice-versa."
      });
    }
  }
  return findings;
}

function isFolderMainNote(file: TFile): boolean {
  return file.parent?.name === file.basename;
}

function incomingResolvedLinks(links: Record<string, Record<string, number>>, targetPath: string): number {
  let count = 0;
  for (const [sourcePath, targets] of Object.entries(links)) {
    if (sourcePath === targetPath) continue;
    count += positiveCount(targets[targetPath]);
  }
  return count;
}

function outgoingResolvedLinks(links: Record<string, Record<string, number>>, sourcePath: string): number {
  const targets = links[sourcePath] ?? {};
  let count = 0;
  for (const [targetPath, value] of Object.entries(targets)) {
    if (targetPath === sourcePath) continue;
    count += positiveCount(value);
  }
  return count;
}

function positiveCount(value: number | undefined): number {
  return typeof value === "number" && value > 0 ? value : 0;
}

function unprocessedSparkFindings(notes: AuditableNote[]): AuditFinding[] {
  const cutoff = Date.now() - days(SPARK_STALE_DAYS);
  return notes
    .filter((note) => note.type === "spark" && note.frontmatter.processed !== true)
    .filter((note) => {
      const created = frontmatterTimeMs(note.frontmatter.created);
      return created !== undefined && created <= cutoff;
    })
    .map((note) => ({
      code: "unprocessed_spark",
      severity: CHECK_SEVERITY.unprocessed_spark,
      path: note.file.path,
      type: note.type,
      detail: { created: note.frontmatter.created, threshold_days: SPARK_STALE_DAYS },
      fix: "Run para-zk:distill-spark or discard the spark."
    }));
}

function staleDraftPermanentFindings(notes: AuditableNote[]): AuditFinding[] {
  const cutoff = Date.now() - days(DRAFT_STALE_DAYS);
  return notes
    .filter((note) => note.type === "permanent" && note.frontmatter.maturity === "draft")
    .filter((note) => {
      const updated = frontmatterTimeMs(note.frontmatter.updated);
      return updated !== undefined && updated <= cutoff;
    })
    .map((note) => ({
      code: "stale_draft_permanent",
      severity: CHECK_SEVERITY.stale_draft_permanent,
      path: note.file.path,
      type: note.type,
      detail: { updated: note.frontmatter.updated, threshold_days: DRAFT_STALE_DAYS },
      fix: "Refine the permanent note or promote its maturity."
    }));
}

function days(value: number): number {
  return value * 24 * 60 * 60 * 1000;
}

async function backfillIdlessReferences(
  ctx: WorkflowContext,
  notes: AuditableNote[],
  findings: AuditFinding[]
): Promise<AuditFixedItem[]> {
  const filesByPath = new Map(notes.map((note) => [note.file.path, note.file]));
  const paths = Array.from(new Set(findings.map((finding) => finding.path))).sort((left, right) => left.localeCompare(right));
  const fixed: AuditFixedItem[] = [];
  for (const path of paths) {
    const file = filesByPath.get(path);
    if (!file) continue;
    const result = await backfillReferenceIds(ctx, file);
    if (!result.changed) continue;
    fixed.push({
      code: "idless_reference",
      path,
      action: "backfillReferenceIds"
    });
  }
  return fixed;
}

function matchesAuditFilters(finding: AuditFinding, options: NormalizedAuditOptions): boolean {
  if (options.check && finding.code !== options.check) return false;
  if (options.severity && finding.severity !== options.severity) return false;
  if (options.type && finding.type !== options.type) return false;
  return true;
}

function pageAuditFindings(
  findings: AuditFinding[],
  options: NormalizedAuditOptions
): { offset: number; limit: number | "all"; findings: AuditFinding[] } {
  const pageFindings = options.limit === "all"
    ? findings.slice(options.offset)
    : findings.slice(options.offset, options.offset + options.limit);
  return {
    offset: options.offset,
    limit: options.limit,
    findings: pageFindings
  };
}

function auditCounts(findings: AuditFinding[]): Record<AuditCheckCode, number> {
  const counts = Object.fromEntries(AUDIT_CHECKS.map((code) => [code, 0])) as Record<AuditCheckCode, number>;
  for (const finding of findings) {
    counts[finding.code] += 1;
  }
  return counts;
}

function notePathMap(notes: AuditableNote[]): Map<string, AuditableNote> {
  return new Map(notes.map((note) => [note.file.path, note]));
}
