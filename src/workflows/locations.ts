import { TFolder, type TFile } from "obsidian";
import { localePack } from "../i18n";
import { frontmatterLinks, fileFrontmatter, readFileFrontmatterFresh, readFileTypeFresh, readType, type Frontmatter } from "../vault/frontmatter";
import { dateFromCli, isoWeekInfo, localDate } from "../time";
import type { ParaZkSettings, ZkKind } from "../types";
import { ensureFolder, isInFolder } from "../vault/files";
import type { WorkflowHost } from "../vault/host";
import { joinVaultPath, normalizeVaultPath, parentFolder, sanitizeFileName, sanitizeVaultRelativePath, splitObsidianSubpath, wikiLink } from "../vault/paths";
import { uniqueStrings } from "../text";
import { readOptionalCode } from "./code-options";
import type { ReadAreaOptions, ReadJournalOptions, ReadLlmWikiOptions, ReadProjectOptions, ReadResourceOptions, ReadRetroOptions, ReadZkOptions, WorkflowContext } from "./context";
import { isSourceScopedRetro } from "./references";
import { ZK_KIND_CODE_HELP, isZkType, parseZkKind, zkKindCode } from "../zk/kinds";


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

// Create is get-or-create everywhere: a colliding title returns the existing note
// (created: false) rather than silently allocating a suffixed duplicate. Disambiguation
// is the caller's explicit choice (re-examine, then create under a distinct title).
export function existingMarkdownFile(host: Pick<WorkflowHost, "getFile">, path: string): TFile | undefined {
  return host.getFile(ensureMdPath(path)) ?? undefined;
}

// Deterministic folder-style target (no suffixing). `existing` is any note with this title
// already under the root — the canonical folder-style path first, then a basename scan —
// which get-or-create returns instead of allocating a suffixed duplicate.
export function folderStyleMarkdownPath(
  ctx: WorkflowContext,
  rootFolder: string,
  title: string
): { title: string; folder: string; path: string; existing?: TFile } {
  const folder = joinVaultPath(rootFolder, title);
  const path = joinVaultPath(folder, `${title}.md`);
  const existing = ctx.host.getFile(path)
    ?? ctx.host.getMarkdownFiles().find((file) =>
      file.basename === title && isDomainNotePathUnderRoot(file, rootFolder));
  return { title, folder, path, existing };
}

export function folderForZkKind(settings: ParaZkSettings, kind: ZkKind): string {
  if (kind === "Digest") return settings.paths.digestFolder;
  if (kind === "Permanent") return settings.paths.permanentFolder;
  return settings.paths.sparkFolder;
}

export function isUnderAnyFolder(path: string, folders: string[]): boolean {
  const normalized = normalizeVaultPath(path);
  return folders
    .map(normalizeVaultPath)
    .filter(Boolean)
    .some((folder) => normalized === folder || normalized.startsWith(`${folder}/`));
}

export function templateFolderPaths(ctx: WorkflowContext): string[] {
  return [ctx.settings.paths.templatesFolder, ctx.settings.paths.managedTemplatesFolder]
    .map(normalizeVaultPath)
    .filter(Boolean);
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
    : findResourceByTitle(ctx, resourceTitlePath(options.title), options.archived);
  if (!file) throw new Error(`resource not found: ${options.title}`);

  const type = await readFileTypeFresh(ctx, file);
  if (type !== "resource") throw new Error(`file is not a resource note: ${file.path}`);
  return file;
}

export async function resolveRequiredLlmWiki(ctx: WorkflowContext, options: ReadLlmWikiOptions): Promise<TFile> {
  const file = options.path
    ? resolveRequiredFile(ctx, options.path, "llm-wiki note")
    : findLlmWikiByTitle(ctx, llmWikiTitlePath(options.title));
  if (!file) throw new Error(`llm-wiki note not found: ${options.title}`);

  const type = await readFileTypeFresh(ctx, file);
  if (type !== "llm-wiki") throw new Error(`file is not an llm-wiki note: ${file.path}`);
  return file;
}

