import type { TFile } from "obsidian";
import { CITATION_TOKEN_RE, parseCitationKeys } from "../citation-token";
import { localePack } from "../i18n";
import { slugify, uniqueStrings } from "../text";
import { frontmatterTimeMs } from "../time";
import { fileFrontmatter, frontmatterLinks, readFileFrontmatterFresh, readType, type Frontmatter } from "../vault/frontmatter";
import { splitObsidianSubpath } from "../vault/paths";
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
import { backfillReferenceIds, canonicalWikiLink, parseWikiLink, readReferenceItemsFresh, updateReferenceItem } from "./references";

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
  "bare_reference",
  "bad_citation_subpath",
  "orphan_note",
  "upward_wiki_link",
  "orphan_wiki_page",
  "wiki_tag_domain_mismatch",
  "unprocessed_spark",
  "stale_draft_permanent"
];

const CHECK_SEVERITY: Record<AuditCheckCode, AuditSeverity> = {
  broken_link: "high",
  dangling_reference: "high",
  idless_reference: "medium",
  bare_reference: "low",
  bad_citation_subpath: "low",
  orphan_note: "medium",
  upward_wiki_link: "medium",
  orphan_wiki_page: "low",
  wiki_tag_domain_mismatch: "low",
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
    const wikiTagFindings = enabledChecks.has("wiki_tag_domain_mismatch")
      ? findings.filter((finding) => finding.code === "wiki_tag_domain_mismatch")
      : await wikiTagDomainMismatchFindings(ctx, notes);
    const bareFindings = enabledChecks.has("bare_reference")
      ? findings.filter((finding) => finding.code === "bare_reference")
      : await referenceFindings(ctx, notes, new Set<AuditCheckCode>(["bare_reference"]));
    fixed = [
      ...await backfillIdlessReferences(ctx, notes, idlessFindings),
      ...await fixWikiTagDomains(ctx, notes, wikiTagFindings),
      ...await fixBareReferences(ctx, notes, bareFindings)
    ];
    if (fixed.length > 0) {
      // Fixes mutate frontmatter, so pre-fix findings are stale.
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
  if (enabledChecks.has("dangling_reference") || enabledChecks.has("idless_reference") || enabledChecks.has("bare_reference")) {
    findings.push(...await referenceFindings(ctx, notes, enabledChecks));
  }
  if (enabledChecks.has("bad_citation_subpath")) findings.push(...await citationSubpathFindings(ctx, notes));
  if (enabledChecks.has("orphan_note")) findings.push(...orphanNoteFindings(ctx, notes));
  if (enabledChecks.has("upward_wiki_link")) findings.push(...upwardWikiLinkFindings(ctx, notes));
  if (enabledChecks.has("orphan_wiki_page")) findings.push(...orphanWikiPageFindings(ctx, notes));
  if (enabledChecks.has("wiki_tag_domain_mismatch")) findings.push(...await wikiTagDomainMismatchFindings(ctx, notes));
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

// `PZ[id#section]` citations whose `#section` does not resolve to a real heading or block in
// the cited source — usually the section was paraphrased or had a leading number dropped, so
// the citation lands at the top of the source instead of the intended section. Report-only:
// the intended heading cannot be guessed safely.
async function citationSubpathFindings(ctx: WorkflowContext, notes: AuditableNote[]): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];
  const anchorCache = new Map<string, SourceAnchors>();
  for (const note of notes) {
    const cited = subpathCitations(await ctx.host.read(note.file));
    if (cited.length === 0) continue;
    const referenceById = new Map<string, ReferenceRead>();
    for (const reference of await readReferenceItemsFresh(ctx, note.file)) {
      if (reference.id) referenceById.set(reference.id, reference);
    }
    for (const { id, subpath } of cited) {
      const reference = referenceById.get(id);
      if (!reference) continue; // an unknown citation id is a separate concern, not a bad subpath
      if (await citationSubpathResolves(ctx, reference, subpath, anchorCache)) continue;
      findings.push({
        code: "bad_citation_subpath",
        severity: CHECK_SEVERITY.bad_citation_subpath,
        path: note.file.path,
        type: note.type,
        detail: { id, subpath, target: reference.path ?? reference.link },
        fix: "Cite the source heading verbatim (keep any leading number/symbol), or drop the #section and cite PZ[id] alone."
      });
    }
  }
  return findings;
}

