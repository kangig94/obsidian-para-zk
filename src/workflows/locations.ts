import { TFolder, type TFile } from "obsidian";
import { localePack } from "../i18n";
import { frontmatterLinks, fileFrontmatter, readFileFrontmatterFresh, readFileTypeFresh, readType, type Frontmatter } from "../vault/frontmatter";
import { dateFromCli, isoWeekInfo, localDate } from "../time";
import type { ParaZkSettings, PromotionZkKind, ZkKind } from "../types";
import { ensureFolder, isInFolder, parentFolder } from "../vault/files";
import type { WorkflowHost } from "../vault/host";
import { joinVaultPath, normalizeVaultPath, sanitizeFileName, wikiLink } from "../vault/paths";
import { uniqueStrings } from "../text";
import { readOptionalCode } from "./code-options";
import type { ReadAreaOptions, ReadJournalOptions, ReadProjectOptions, ReadResourceOptions, ReadRetroOptions, ReadZkOptions, WorkflowContext } from "./context";
import { stringReferencesAnyTarget } from "./references";
import { ZK_KIND_CODE_HELP, parseZkKind } from "../zk/kinds";


export function folderStyleContainer(file: TFile): TFolder | undefined {
  const folder = file.parent;
  return folder && folder.name === file.basename ? folder : undefined;
}

export function assertVacantPath(ctx: WorkflowContext, path: string): void {
  const normalized = normalizeVaultPath(path);
  if (ctx.host.getAbstractFile(normalized)) {
    throw new Error(`target already exists: ${normalized}`);
  }
}

export function relativePathUnderRoot(path: string, root: string): string {
  const normalizedPath = normalizeVaultPath(path);
  const normalizedRoot = normalizeVaultPath(root);
  if (normalizedPath === normalizedRoot) return "";
  if (!normalizedPath.startsWith(`${normalizedRoot}/`)) {
    throw new Error(`${normalizedPath} is not under ${normalizedRoot}`);
  }
  return normalizedPath.slice(normalizedRoot.length + 1);
}

export async function ensureFolderStyleParent(ctx: WorkflowContext, file: TFile): Promise<{
  file: TFile;
  childFolder: string;
}> {
  const parentPath = file.parent?.path ?? "";
  const parentName = parentPath.split("/").filter(Boolean).pop() ?? "";
  const isFolderStyle = parentPath.length > 0 && parentName === file.basename;
  const childFolder = isFolderStyle ? parentPath : joinVaultPath(parentPath, file.basename);
  await ensureFolder(ctx.host, childFolder);

  if (isFolderStyle) {
    return { file, childFolder };
  }

  const newPath = joinVaultPath(childFolder, `${file.basename}.md`);
  const existing = ctx.host.getAbstractFile(newPath);
  if (existing && existing !== file) {
    throw new Error(`cannot move ${file.path}; ${newPath} already exists`);
  }
  if (normalizeVaultPath(file.path) !== newPath) {
    await ctx.host.renameFile(file, newPath);
  }

  const moved = ctx.host.getFile(newPath);
  if (!moved) throw new Error(`failed to move ${file.path} to ${newPath}`);
  return { file: moved, childFolder };
}

export async function uniqueMarkdownPath(host: Pick<WorkflowHost, "getAbstractFile">, path: string): Promise<string> {
  const normalized = ensureMdPath(path);
  if (!host.getAbstractFile(normalized)) return normalized;

  const dot = normalized.toLowerCase().lastIndexOf(".md");
  const base = dot >= 0 ? normalized.slice(0, dot) : normalized;
  let index = 1;
  let candidate = "";
  do {
    candidate = `${base} ${index}.md`;
    index += 1;
  } while (host.getAbstractFile(candidate));
  return candidate;
}

export function uniqueFolderStyleMarkdownPath(
  ctx: WorkflowContext,
  rootFolder: string,
  title: string
): { title: string; folder: string; path: string } {
  let index = 0;
  while (true) {
    const candidateTitle = index === 0 ? title : `${title} ${index}`;
    const folder = joinVaultPath(rootFolder, candidateTitle);
    const path = joinVaultPath(folder, `${candidateTitle}.md`);
    const titleExists = ctx.host.getMarkdownFiles().some((file) =>
      file.basename === candidateTitle
      && isDomainNotePathUnderRoot(file, rootFolder)
    );
    if (
      !titleExists
      && !ctx.host.getAbstractFile(folder)
      && !ctx.host.getAbstractFile(path)
    ) {
      return { title: candidateTitle, folder, path };
    }
    index += 1;
  }
}

