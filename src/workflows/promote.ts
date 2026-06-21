import { TFile } from "obsidian";
import { localePack } from "../i18n";
import { PARA_ZK_PATHS } from "../layout";
import {
  dateFromCli,
  localDate,
  localTime
} from "../time";
import type { CaptureResult, PromotionResult, ZkKind } from "../types";
import { readFileFrontmatterFresh, readFileTypeFresh } from "../vault/frontmatter";
import { ensureFolder } from "../vault/files";
import type { WorkflowHost } from "../vault/host";
import { joinVaultPath, wikiLink } from "../vault/paths";
import {
  ENERGY_CODE_HELP,
  MATURITY_CODE_HELP,
  parseEnergyCode,
  parseMaturityCode,
  type EnergyCode
} from "../vocabulary";
import { RESOURCE_CREATE_KIND_CODE_HELP, parseResourceCreateKind, zkKindCode } from "../zk/kinds";
import { appendUniqueStrings, escapeRegExp } from "../text";
import { readOptionalCode } from "./code-options";
import {
  applyBody,
  applyCreatedUpdatedDefaults,
  createMarkdownFile,
  createZkFile,
  noteResult,
  openIfRequested
} from "./create";
import type {
  CaptureJournalOptions,
  OpenJournalOptions,
  OpenJournalResult,
  DistillSparkOptions,
  CreateFromDigestOptions,
  CreateFromResourceOptions,
  WorkflowContext
} from "./context";
import { folderForZkKind, requireTitle, resolveRequiredByType, resolveRequiredFile } from "./locations";
import { insertReferenceItem } from "./references";
import { deleteZk } from "./delete";

export async function captureJournal(ctx: WorkflowContext, options: CaptureJournalOptions): Promise<CaptureResult> {
  const content = options.content?.trim();
  if (!content) throw new Error("journal capture content is required");

  const timeText = options.time?.trim() || localTime();
  const journal = await ensureJournal(ctx, options);

  const t = localePack(ctx.settings.locale);
  await appendLineUnderHeader(ctx.host, journal.file, t.labels.quickMemo, `- ${timeText} - ${content}`, {
    createHeadingLevel: 1,
    ordered: false,
    dedupe: false
  });
  await openIfRequested(ctx, journal.file, options.open);

  return {
    path: journal.file.path,
    content,
    date: journal.date,
    created: journal.created
  };
}

export async function openJournal(ctx: WorkflowContext, options: OpenJournalOptions = {}): Promise<OpenJournalResult> {
  const journal = await ensureJournal(ctx, options);
  await openIfRequested(ctx, journal.file, options.open);
  return {
    ...noteResult(journal.file, journal.created, options.open),
    date: journal.date,
    energy: journal.energy
  };
}

// Name-based origin lookup: the command implies the stored origin type, so the
// caller need only supply a title. Maps the stored type to an addressing token.
function resolveOriginByName(ctx: WorkflowContext, expectedType: string, title: string | undefined): Promise<TFile> {
  if (expectedType === "resource") return resolveRequiredByType(ctx, "resource", { title });
  if (expectedType === "digest") return resolveRequiredByType(ctx, "zk", { title, kind: "digest" });
  if (expectedType === "spark") return resolveRequiredByType(ctx, "zk", { title, kind: "spark" });
  return resolveRequiredByType(ctx, expectedType, { title });
}

// Shared scaffold: resolve a typed origin note and create a new ZK note of
// `kind` from it. Behind createFromResource / createFromDigest /
// distillSpark — each adds only its distinct post-create step.
async function createZkFromOrigin(
  ctx: WorkflowContext,
  options: { sourcePath?: string; sourceTitle?: string; title?: string; maturity?: string },
  origin: { label: string; expectedType: string },
  kind: ZkKind
): Promise<{ source: TFile; file: TFile; created: boolean }> {
  const source = options.sourcePath
    ? resolveRequiredFile(ctx, options.sourcePath, origin.label)
    : await resolveOriginByName(ctx, origin.expectedType, options.sourceTitle);
  const sourceType = await readFileTypeFresh(ctx, source);
  if (sourceType !== origin.expectedType) {
    throw new Error(`file is not a ${origin.expectedType} note: ${source.path}`);
  }
  const maturityCode = readOptionalCode(options.maturity, parseMaturityCode, "maturity", MATURITY_CODE_HELP);
  const title = requireTitle(options.title || source.basename, "ZK title");
  const folder = folderForZkKind(kind);
  const path = joinVaultPath(folder, `${title}.md`);
  const { file, created } = await createZkFile(ctx, kind, path, title, { maturityCode });
  return { source, file, created };
}