// Distinct (id, subpath) citation entries in a note body — only those carrying a `#section`.
function subpathCitations(content: string): { id: string; subpath: string }[] {
  const seen = new Set<string>();
  const result: { id: string; subpath: string }[] = [];
  for (const match of content.matchAll(CITATION_TOKEN_RE)) {
    for (const key of parseCitationKeys(match[1]) ?? []) {
      if (!key.subpath) continue;
      const dedupe = `${key.id}#${key.subpath}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      result.push({ id: key.id, subpath: key.subpath });
    }
  }
  return result;
}

type SourceAnchors = { headings: Set<string>; blocks: Set<string> };

async function citationSubpathResolves(
  ctx: WorkflowContext,
  reference: ReferenceRead,
  subpath: string,
  cache: Map<string, SourceAnchors>
): Promise<boolean> {
  if (!reference.path) return false; // a URL/non-note reference has no heading or block to anchor into
  let anchors = cache.get(reference.path);
  if (!anchors) {
    const file = ctx.host.getFile(reference.path);
    if (!file) return false; // missing source; dangling_reference reports the source itself
    anchors = sourceAnchors(await ctx.host.read(file));
    cache.set(reference.path, anchors);
  }
  const block = subpath.match(/^\^(.+)$/);
  return block ? anchors.blocks.has(block[1].trim().toLowerCase()) : anchors.headings.has(normalizeAnchor(subpath));
}

// Heading texts and `^block` ids a `#section` can resolve against, mirroring Obsidian: headings
// matched case-insensitively on their full text (numbers/punctuation kept), block ids by their
// trailing `^id` marker. Fenced code is skipped so `#` lines inside it are not read as headings.
function sourceAnchors(content: string): SourceAnchors {
  const headings = new Set<string>();
  const blocks = new Set<string>();
  let fenced = false;
  for (const line of content.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (heading) headings.add(normalizeAnchor(heading[1]));
    const block = line.match(/(?:^|\s)\^([A-Za-z0-9_-]+)\s*$/);
    if (block) blocks.add(block[1].toLowerCase());
  }
  return { headings, blocks };
}

function normalizeAnchor(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

async function referenceFindings(
  ctx: WorkflowContext,
  notes: AuditableNote[],
  enabledChecks: Set<AuditCheckCode>
): Promise<AuditFinding[]> {
  const danglingFindings: AuditFinding[] = [];
  const idlessFindings: AuditFinding[] = [];
  const bareFindings: AuditFinding[] = [];
  const checkDangling = enabledChecks.has("dangling_reference");
  const checkIdless = enabledChecks.has("idless_reference");
  const checkBare = enabledChecks.has("bare_reference");
  const basenames = checkBare ? markdownBasenameIndex(ctx) : undefined;
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
      if (checkBare && basenames) {
        const bare = bareReferenceState(reference, basenames);
        if (bare) {
          bareFindings.push({
            code: "bare_reference",
            severity: CHECK_SEVERITY.bare_reference,
            path: note.file.path,
            type: note.type,
            detail: {
              index,
              link: reference.link,
              base: bare.base,
              ...(bare.ambiguous ? { ambiguous: true, candidates: bare.matches } : { resolved: bare.resolvedPath })
            },
            fix: bare.ambiguous
              ? `Ambiguous: "${bare.base}" matches ${bare.matches.length} notes; set an explicit path with key=references (not auto-fixable).`
              : "Run para-zk:audit fix=true to expand the bare reference link to its full path."
          });
        }
      }
    });
  }
  return [...danglingFindings, ...idlessFindings, ...bareFindings];
}

type BareReferenceState = { base: string; resolvedPath: string; ambiguous: boolean; matches: string[] };

// A reference whose stored link is a bare basename (no folder) and that currently resolves: it
// works now but is fragile — a same-named note (e.g. an LLM-Wiki concept page) makes the bare
// link ambiguous and can silently rebind it. Returns undefined for non-bare or unresolved refs.
function bareReferenceState(reference: ReferenceRead, basenames: Map<string, string[]>): BareReferenceState | undefined {
  if (!reference.path) return undefined;
  const wiki = parseWikiLink(reference.link);
  if (!wiki) return undefined;
  const base = splitObsidianSubpath(wiki.target).base;
  if (!base || base.includes("/")) return undefined;
  const matches = [...(basenames.get(base.toLowerCase()) ?? [])].sort((left, right) => left.localeCompare(right));
  return { base, resolvedPath: reference.path, ambiguous: matches.length > 1, matches };
}

function markdownBasenameIndex(ctx: WorkflowContext): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const file of ctx.host.getMarkdownFiles()) {
    const key = file.basename.toLowerCase();
    const paths = index.get(key) ?? [];
    paths.push(file.path);
    index.set(key, paths);
  }
  return index;
}