export function folderForZkKind(settings: ParaZkSettings, kind: ZkKind | PromotionZkKind): string {
  if (kind === "Literature") return settings.paths.literatureFolder;
  if (kind === "Permanent") return settings.paths.permanentFolder;
  return settings.paths.fleetingFolder;
}

function archiveAwareFolders(
  ctx: WorkflowContext,
  activeFolder: string,
  archived: boolean | undefined
): string[] {
  const active = normalizeVaultPath(activeFolder);
  const archive = archivedCounterpartFolder(ctx, active);
  if (archived === true) return [archive];
  if (archived === false) return [active];
  return [active, archive];
}

export function archivedCounterpartFolder(ctx: WorkflowContext, activeFolder: string): string {
  const normalized = normalizeVaultPath(activeFolder);
  const mappings = [
    ctx.settings.paths.projectsFolder,
    ctx.settings.paths.areasFolder,
    ctx.settings.paths.resourcesFolder,
    ctx.settings.paths.retrosFolder
  ].map((folder) => normalizeVaultPath(folder));

  for (const base of mappings) {
    if (normalized !== base && !normalized.startsWith(`${base}/`)) continue;
    const relative = normalized === base ? "" : normalized.slice(base.length + 1);
    return joinVaultPath(ctx.settings.paths.archivesFolder, folderName(base), relative);
  }

  return joinVaultPath(ctx.settings.paths.archivesFolder, folderName(normalized));
}

function folderStyleCanonicalPaths(folder: string, title: string): string[] {
  return [
    joinVaultPath(folder, title, `${title}.md`),
    joinVaultPath(folder, `${title}.md`)
  ];
}

export function isArchivedFile(ctx: WorkflowContext, file: TFile): boolean {
  const archiveRoot = normalizeVaultPath(ctx.settings.paths.archivesFolder);
  const normalized = normalizeVaultPath(file.path);
  return normalized === archiveRoot || normalized.startsWith(`${archiveRoot}/`);
}

export function isArchivedPath(ctx: WorkflowContext, path: string): boolean {
  const archiveRoot = normalizeVaultPath(ctx.settings.paths.archivesFolder);
  const normalized = normalizeVaultPath(path);
  return normalized === archiveRoot || normalized.startsWith(`${archiveRoot}/`);
}

export function folderName(path: string): string {
  return normalizeVaultPath(path).split("/").filter(Boolean).pop() ?? "";
}

function isDomainNotePathUnderRoot(file: TFile, rootFolder: string): boolean {
  const root = normalizeVaultPath(rootFolder);
  const parent = file.parent?.path ?? "";
  return parent === root || parent === joinVaultPath(root, file.basename);
}

function ensureMdPath(path: string): string {
  const normalized = normalizeVaultPath(path);
  return /\.md$/i.test(normalized) ? normalized : `${normalized}.md`;
}

export function retroSourceType(ctx: WorkflowContext, file: TFile, frontmatter: Frontmatter): string {
  const type = String(frontmatter.type ?? "").trim().toLowerCase();
  if (type) return type;
  if (isCanonicalFolderNote(file, ctx.settings.paths.projectsFolder)) return "project";
  if (isCanonicalFolderNote(file, ctx.settings.paths.areasFolder)) return "area";
  return "";
}

export async function findExistingSourceRetroForWeek(
  ctx: WorkflowContext,
  source: TFile,
  sourceType: string,
  weekSegment: string
): Promise<TFile | undefined> {
  const domain = sourceType === "project" || sourceType === "area" ? sourceType : undefined;
  if (!domain) return undefined;

  const matches: TFile[] = [];
  for (const file of ctx.host.getMarkdownFiles()) {
    if (!isInFolder(file, ctx.settings.paths.retrosFolder)) continue;
    const frontmatter = await readFileFrontmatterFresh(ctx, file);
    if (readType(frontmatter) !== "retro") continue;
    if (retroWeekSegment(file, frontmatter) !== weekSegment) continue;
    if (!isSourceScopedRetro(ctx, file, frontmatter, source, domain)) continue;
    matches.push(file);
  }

  return matches.sort((left, right) => {
    const leftDefault = isDefaultSourceRetroFilename(ctx, left.basename, domain, source.basename, weekSegment);
    const rightDefault = isDefaultSourceRetroFilename(ctx, right.basename, domain, source.basename, weekSegment);
    if (leftDefault !== rightDefault) return leftDefault ? -1 : 1;
    return left.path.localeCompare(right.path);
  })[0];
}