// Create from a durable source. The new note references its origin (one
// direction); the origin surfaces it via Obsidian backlinks. No reverse link is
// written back into the origin (see ZK redesign: single-direction + derived backlinks).
export async function createFromResource(ctx: WorkflowContext, options: CreateFromResourceOptions = {}): Promise<PromotionResult> {
  const kind = readOptionalCode(options.kind, parseResourceCreateKind, "kind", RESOURCE_CREATE_KIND_CODE_HELP) ?? "Permanent";
  const { source, file, created } = await createZkFromOrigin(ctx, options, { label: "source resource", expectedType: "resource" }, kind);
  if (created) {
    await insertReferenceItem(ctx, file, { link: wikiLink(source.path) });
    await applyBody(ctx, file, options.body);
  }
  await openIfRequested(ctx, file, options.open);
  return { ...noteResult(file, created, options.open), sourcePath: source.path, kind: zkKindCode(kind) };
}

export async function createFromDigest(ctx: WorkflowContext, options: CreateFromDigestOptions = {}): Promise<PromotionResult> {
  const { source, file, created } = await createZkFromOrigin(ctx, options, { label: "source digest note", expectedType: "digest" }, "Permanent");
  if (created) {
    await insertReferenceItem(ctx, file, { link: wikiLink(source.path) });
    await applyBody(ctx, file, options.body);
  }
  await openIfRequested(ctx, file, options.open);
  return { ...noteResult(file, created, options.open), sourcePath: source.path, kind: "permanent" };
}

// Distill consumes a spark: its idea moves into a new permanent note. The spark
// is ephemeral, so the permanent does not reference it; the spark is only marked
// processed (discard is a separate, manual action — a spark may yield several
// permanents before there is nothing left to extract).
export async function distillSpark(ctx: WorkflowContext, options: DistillSparkOptions = {}): Promise<PromotionResult> {
  const { source, file, created } = await createZkFromOrigin(ctx, options, { label: "source spark note", expectedType: "spark" }, "Permanent");

  // Only consume the spark when a NEW permanent was actually created. If the target
  // permanent already existed (created: false), the distill produced nothing new — leave
  // the spark untouched and let the caller re-examine rather than silently discarding it.
  if (created) {
    if (options.discard) {
      // The whole point of the spark is fulfilled — drop it (to trash, recoverable).
      await deleteZk(ctx, { path: source.path });
    } else {
      // Keep the spark for now; record what it became. The pointer lives on the
      // disposable spark (not the permanent), so discarding it later — by any means —
      // never leaves a dangling link in the permanent.
      await ctx.host.processFrontMatter(source, (fm) => {
        fm.processed = true;
        fm.distilled_to = appendUniqueStrings(fm.distilled_to, [wikiLink(file.path)]);
      });
    }
    await applyBody(ctx, file, options.body);
  }
  await openIfRequested(ctx, file, options.open);

  return {
    ...noteResult(file, created, options.open),
    sourcePath: source.path,
    kind: "permanent"
  };
}

