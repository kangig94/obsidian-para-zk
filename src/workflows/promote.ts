import { TFile } from "obsidian";
import { localePack } from "../i18n";
import {
  dateFromCli,
  localDate,
  localDateTimeSpace,
  localTime
} from "../time";
import type { CaptureResult, PromotionResult } from "../types";
import { readFileFrontmatterFresh, readFileTypeFresh } from "../vault/frontmatter";
import { ensureFolder } from "../vault/files";
import type { WorkflowHost } from "../vault/host";
import { joinVaultPath, wikiLink } from "../vault/paths";
import { trailingManagedBlockStart } from "../vault/sections";
import {
  ENERGY_CODE_HELP,
  MATURITY_CODE_HELP,
  parseEnergyCode,
  parseMaturityCode,
  type EnergyCode
} from "../vocabulary";
import { PROMOTION_ZK_KIND_CODE_HELP, ZK_KIND_CODE_HELP, parsePromotionKind, parseZkKind } from "../zk/kinds";
import { escapeRegExp } from "../text";
import { readOptionalCode } from "./code-options";
import {
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
  PromoteFleetingOptions,
  PromoteResourceOptions,
  WorkflowContext
} from "./context";
import { folderForZkKind, linkToFile, requireTitle, resolveRequiredFile, uniqueMarkdownPath } from "./locations";
import { insertReferenceItem } from "./references";

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

export async function promoteResource(ctx: WorkflowContext, options: PromoteResourceOptions = {}): Promise<PromotionResult> {
  const source = resolveRequiredFile(ctx, options.sourcePath, "source resource");
  const sourceType = await readFileTypeFresh(ctx, source);
  if (sourceType !== "resource") throw new Error(`file is not a resource note: ${source.path}`);
  const kind = readOptionalCode(options.kind, parseZkKind, "kind", ZK_KIND_CODE_HELP) ?? "Permanent";
  const maturityCode = readOptionalCode(options.maturity, parseMaturityCode, "maturity", MATURITY_CODE_HELP);
  const title = requireTitle(options.title || source.basename, "ZK title");
  const folder = folderForZkKind(ctx.settings, kind);
  await ensureFolder(ctx.host, folder);
  const path = await uniqueMarkdownPath(ctx.host, joinVaultPath(folder, `${title}.md`));
  const file = await createZkFile(ctx, kind, path, title, { maturityCode });

  await insertReferenceItem(ctx, file, { link: wikiLink(source.path) });
  await appendPromotionLinkToBody(ctx.host, source, `- ${localePack(ctx.settings.locale).labels.promoteToZk}: ${linkToFile(file)}`, file.path);
  await openIfRequested(ctx, file, options.open);

  return {
    ...noteResult(file, true, options.open),
    sourcePath: source.path,
    kind
  };
}

export async function promoteFleeting(ctx: WorkflowContext, options: PromoteFleetingOptions = {}): Promise<PromotionResult> {
  const source = resolveRequiredFile(ctx, options.sourcePath, "source fleeting note");
  const sourceType = await readFileTypeFresh(ctx, source);
  if (sourceType !== "zk_fleeting") throw new Error(`file is not a fleeting ZK note: ${source.path}`);
  const kind = readOptionalCode(options.kind, parsePromotionKind, "kind", PROMOTION_ZK_KIND_CODE_HELP) ?? "Permanent";
  const maturityCode = readOptionalCode(options.maturity, parseMaturityCode, "maturity", MATURITY_CODE_HELP);
  const title = requireTitle(options.title || source.basename, "ZK title");
  const folder = folderForZkKind(ctx.settings, kind);
  await ensureFolder(ctx.host, folder);
  const path = await uniqueMarkdownPath(ctx.host, joinVaultPath(folder, `${title}.md`));
  const file = await createZkFile(ctx, kind, path, title, { maturityCode });

  await insertReferenceItem(ctx, file, { link: wikiLink(source.path) });
  await ctx.host.processFrontMatter(source, (fm) => {
    fm.processed = true;
    fm.promoted_to = linkToFile(file);
  });

  await openIfRequested(ctx, file, options.open);

  return {
    ...noteResult(file, true, options.open),
    sourcePath: source.path,
    kind
  };
}

async function appendPromotionLinkToBody(
  host: Pick<WorkflowHost, "modify" | "read">,
  file: TFile,
  line: string,
  dedupeTargetPath: string
): Promise<boolean> {
  const content = await host.read(file);
  const linkTargetRe = new RegExp(`\\[\\[${escapeRegExp(dedupeTargetPath)}(?:\\|[^\\]]*)?\\]\\]`, "i");
  if (linkTargetRe.test(content)) return false;

  const tailStart = trailingManagedBlockStart(content, 0, content.length) ?? content.length;
  const beforeTail = content.slice(0, tailStart).replace(/\s*$/, "");
  const tail = content.slice(tailStart).replace(/^\s*/, "");
  const updated = [
    beforeTail,
    line,
    ...(tail ? [tail] : [])
  ].filter(Boolean).join("\n\n") + (tail ? "" : "\n");

  if (updated === content) return false;
  await host.modify(file, updated);
  return true;
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
  const createdAt = localDateTimeSpace();
  const energyCode = readOptionalCode(options.energy, parseEnergyCode, "energy", ENERGY_CODE_HELP);
  const energy = energyCode ?? "normal";
  const folder = joinVaultPath(ctx.settings.paths.journalFolder, dateText.slice(0, 7));
  await ensureFolder(ctx.host, folder);
  const path = joinVaultPath(folder, `${dateText}.md`);

  let created = false;
  let file = ctx.host.getFile(path);
  if (!file) {
    created = true;
    file = await createMarkdownFile(ctx, "journal", path, {
      created: createdAt,
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
    applyCreatedUpdatedDefaults(fm, createdAt);
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