function isCanonicalFolderNote(file: TFile, rootFolder: string): boolean {
  if (!isInFolder(file, rootFolder)) return false;
  const directPath = joinVaultPath(rootFolder, `${file.basename}.md`);
  const folderStylePath = joinVaultPath(rootFolder, file.basename, `${file.basename}.md`);
  return file.path === directPath || file.path === folderStylePath;
}

function isSourceScopedRetro(
  ctx: WorkflowContext,
  retro: TFile,
  frontmatter: Frontmatter,
  source: TFile,
  domain: "project" | "area"
): boolean {
  if (domain === "project") {
    return frontmatterLinks(frontmatter.project).some((link) => stringReferencesAnyTarget(ctx, retro.path, link, [source]));
  }

  if (frontmatterLinks(frontmatter.project).length > 0) return false;
  return frontmatterLinks(frontmatter.areas).some((link) => stringReferencesAnyTarget(ctx, retro.path, link, [source]));
}

function retroWeekSegment(file: TFile, frontmatter: Frontmatter): string | undefined {
  const weekIso = typeof frontmatter.week_iso === "string" ? frontmatter.week_iso.trim() : "";
  if (/^\d{4}-W\d{2}$/.test(weekIso)) return weekIso.replace("-", "_");

  const parent = folderName(parentFolder(file.path));
  return /^\d{4}_W\d{2}$/.test(parent) ? parent : undefined;
}

function isDefaultSourceRetroFilename(
  ctx: WorkflowContext,
  basename: string,
  domain: "project" | "area",
  title: string,
  weekSegment: string
): boolean {
  return sourceRetroNamePrefixes(ctx, domain)
    .some((prefix) => basename === sanitizeFileName(`Retro-${prefix}-${title}-${weekSegment}`));
}

function sourceRetroNamePrefix(ctx: WorkflowContext, domain: "project" | "area"): string {
  const labels = localePack(ctx.settings.locale).labels;
  return domain === "project" ? labels.retroNameProjectPrefix : labels.retroNameAreaPrefix;
}

function sourceRetroNamePrefixes(ctx: WorkflowContext, domain: "project" | "area"): string[] {
  return uniqueStrings([
    sourceRetroNamePrefix(ctx, domain),
    domain === "project" ? localePack("en").labels.retroNameProjectPrefix : localePack("en").labels.retroNameAreaPrefix,
    domain === "project" ? localePack("ko").labels.retroNameProjectPrefix : localePack("ko").labels.retroNameAreaPrefix
  ]);
}

export async function resolveRequiredProject(ctx: WorkflowContext, options: ReadProjectOptions): Promise<TFile> {
  const file = options.path
    ? resolveRequiredFile(ctx, options.path, "project note")
    : findProjectByTitle(ctx, requireTitle(options.title, "project title"), options.archived);
  if (!file) throw new Error(`project not found: ${options.title}`);

  const type = await readFileTypeFresh(ctx, file);
  if (type !== "project") throw new Error(`file is not a project note: ${file.path}`);
  return file;
}

export async function resolveRequiredArea(ctx: WorkflowContext, options: ReadAreaOptions): Promise<TFile> {
  const file = options.path
    ? resolveRequiredFile(ctx, options.path, "area note")
    : findAreaByTitleForRead(ctx, requireTitle(options.title, "area title"), options.archived);
  if (!file) throw new Error(`area not found: ${options.title}`);

  const type = await readFileTypeFresh(ctx, file);
  if (type !== "area") throw new Error(`file is not an area note: ${file.path}`);
  return file;
}

export async function resolveRequiredResource(ctx: WorkflowContext, options: ReadResourceOptions): Promise<TFile> {
  const file = options.path
    ? resolveRequiredFile(ctx, options.path, "resource note")
    : findResourceByTitle(ctx, requireTitle(options.title, "resource title"), options.archived);
  if (!file) throw new Error(`resource not found: ${options.title}`);

  const type = await readFileTypeFresh(ctx, file);
  if (type !== "resource") throw new Error(`file is not a resource note: ${file.path}`);
  return file;
}