export async function resolveRequiredZk(ctx: WorkflowContext, options: ReadZkOptions): Promise<TFile> {
  const kind = readOptionalCode(options.kind, parseZkKind, "kind", ZK_KIND_CODE_HELP);
  const file = options.path
    ? resolveRequiredFile(ctx, options.path, "ZK note")
    : await findZkByTitle(ctx, requireTitle(options.title, "ZK title"), kind);
  if (!file) throw new Error(`ZK note not found: ${options.title}`);

  const type = await readFileTypeFresh(ctx, file);
  if (!isZkType(type)) throw new Error(`file is not a ZK note: ${file.path}`);
  if (kind && type !== zkKindCode(kind)) throw new Error(`file is not a ${kind} ZK note: ${file.path}`);
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

// Name-based addressing: resolve a note from a type token + title (no file path).
// `type` is a user-facing addressing token (project/area/resource/zk/retro/journal),
// not a stored surface type. zk takes an optional kind; journal/retro take a date.
export async function resolveRequiredByType(
  ctx: WorkflowContext,
  type: string,
  opts: { title?: string; kind?: string; archived?: boolean; date?: string }
): Promise<TFile> {
  if (!type) {
    throw new Error("a note type is required to address by name (project, area, resource, zk, retro, or journal)");
  }
  switch (type) {
    case "project":
      return resolveRequiredProject(ctx, { title: opts.title, archived: opts.archived });
    case "area":
      return resolveRequiredArea(ctx, { title: opts.title, archived: opts.archived });
    case "resource":
      return resolveRequiredResource(ctx, { title: opts.title, archived: opts.archived });
    case "zk":
      return resolveRequiredZk(ctx, { title: opts.title, kind: opts.kind });
    case "retro":
      return resolveRequiredRetro(ctx, { title: opts.title, date: opts.date, archived: opts.archived });
    case "journal":
      return resolveRequiredJournal(ctx, { date: opts.date });
    default:
      throw new Error(`cannot address note by type: ${type} (use project, area, resource, zk, retro, or journal)`);
  }
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
    requireRootArea: true,
    label: "area"
  });
}

export type ResourceTitlePath = {
  basename: string;
  qualified: boolean;
  relpath: string;
};

function titlePath(value: string | undefined, label: string): ResourceTitlePath {
  const segments = sanitizeVaultRelativePath(value, label);
  return {
    basename: segments[segments.length - 1],
    qualified: segments.length > 1,
    relpath: segments.join("/")
  };
}

export function resourceTitlePath(value: string | undefined): ResourceTitlePath {
  return titlePath(value, "resource title");
}

export function llmWikiTitlePath(value: string | undefined): ResourceTitlePath {
  return titlePath(value, "llm-wiki title");
}

export function subnoteTitlePath(value: string | undefined): ResourceTitlePath {
  return titlePath(value, "subnote title");
}

function findResourceByTitle(ctx: WorkflowContext, title: ResourceTitlePath, archived: boolean | undefined): TFile | undefined {
  const folders = archiveAwareFolders(ctx, ctx.settings.paths.resourcesFolder, archived);

  if (title.qualified) {
    for (const folder of folders) {
      const file = ctx.host.getFile(joinVaultPath(folder, `${title.relpath}.md`));
      if (file) return file;
    }
    return undefined;
  }

  for (const folder of folders) {
    const file = ctx.host.getFile(joinVaultPath(folder, `${title.basename}.md`));
    if (file) return file;
  }

  return findUniqueNoteByTitle(ctx, {
    title: title.basename,
    folders,
    type: "resource",
    label: "resource"
  });
}

function findLlmWikiByTitle(ctx: WorkflowContext, title: ResourceTitlePath): TFile | undefined {
  const folders = [ctx.settings.paths.wikiFolder];

  if (title.qualified) {
    return ctx.host.getFile(joinVaultPath(folders[0], `${title.relpath}.md`)) ?? undefined;
  }

  const flat = ctx.host.getFile(joinVaultPath(folders[0], `${title.basename}.md`));
  if (flat) return flat;

  return findUniqueNoteByTitle(ctx, {
    title: title.basename,
    folders,
    type: "llm-wiki",
    label: "llm-wiki note"
  });
}

// A concept lives once across the whole wiki — look it up by basename under the wiki folder
// (any domain subfolder), so create-llm-wiki stays get-or-create and never duplicates a
// concept into a second domain.
export function findLlmWikiConcept(ctx: WorkflowContext, concept: string): TFile | undefined {
  return findUniqueNoteByTitle(ctx, {
    title: concept,
    folders: [ctx.settings.paths.wikiFolder],
    type: "llm-wiki",
    label: "llm-wiki note"
  });
}

async function findZkByTitle(
  ctx: WorkflowContext,
  title: string,
  kind: ZkKind | undefined
): Promise<TFile | undefined> {
  const folders = zkSearchFolders(ctx, kind);

  if (!kind) {
    const matches = await findZkTitleMatches(ctx, title, folders);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error(`ZK note title is ambiguous: ${title}`);
  }

  for (const folder of folders) {
    const file = ctx.host.getFile(joinVaultPath(folder, `${title}.md`));
    if (file) return file;
  }

  const expectedType = kind ? zkKindCode(kind) : undefined;
  return findUniqueNoteByTitle(ctx, {
    title,
    folders,
    type: expectedType,
    typeMatch: expectedType ? undefined : isZkType,
    label: "ZK note"
  });
}

