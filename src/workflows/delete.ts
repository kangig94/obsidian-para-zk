import { TAbstractFile, TFile, TFolder } from "obsidian";
import { hasOwn, isRecord } from "../records";
import { fileFrontmatter, readType } from "../vault/frontmatter";
import { isInFolder, uniqueFiles } from "../vault/files";
import { uniqueStrings } from "../text";
import type {
  DeleteByTitleOptions,
  DeleteCleanupResult,
  DeleteJournalOptions,
  DeleteResult,
  DeleteRetroOptions,
  DeleteZkOptions,
  IncomingLink,
  WorkflowContext
} from "./context";
import {
  folderStyleContainer,
  resolveRequiredArea,
  resolveRequiredJournal,
  resolveRequiredProject,
  resolveRequiredResource,
  resolveRequiredRetro,
  resolveRequiredZk
} from "./locations";
import { stringReferencesAnyTarget } from "./references";
import { readTaskShardFile } from "./tasks";

export async function deleteProject(ctx: WorkflowContext, options: DeleteByTitleOptions): Promise<DeleteResult> {
  return deleteDomainNote(ctx, await resolveRequiredProject(ctx, options), options);
}

export async function deleteArea(ctx: WorkflowContext, options: DeleteByTitleOptions): Promise<DeleteResult> {
  return deleteDomainNote(ctx, await resolveRequiredArea(ctx, options), options);
}

export async function deleteResource(ctx: WorkflowContext, options: DeleteByTitleOptions): Promise<DeleteResult> {
  return deleteDomainNote(ctx, await resolveRequiredResource(ctx, options), options);
}

export async function deleteZk(ctx: WorkflowContext, options: DeleteZkOptions): Promise<DeleteResult> {
  return deleteDomainNote(ctx, await resolveRequiredZk(ctx, options), options);
}

export async function deleteJournal(ctx: WorkflowContext, options: DeleteJournalOptions): Promise<DeleteResult> {
  return deleteDomainNote(ctx, await resolveRequiredJournal(ctx, options), options);
}

export async function deleteRetro(ctx: WorkflowContext, options: DeleteRetroOptions): Promise<DeleteResult> {
  return deleteDomainNote(ctx, await resolveRequiredRetro(ctx, options), options);
}

async function deleteDomainNote(
  ctx: WorkflowContext,
  file: TFile,
  options: { force?: boolean }
): Promise<DeleteResult> {
  const type = readType(fileFrontmatter(ctx, file));
  const container = deleteContainer(ctx, file);
  const containerPath = container.path;
  const deletedFiles = deletedMarkdownFiles(ctx, container);
  const containerPaths = collectAbstractPaths(container);
  const taskShards = await taskShardsForDeletedFiles(ctx, deletedFiles);
  const deletedPaths = uniqueStrings([
    ...containerPaths,
    ...taskShards.map((shard) => shard.path)
  ]);
  const deletedPathSet = new Set(deletedPaths);
  const deletedFilePaths = new Set(deletedFiles.map((item) => item.path));
  const extraPaths = containerPaths.filter((path) => path !== containerPath && path !== file.path);
  if (extraPaths.length > 0 && !options.force) {
    throw new Error(`delete target contains child files; pass force=true to delete: ${extraPaths.join(", ")}`);
  }

  const incomingLinks = incomingLinksForPaths(ctx, deletedFilePaths, deletedPathSet);
  const cleaned = await cleanupStructuredReferences(ctx, deletedFiles, deletedPathSet);
  const trashMethod = await trashAbstractFile(ctx, container);
  for (const shard of taskShards) {
    if (ctx.host.getAbstractFile(shard.path)) await trashAbstractFile(ctx, shard);
  }

  return {
    path: file.path,
    title: file.basename,
    type,
    deleted: true,
    trashed: true,
    trashMethod,
    containerPath,
    deletedPaths,
    incomingLinks,
    cleaned
  };
}

function deleteContainer(ctx: WorkflowContext, file: TFile): TAbstractFile {
  const type = readType(fileFrontmatter(ctx, file));
  if (type !== "project" && type !== "area") return file;
  return folderStyleContainer(file) ?? file;
}

function collectAbstractPaths(file: TAbstractFile): string[] {
  if (file instanceof TFile) return [file.path];
  if (!(file instanceof TFolder)) return [file.path];
  const paths = [file.path];
  for (const child of file.children) {
    paths.push(...collectAbstractPaths(child));
  }
  return paths;
}

function deletedMarkdownFiles(ctx: WorkflowContext, container: TAbstractFile): TFile[] {
  if (container instanceof TFile) return [container];
  return ctx.host.getMarkdownFiles().filter((file) => isInFolder(file, container.path));
}

async function taskShardsForDeletedFiles(ctx: WorkflowContext, files: TFile[]): Promise<TFile[]> {
  const shards: TFile[] = [];
  for (const file of files) {
    const shard = await readTaskShardFile(ctx, file);
    if (shard) shards.push(shard);
  }
  return uniqueFiles(shards);
}