export async function resolveRequiredZk(ctx: WorkflowContext, options: ReadZkOptions): Promise<TFile> {
  const kind = readOptionalCode(options.kind, parseZkKind, "kind", ZK_KIND_CODE_HELP);
  const file = options.path
    ? resolveRequiredFile(ctx, options.path, "ZK note")
    : findZkByTitle(ctx, requireTitle(options.title, "ZK title"), kind);
  if (!file) throw new Error(`ZK note not found: ${options.title}`);

  const type = await readFileTypeFresh(ctx, file);
  if (!type.startsWith("zk_")) throw new Error(`file is not a ZK note: ${file.path}`);
  if (kind && type !== typeForZkKind(kind)) throw new Error(`file is not a ${kind} ZK note: ${file.path}`);
  return file;
}

export async function resolveRequiredJournal(ctx: WorkflowContext, options: ReadJournalOptions): Promise<TFile> {
  const file = options.path
    ? resolveRequiredFile(ctx, options.path, "journal note")
    : ctx.host.getFile(journalPath(ctx, options.date));
  if (!file) throw new Error(`journal not found: ${localDate(dateFromCli(options.date))}`);

  const type = await readFileTypeFresh(ctx, file);
  if (type !== "journal") throw new Error(`file is not a journal note: ${file.path}`);
  return file;
}

export async function resolveRequiredRetro(ctx: WorkflowContext, options: ReadRetroOptions): Promise<TFile> {
  const file = options.path
    ? resolveRequiredFile(ctx, options.path, "retro note")
    : findRetroByTitle(ctx, requireTitle(options.title, "retro title"), options.date, options.archived);
  if (!file) throw new Error(`retro not found: ${options.title}`);

  const type = await readFileTypeFresh(ctx, file);
  if (type !== "retro") throw new Error(`file is not a retro note: ${file.path}`);
  return file;
}

export function resolveRequiredFile(ctx: WorkflowContext, path: string | undefined, label: string): TFile {
  const file = resolveOptionalFile(ctx, path) ?? ctx.host.getActiveFile();
  if (!file) throw new Error(`${label} is required`);
  return file;
}

export function resolveOptionalFile(ctx: WorkflowContext, path: string | undefined): TFile | undefined {
  const normalized = normalizeVaultPath(path);
  if (!normalized) return undefined;
  const file = ctx.host.getFile(normalized);
  if (!file) throw new Error(`file not found: ${normalized}`);
  return file;
}

function findProjectByTitle(ctx: WorkflowContext, title: string, archived: boolean | undefined): TFile | undefined {
  const folders = archiveAwareFolders(ctx, ctx.settings.paths.projectsFolder, archived);
  const canonicalPaths = folders.flatMap((folder) => folderStyleCanonicalPaths(folder, title));

  for (const path of canonicalPaths) {
    const file = ctx.host.getFile(path);
    if (file) return file;
  }

  return findUniqueNoteByTitle(ctx, {
    title,
    folders,
    type: "project",
    label: "project"
  });
}

function findAreaByTitleForRead(ctx: WorkflowContext, title: string, archived: boolean | undefined): TFile | undefined {
  const folders = archiveAwareFolders(ctx, ctx.settings.paths.areasFolder, archived);
  const canonicalPaths = folders.flatMap((folder) => folderStyleCanonicalPaths(folder, title));

  for (const path of canonicalPaths) {
    const file = ctx.host.getFile(path);
    if (file) return file;
  }

  return findUniqueNoteByTitle(ctx, {
    title,
    folders,
    type: "area",
    label: "area"
  });
}

function findResourceByTitle(ctx: WorkflowContext, title: string, archived: boolean | undefined): TFile | undefined {
  const folders = archiveAwareFolders(ctx, ctx.settings.paths.resourcesFolder, archived);

  for (const folder of folders) {
    const file = ctx.host.getFile(joinVaultPath(folder, `${title}.md`));
    if (file) return file;
  }

  return findUniqueNoteByTitle(ctx, {
    title,
    folders,
    type: "resource",
    label: "resource"
  });
}

function findZkByTitle(
  ctx: WorkflowContext,
  title: string,
  kind: ZkKind | undefined
): TFile | undefined {
  const folders = zkSearchFolders(ctx, kind);

  for (const folder of folders) {
    const file = ctx.host.getFile(joinVaultPath(folder, `${title}.md`));
    if (file) return file;
  }

  const expectedType = kind ? typeForZkKind(kind) : undefined;
  return findUniqueNoteByTitle(ctx, {
    title,
    folders,
    type: expectedType,
    typePrefix: expectedType ? undefined : "zk_",
    label: "ZK note"
  });
}