async function findZkTitleMatches(ctx: WorkflowContext, title: string, folders: string[]): Promise<TFile[]> {
  const matchesByPath = new Map<string, TFile>();
  for (const folder of folders) {
    const file = ctx.host.getFile(joinVaultPath(folder, `${title}.md`));
    if (file) matchesByPath.set(file.path, file);
  }
  for (const file of ctx.host.getMarkdownFiles()) {
    if (file.basename !== title || !folders.some((folder) => isInFolder(file, folder))) continue;
    const type = await readFileTypeFresh(ctx, file);
    if (isZkType(type)) matchesByPath.set(file.path, file);
  }
  return Array.from(matchesByPath.values());
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
    typeMatch?: (type: string) => boolean;
    requireRootArea?: boolean;
    label: string;
  }
): TFile | undefined {
  const files = ctx.host.getMarkdownFiles().filter((file) => {
    const frontmatter = fileFrontmatter(ctx, file);
    const type = readType(frontmatter);
    return options.folders.some((folder) => isInFolder(file, folder))
      && (!options.type || type === options.type)
      && (!options.typeMatch || options.typeMatch(type))
      // A nested area has a `parent`; bare-title area lookup must resolve only root areas
      // so name-based addressing stays unambiguous (nested areas are reached via *-child commands).
      && (!options.requireRootArea || frontmatterLinks(frontmatter.parent).length === 0);
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

function zkSearchFolders(ctx: WorkflowContext, kind: ZkKind | undefined): string[] {
  return kind
    ? [folderForZkKind(ctx.settings, kind)]
    : [ctx.settings.paths.sparkFolder, ctx.settings.paths.digestFolder, ctx.settings.paths.permanentFolder];
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
    requireRootArea: true,
    label: "area"
  });
}


export function childFiles(ctx: WorkflowContext, parent: TFile): TFile[] {
  const directFolder = folderStyleChildFolder(parent);
  const byPath = new Map<string, TFile>();

  for (const file of ctx.host.getMarkdownFiles()) {
    if (file.path === parent.path) continue;
    const frontmatter = fileFrontmatter(ctx, file);
    if ((directFolder && file.parent?.path === directFolder) || parentFrontmatterReferencesFile(ctx, file, frontmatter.parent, parent)) {
      byPath.set(file.path, file);
    }
  }

  return Array.from(byPath.values()).sort((left, right) => left.path.localeCompare(right.path));
}

function parentFrontmatterReferencesFile(ctx: WorkflowContext, source: TFile, value: unknown, target: TFile): boolean {
  return frontmatterLinks(value).some((link) => linkResolvesToFile(ctx, source.path, link, target));
}

function linkResolvesToFile(ctx: WorkflowContext, sourcePath: string, value: string, target: TFile): boolean {
  const linkPath = wikiLinkTarget(value) ?? markdownLinkTarget(value) ?? value;
  const resolved = resolveLinkPath(ctx, sourcePath, linkPath);
  return resolved?.path === target.path;
}

function resolveLinkPath(ctx: WorkflowContext, sourcePath: string, linkPath: string): TFile | null {
  const split = splitObsidianSubpath(linkPath);
  const withSubpath = `${split.base}${split.subpath}`;
  return ctx.host.getFirstLinkpathDest(withSubpath, sourcePath)
    ?? (split.base ? ctx.host.getFirstLinkpathDest(split.base, sourcePath) : null);
}

function wikiLinkTarget(value: string): string | undefined {
  const match = value.trim().match(/^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/);
  return match?.[1]?.trim();
}

function markdownLinkTarget(value: string): string | undefined {
  const match = value.trim().match(/^\[[^\]]+\]\(([^)]+)\)$/);
  return match?.[1]?.trim();
}

function folderStyleChildFolder(file: TFile): string | undefined {
  const parentPath = file.parent?.path ?? "";
  const parentName = folderName(parentPath);
  return parentPath && parentName === file.basename ? parentPath : undefined;
}

function findChild(ctx: WorkflowContext, parent: TFile, title: string): TFile | undefined {
  const matches = childFiles(ctx, parent).filter((file) => file.basename === title);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error("child title is ambiguous: " + title);
  return undefined;
}

// Drill from a container into a named child chain (left-to-right), one direct
// findChild hop per title. Non-transitive childFiles is why nesting must be a chain.
export function drillToChild(ctx: WorkflowContext, parent: TFile, titles: string[]): TFile {
  let current = parent;
  for (const title of titles) {
    const child = findChild(ctx, current, title);
    if (!child) throw new Error(`child not found: ${title}`);
    current = child;
  }
  return current;
}