async function trashAbstractFile(ctx: WorkflowContext, file: TAbstractFile): Promise<string> {
  if (typeof ctx.host.trashFile === "function") {
    await ctx.host.trashFile(file);
    return "fileManager.trashFile";
  }

  await ctx.host.trash(file, false);
  return "vault.trash.local";
}

function incomingLinksForPaths(
  ctx: WorkflowContext,
  targetPaths: Set<string>,
  deletedPathSet: Set<string>
): IncomingLink[] {
  const resolvedLinks = ctx.host.resolvedLinks();
  const incoming: IncomingLink[] = [];
  for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
    if (deletedPathSet.has(sourcePath)) continue;
    for (const [targetPath, count] of Object.entries(targets)) {
      if (!targetPaths.has(targetPath)) continue;
      incoming.push({
        sourcePath,
        targetPath,
        count
      });
    }
  }
  return incoming.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath)
    || left.targetPath.localeCompare(right.targetPath));
}

async function cleanupStructuredReferences(
  ctx: WorkflowContext,
  targets: TFile[],
  deletedPathSet: Set<string>
): Promise<DeleteCleanupResult> {
  return {
    frontmatter: await cleanupFrontmatterReferences(ctx, targets, deletedPathSet),
    references: await cleanupReferenceFrontmatterItems(ctx, targets, deletedPathSet)
  };
}

async function cleanupFrontmatterReferences(
  ctx: WorkflowContext,
  targets: TFile[],
  deletedPathSet: Set<string>
): Promise<number> {
  let changedKeys = 0;
  const keys = ["areas", "project", "parent", "promoted_to"];
  for (const file of ctx.host.getMarkdownFiles()) {
    if (deletedPathSet.has(file.path)) continue;
    const frontmatter = fileFrontmatter(ctx, file);
    if (!keys.some((key) => frontmatterNeedsTargetCleanup(ctx, file.path, frontmatter[key], targets))) continue;
    await ctx.host.processFrontMatter(file, (fm) => {
      for (const key of keys) {
        if (!hasOwn(fm, key)) continue;
        const next = removeTargetFrontmatterLinks(ctx, file.path, fm[key], targets);
        if (!next.changed) continue;
        changedKeys += 1;
        if (next.value === undefined) {
          delete fm[key];
        } else {
          fm[key] = next.value;
        }
      }
    });
  }
  return changedKeys;
}

function frontmatterNeedsTargetCleanup(
  ctx: WorkflowContext,
  sourcePath: string,
  value: unknown,
  targets: TFile[]
): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => typeof item === "string" && stringReferencesAnyTarget(ctx, sourcePath, item, targets));
  }
  return typeof value === "string" && stringReferencesAnyTarget(ctx, sourcePath, value, targets);
}

function removeTargetFrontmatterLinks(
  ctx: WorkflowContext,
  sourcePath: string,
  value: unknown,
  targets: TFile[]
): { changed: boolean; value?: unknown } {
  if (Array.isArray(value)) {
    const next = value.filter((item) => {
      return typeof item !== "string" || !stringReferencesAnyTarget(ctx, sourcePath, item, targets);
    });
    if (next.length === value.length) return { changed: false, value };
    return {
      changed: true,
      value: next.length > 0 ? next : undefined
    };
  }

  if (typeof value === "string" && stringReferencesAnyTarget(ctx, sourcePath, value, targets)) {
    return { changed: true };
  }
  return { changed: false, value };
}

async function cleanupReferenceFrontmatterItems(
  ctx: WorkflowContext,
  targets: TFile[],
  deletedPathSet: Set<string>
): Promise<number> {
  let removed = 0;
  for (const file of ctx.host.getMarkdownFiles()) {
    if (deletedPathSet.has(file.path)) continue;
    const frontmatter = fileFrontmatter(ctx, file);
    if (!Array.isArray(frontmatter.references)) continue;
    if (!frontmatter.references.some((item) => referenceFrontmatterItemReferencesAnyTarget(ctx, file.path, item, targets))) continue;

    await ctx.host.processFrontMatter(file, (fm) => {
      const current = Array.isArray(fm.references) ? fm.references : [];
      const next: unknown[] = [];
      for (const item of current) {
        if (referenceFrontmatterItemReferencesAnyTarget(ctx, file.path, item, targets)) {
          removed += 1;
        } else {
          next.push(item);
        }
      }
      if (next.length > 0) {
        fm.references = next;
      } else {
        delete fm.references;
      }
    });
  }
  return removed;
}

function referenceFrontmatterItemReferencesAnyTarget(
  ctx: WorkflowContext,
  sourcePath: string,
  item: unknown,
  targets: TFile[]
): boolean {
  if (typeof item === "string") return stringReferencesAnyTarget(ctx, sourcePath, item, targets);
  if (!isRecord(item) || typeof item.link !== "string") return false;
  return stringReferencesAnyTarget(ctx, sourcePath, item.link, targets);
}
