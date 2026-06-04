import { TFolder, type App, type TFile } from "obsidian";
import type { ParaZkSettings, PromotionZkKind, ZkKind } from "../types";
import { ensureFolder } from "../vault/files";
import { joinVaultPath, normalizeVaultPath } from "../vault/paths";

type NoteLocationContext = {
  app: App;
  settings: ParaZkSettings;
};

export function folderStyleContainer(file: TFile): TFolder | undefined {
  const folder = file.parent;
  return folder && folder.name === file.basename ? folder : undefined;
}

export function assertVacantPath(ctx: NoteLocationContext, path: string): void {
  const normalized = normalizeVaultPath(path);
  if (ctx.app.vault.getAbstractFileByPath(normalized)) {
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

export async function ensureFolderStyleParent(ctx: NoteLocationContext, file: TFile): Promise<{
  file: TFile;
  childFolder: string;
}> {
  const parentPath = file.parent?.path ?? "";
  const parentName = parentPath.split("/").filter(Boolean).pop() ?? "";
  const isFolderStyle = parentPath.length > 0 && parentName === file.basename;
  const childFolder = isFolderStyle ? parentPath : joinVaultPath(parentPath, file.basename);
  await ensureFolder(ctx.app, childFolder);

  if (isFolderStyle) {
    return { file, childFolder };
  }

  const newPath = joinVaultPath(childFolder, `${file.basename}.md`);
  const existing = ctx.app.vault.getAbstractFileByPath(newPath);
  if (existing && existing !== file) {
    throw new Error(`cannot move ${file.path}; ${newPath} already exists`);
  }
  if (normalizeVaultPath(file.path) !== newPath) {
    await ctx.app.fileManager.renameFile(file, newPath);
  }

  const moved = ctx.app.vault.getFileByPath(newPath);
  if (!moved) throw new Error(`failed to move ${file.path} to ${newPath}`);
  return { file: moved, childFolder };
}

export async function uniqueMarkdownPath(app: App, path: string): Promise<string> {
  const normalized = ensureMdPath(path);
  if (!app.vault.getAbstractFileByPath(normalized)) return normalized;

  const dot = normalized.toLowerCase().lastIndexOf(".md");
  const base = dot >= 0 ? normalized.slice(0, dot) : normalized;
  let index = 1;
  let candidate = "";
  do {
    candidate = `${base} ${index}.md`;
    index += 1;
  } while (app.vault.getAbstractFileByPath(candidate));
  return candidate;
}

export function uniqueFolderStyleMarkdownPath(
  ctx: NoteLocationContext,
  rootFolder: string,
  title: string
): { title: string; folder: string; path: string } {
  let index = 0;
  while (true) {
    const candidateTitle = index === 0 ? title : `${title} ${index}`;
    const folder = joinVaultPath(rootFolder, candidateTitle);
    const path = joinVaultPath(folder, `${candidateTitle}.md`);
    const titleExists = ctx.app.vault.getMarkdownFiles().some((file) =>
      file.basename === candidateTitle
      && isDomainNotePathUnderRoot(file, rootFolder)
    );
    if (
      !titleExists
      && !ctx.app.vault.getAbstractFileByPath(folder)
      && !ctx.app.vault.getAbstractFileByPath(path)
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

export function archiveAwareFolders(
  ctx: NoteLocationContext,
  activeFolder: string,
  archived: boolean | undefined
): string[] {
  const active = normalizeVaultPath(activeFolder);
  const archive = archivedCounterpartFolder(ctx, active);
  if (archived === true) return [archive];
  if (archived === false) return [active];
  return [active, archive];
}

export function archivedCounterpartFolder(ctx: NoteLocationContext, activeFolder: string): string {
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

export function folderStyleCanonicalPaths(folder: string, title: string): string[] {
  return [
    joinVaultPath(folder, title, `${title}.md`),
    joinVaultPath(folder, `${title}.md`)
  ];
}

export function isArchivedFile(ctx: NoteLocationContext, file: TFile): boolean {
  const archiveRoot = normalizeVaultPath(ctx.settings.paths.archivesFolder);
  const normalized = normalizeVaultPath(file.path);
  return normalized === archiveRoot || normalized.startsWith(`${archiveRoot}/`);
}

export function isArchivedPath(ctx: NoteLocationContext, path: string): boolean {
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