async function appendLineUnderHeader(
  host: Pick<WorkflowHost, "modify" | "read">,
  file: TFile,
  headerName: string,
  line: string,
  options: {
    createHeadingLevel: number;
    ordered: boolean;
    dedupe?: boolean;
    dedupeTargetPath?: string;
    dedupeText?: string;
  }
): Promise<boolean> {
  const content = await host.read(file);
  const headerPattern = escapeRegExp(headerName).replace(/\s+/g, "\\s+");
  const headerRe = new RegExp(`^(?<quote>(?:>\\s*)*)\\s*(?<hashes>#{1,6})\\s*${headerPattern}(?=\\s|$).*?$`, "im");
  const match = content.match(headerRe);

  if (!match) {
    const prefix = "#".repeat(options.createHeadingLevel);
    const insertedLine = options.ordered ? `1. ${line}` : line;
    await host.modify(file, `${content.replace(/\s*$/, "")}\n\n${prefix} ${headerName}\n${insertedLine}\n`);
    return true;
  }

  const quote = match.groups?.quote ?? "";
  const headerEnd = (match.index ?? 0) + match[0].length;
  const sectionStart = content.charAt(headerEnd) === "\n" ? headerEnd + 1 : headerEnd;
  const after = content.slice(sectionStart);
  const nextHeaderRel = after.search(/^\s*(?:>\s*)*#{1,6}\s+/m);
  const sectionEnd = nextHeaderRel === -1 ? content.length : sectionStart + nextHeaderRel;
  const section = content.slice(sectionStart, sectionEnd);

  if (options.dedupeTargetPath) {
    const linkTargetRe = new RegExp(`\\[\\[${escapeRegExp(options.dedupeTargetPath)}(?:\\|[^\\]]*)?\\]\\]`, "i");
    if (linkTargetRe.test(section)) return false;
  }
  if (options.dedupeText && section.includes(options.dedupeText)) return false;
  if (options.dedupe && section.includes(line)) return false;

  const firstNonEmpty = section.split(/\n/).find((item) => item.trim());
  const insertQuote = quote && firstNonEmpty?.startsWith(quote) ? quote : "";
  const newLine = options.ordered
    ? `${insertQuote}${countListItems(section, insertQuote) + 1}. ${line}`
    : `${insertQuote}${line}`;
  const gap = section.length === 0 || section.endsWith("\n") ? "" : "\n";
  const updated = content.slice(0, sectionStart) + section + gap + newLine + "\n" + content.slice(sectionEnd);
  await host.modify(file, updated);
  return true;
}

function countListItems(section: string, prefix: string): number {
  const escapedPrefix = escapeRegExp(prefix);
  const numberRe = new RegExp(`^${escapedPrefix}\\s*\\d+\\.\\s+`);
  const bulletRe = new RegExp(`^${escapedPrefix}\\s*[-*+]\\s+`);
  return section.split(/\n/).filter((line) => numberRe.test(line) || bulletRe.test(line)).length;
}

async function ensureJournal(ctx: WorkflowContext, options: OpenJournalOptions): Promise<{
  file: TFile;
  created: boolean;
  date: string;
  energy: string;
}> {
  const date = dateFromCli(options.date);
  const dateText = localDate(date);
  const energyCode = readOptionalCode(options.energy, parseEnergyCode, "energy", ENERGY_CODE_HELP);
  const energy = energyCode ?? "normal";
  const folder = joinVaultPath(PARA_ZK_PATHS.journalFolder, dateText.slice(0, 7));
  await ensureFolder(ctx.host, folder);
  const path = joinVaultPath(folder, `${dateText}.md`);

  let created = false;
  let file = ctx.host.getFile(path);
  if (!file) {
    created = true;
    file = await createMarkdownFile(ctx, "journal", path, {
      date: dateText,
      energy,
      cursor: ""
    });
  }

  const tags = localePack(ctx.settings.locale).tags;
  await ctx.host.processFrontMatter(file, (fm) => {
    fm.type = "journal";
    fm.date = fm.date || dateText;
    fm.energy = fm.energy ?? energy;
    fm.tags = fm.tags || [tags.journal];
    applyCreatedUpdatedDefaults(fm);
  });
  const storedFrontmatter = await readFileFrontmatterFresh(ctx, file);

  return {
    file,
    created,
    date: dateText,
    energy: storedEnergy(storedFrontmatter.energy, energy)
  };
}

function storedEnergy(value: unknown, fallback: EnergyCode): string {
  return typeof value === "string" ? value : fallback;
}