function findRetroByTitle(
  ctx: WorkflowContext,
  title: string,
  date: string | undefined,
  archived: boolean | undefined
): TFile | undefined {
  const activeFolder = date
    ? joinVaultPath(ctx.settings.paths.retrosFolder, isoWeekInfo(dateFromCli(date)).weekIso.replace("-", "_"))
    : ctx.settings.paths.retrosFolder;
  return findUniqueNoteByTitle(ctx, {
    title,
    folders: archiveAwareFolders(ctx, activeFolder, archived),
    type: "retro",
    label: "retro"
  });
}

function findUniqueNoteByTitle(
  ctx: WorkflowContext,
  options: {
    title: string;
    folders: string[];
    type?: string;
    typePrefix?: string;
    label: string;
  }
): TFile | undefined {
  const files = ctx.host.getMarkdownFiles().filter((file) => {
    const type = readType(fileFrontmatter(ctx, file));
    return options.folders.some((folder) => isInFolder(file, folder))
      && (!options.type || type === options.type)
      && (!options.typePrefix || type.startsWith(options.typePrefix));
  });
  const exactMatches = files.filter((file) => file.basename === options.title);
  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1) throw new Error(`${options.label} title is ambiguous: ${options.title}`);

  const foldedTitle = options.title.toLocaleLowerCase();
  const foldedMatches = files.filter((file) => file.basename.toLocaleLowerCase() === foldedTitle);
  if (foldedMatches.length === 1) return foldedMatches[0];
  if (foldedMatches.length > 1) throw new Error(`${options.label} title is ambiguous: ${options.title}`);

  return undefined;
}

function journalPath(ctx: WorkflowContext, date: string | undefined): string {
  const dateText = localDate(dateFromCli(date));
  return joinVaultPath(ctx.settings.paths.journalFolder, dateText.slice(0, 7), `${dateText}.md`);
}

function typeForZkKind(kind: ZkKind): string {
  return `zk_${kind.toLowerCase()}`;
}

function zkSearchFolders(ctx: WorkflowContext, kind: ZkKind | undefined): string[] {
  return kind
    ? [folderForZkKind(ctx.settings, kind)]
    : [ctx.settings.paths.fleetingFolder, ctx.settings.paths.literatureFolder, ctx.settings.paths.permanentFolder];
}

export function requireTitle(value: string | undefined, label: string): string {
  const title = sanitizeFileName(value ?? "");
  if (!title) throw new Error(`${label} is required`);
  return title;
}

export function linkToFile(file: TFile): string {
  return wikiLink(file.path, file.basename);
}

export function findAreaByTitle(ctx: WorkflowContext, title: string): TFile | undefined {
  const canonicalPaths = folderStyleCanonicalPaths(ctx.settings.paths.areasFolder, title);

  for (const path of canonicalPaths) {
    const file = ctx.host.getFile(path);
    if (file) return file;
  }

  return findUniqueNoteByTitle(ctx, {
    title,
    folders: [ctx.settings.paths.areasFolder],
    type: "area",
    label: "area"
  });
}


export function childFiles(ctx: WorkflowContext, parent: TFile): TFile[] {
  const directFolder = folderStyleChildFolder(parent);
  const parentLink = linkToFile(parent);
  const byPath = new Map<string, TFile>();

  for (const file of ctx.host.getMarkdownFiles()) {
    if (file.path === parent.path) continue;
    const frontmatter = fileFrontmatter(ctx, file);
    if ((directFolder && file.parent?.path === directFolder) || frontmatter.parent === parentLink) {
      byPath.set(file.path, file);
    }
  }

  return Array.from(byPath.values()).sort((left, right) => left.path.localeCompare(right.path));
}

function folderStyleChildFolder(file: TFile): string | undefined {
  const parentPath = file.parent?.path ?? "";
  const parentName = folderName(parentPath);
  return parentPath && parentName === file.basename ? parentPath : undefined;
}

export function findChild(ctx: WorkflowContext, parent: TFile, title: string): TFile | undefined {
  const matches = childFiles(ctx, parent).filter((file) => file.basename === title);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error("child title is ambiguous: " + title);
  return undefined;
}