// Frontmatter-only fix: rewrite each UNIQUE bare reference's `link` to its full path through the
// references registry (updateReferenceItem -> processFrontMatter). Body `PZ[id]` citations key on
// the stable id, so they stay valid and the body is never touched. Ambiguous bare links are left
// for the human (reported as findings, not fixed).
async function fixBareReferences(
  ctx: WorkflowContext,
  notes: AuditableNote[],
  findings: AuditFinding[]
): Promise<AuditFixedItem[]> {
  const basenames = markdownBasenameIndex(ctx);
  const filesByPath = new Map(notes.map((note) => [note.file.path, note.file]));
  const paths = Array.from(new Set(findings.map((finding) => finding.path))).sort((left, right) => left.localeCompare(right));
  const fixed: AuditFixedItem[] = [];
  for (const path of paths) {
    const file = filesByPath.get(path);
    if (!file) continue;
    const references = await readReferenceItemsFresh(ctx, file);
    const edits: { index: number; link: string }[] = [];
    references.forEach((reference, index) => {
      const bare = bareReferenceState(reference, basenames);
      if (!bare || bare.ambiguous) return;
      const display = parseWikiLink(reference.link)?.alias ?? bare.base;
      edits.push({ index, link: canonicalWikiLink(bare.resolvedPath, display) });
    });
    for (const edit of edits) {
      await updateReferenceItem(ctx, file, edit.index, { link: edit.link });
    }
    if (edits.length > 0) {
      fixed.push({ code: "bare_reference", path, action: "expandBareReferenceLinks" });
    }
  }
  return fixed;
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

// An llm-wiki page whose only legitimate inbound links are from OTHER wiki pages
// (canonical->wiki links are the upward_wiki_link anti-pattern). A page no wiki page
// links to is usually a concept the weaver left stranded outside the interlinked web —
// but a genuinely standalone topic is legitimate, so this is a low-severity hint, never forced.
function orphanWikiPageFindings(ctx: WorkflowContext, notes: AuditableNote[]): AuditFinding[] {
  const wikiPaths = new Set(notes.filter((note) => note.type === "llm-wiki").map((note) => note.file.path));
  if (wikiPaths.size === 0) return [];

  const resolvedLinks = ctx.host.resolvedLinks();
  const inboundFromWiki = new Map<string, number>();
  for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
    if (!wikiPaths.has(sourcePath)) continue;
    for (const [targetPath, value] of Object.entries(targets)) {
      if (targetPath === sourcePath || !wikiPaths.has(targetPath)) continue;
      inboundFromWiki.set(targetPath, (inboundFromWiki.get(targetPath) ?? 0) + positiveCount(value));
    }
  }

  const findings: AuditFinding[] = [];
  for (const note of notes) {
    if (note.type !== "llm-wiki") continue;
    // A `<domain>/index` hub is the intentional per-domain entry point: it links OUT to the
    // domain's concept pages and is not expected to have inbound wiki links, so never flag it.
    if (isWikiDomainIndex(ctx, note.file)) continue;
    if ((inboundFromWiki.get(note.file.path) ?? 0) > 0) continue;
    findings.push({
      code: "orphan_wiki_page",
      severity: CHECK_SEVERITY.orphan_wiki_page,
      path: note.file.path,
      type: note.type,
      detail: { inbound_wiki_links: 0 },
      fix: "Hint only: cross-link it from a related wiki page if it belongs to the interlinked web; a genuinely standalone topic can be left as-is."
    });
  }
  return findings;
}

// An llm-wiki page's domain folder is the source of truth for its identity tag. When a page is
// re-filed to another domain (or carries a stale/legacy tag), the `llm-wiki/<domain>` tag drifts
// from the folder; flag it (fixable — see fixWikiTagDomains).
async function wikiTagDomainMismatchFindings(ctx: WorkflowContext, notes: AuditableNote[]): Promise<AuditFinding[]> {
  const prefix = localePack(ctx.settings.locale).tags.llmWiki;
  const findings: AuditFinding[] = [];
  for (const note of notes) {
    if (note.type !== "llm-wiki") continue;
    const expected = expectedWikiDomainTag(ctx, note.file, prefix);
    if (!expected) continue; // a flat (domain-less) page has no folder domain to derive from
    // Always read tags fresh (not the note.frontmatter snapshot) so the post-fix re-collect
    // reflects the corrected tag; the per-page read is fine for the non-hot-path audit.
    const actual = currentWikiTag(await readFileFrontmatterFresh(ctx, note.file), prefix);
    if (actual === expected) continue;
    findings.push({
      code: "wiki_tag_domain_mismatch",
      severity: CHECK_SEVERITY.wiki_tag_domain_mismatch,
      path: note.file.path,
      type: note.type,
      detail: { expected, actual: actual ?? null },
      fix: "Run para-zk:audit fix=true to set the identity tag to the page's folder domain."
    });
  }
  return findings;
}

async function fixWikiTagDomains(
  ctx: WorkflowContext,
  notes: AuditableNote[],
  findings: AuditFinding[]
): Promise<AuditFixedItem[]> {
  const filesByPath = new Map(notes.map((note) => [note.file.path, note.file]));
  const prefix = localePack(ctx.settings.locale).tags.llmWiki;
  const paths = Array.from(new Set(findings.map((finding) => finding.path))).sort((left, right) => left.localeCompare(right));
  const fixed: AuditFixedItem[] = [];
  for (const path of paths) {
    const file = filesByPath.get(path);
    if (!file) continue;
    const expected = expectedWikiDomainTag(ctx, file, prefix);
    if (!expected) continue;
    let changed = false;
    await ctx.host.processFrontMatter(file, (fm) => {
      const current = frontmatterLinks(fm.tags);
      // Replace the existing llm-wiki identity tag with the folder-derived one; keep any other tags.
      const others = current.filter((tag) => tag !== prefix && !tag.startsWith(`${prefix}/`));
      const next = uniqueStrings([...others, expected]);
      if (next.length !== current.length || next.some((tag, index) => tag !== current[index])) {
        fm.tags = next;
        changed = true;
      }
    });
    if (changed) fixed.push({ code: "wiki_tag_domain_mismatch", path, action: "setWikiDomainTag" });
  }
  return fixed;
}

// A `<domain>/index` hub: exactly one folder under the wiki root, basename `index`.
function isWikiDomainIndex(ctx: WorkflowContext, file: TFile): boolean {
  const root = `${ctx.settings.paths.wikiFolder}/`;
  if (!file.path.startsWith(root)) return false;
  const segments = file.path.slice(root.length).split("/");
  return segments.length === 2 && segments[1] === "index.md";
}

// The page's domain = the first folder segment under the wiki folder (`<domain>/<concept>.md`).
function expectedWikiDomainTag(ctx: WorkflowContext, file: TFile, prefix: string): string | undefined {
  const root = `${ctx.settings.paths.wikiFolder}/`;
  if (!file.path.startsWith(root)) return undefined;
  const segments = file.path.slice(root.length).split("/");
  return segments.length >= 2 ? `${prefix}/${slugify(segments[0])}` : undefined;
}

function currentWikiTag(frontmatter: Frontmatter, prefix: string): string | undefined {
  return frontmatterLinks(frontmatter.tags).find((tag) => tag === prefix || tag.startsWith(`${prefix}/`));
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
