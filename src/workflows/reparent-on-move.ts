import { TFile, TFolder, type TAbstractFile } from "obsidian";
import { localePack } from "../i18n";
import { PARA_ZK_PATHS } from "../layout";
import { slugify, uniqueStrings } from "../text";
import { isInFolder } from "../vault/files";
import { frontmatterLinks, readFileFrontmatterFresh, readType } from "../vault/frontmatter";
import { normalizeVaultPath, parentFolder } from "../vault/paths";
import type { WorkflowContext } from "./context";
import {
  folderStyleContainer,
  linkToFile,
  nearestSubnoteParent
} from "./locations";

export type AutoReparentResult = {
  updated: Array<{
    path: string;
    type: "area" | "subnote";
    parentPath?: string;
  }>;
};

type AreaParentResolution =
  | { kind: "nested"; parent: TFile }
  | { kind: "root" }
  | { kind: "skip" };

type AreaTagPlan = {
  tags: string[];
  oldOwnNamespace?: string;
  newOwnNamespace: string;
};

export async function syncMovedChildParent(
  ctx: WorkflowContext,
  moved: TAbstractFile,
  _oldPath: string
): Promise<AutoReparentResult> {
  const updated: AutoReparentResult["updated"] = [];
  for (const file of movedMarkdownFiles(ctx, moved)) {
    const result = await syncMovedMarkdownFile(ctx, file);
    if (result) updated.push(result);
  }
  return { updated };
}

function movedMarkdownFiles(ctx: WorkflowContext, moved: TAbstractFile): TFile[] {
  if (moved instanceof TFile) {
    return /\.md$/i.test(moved.path) ? [moved] : [];
  }
  if (!(moved instanceof TFolder)) return [];

  const folder = normalizeVaultPath(moved.path);
  if (!folder) return [];
  return ctx.host.getMarkdownFiles()
    .filter((file) => isInFolder(file, folder))
    .sort((left, right) =>
      pathDepth(left.path) - pathDepth(right.path) || left.path.localeCompare(right.path));
}

function pathDepth(path: string): number {
  return normalizeVaultPath(path).split("/").filter(Boolean).length;
}

async function syncMovedMarkdownFile(
  ctx: WorkflowContext,
  file: TFile
): Promise<AutoReparentResult["updated"][number] | undefined> {
  const frontmatter = await readFileFrontmatterFresh(ctx, file);
  const type = readType(frontmatter);
  if (type === "subnote") return syncSubnoteParent(ctx, file, frontmatter.parent);
  if (type === "area") return syncAreaParent(ctx, file, frontmatter);
  return undefined;
}

async function syncSubnoteParent(
  ctx: WorkflowContext,
  file: TFile,
  currentParent: unknown
): Promise<AutoReparentResult["updated"][number] | undefined> {
  const parent = nearestSubnoteParent(ctx, parentFolder(file.path), file.path);
  if (!parent || parent.path === file.path) return undefined;
  if (parentLinksAlreadyPointTo(ctx, file, currentParent, parent)) return undefined;

  await ctx.host.processFrontMatter(file, (fm) => {
    fm.parent = linkToFile(parent);
  });
  return { path: file.path, type: "subnote", parentPath: parent.path };
}

async function syncAreaParent(
  ctx: WorkflowContext,
  file: TFile,
  frontmatter: Record<string, unknown>
): Promise<AutoReparentResult["updated"][number] | undefined> {
  const parent = await resolveAreaParent(ctx, file);
  if (parent.kind === "skip") return undefined;

  const areaTags = await areaTagPlan(ctx, file, frontmatter, parent.kind === "nested" ? parent.parent : undefined);
  const parentFile = parent.kind === "nested" ? parent.parent : undefined;
  const currentParent = frontmatter.parent;
  const parentChanged = parentFile
    ? !parentLinksAlreadyPointTo(ctx, file, currentParent, parentFile)
    : frontmatterLinks(currentParent).length > 0;
  const tagsChanged = !frontmatterStringListsEqual(frontmatterLinks(frontmatter.tags), areaTags.tags);
  if (!parentChanged && !tagsChanged) return undefined;

  await ctx.host.processFrontMatter(file, (fm) => {
    if (parentFile) {
      fm.parent = linkToFile(parentFile);
    } else {
      delete fm.parent;
    }
    fm.tags = areaTags.tags;
  });

  if (areaTags.oldOwnNamespace && areaTags.oldOwnNamespace !== areaTags.newOwnNamespace) {
    await updateAreaDescendantTagPrefix(ctx, file, areaTags.oldOwnNamespace, areaTags.newOwnNamespace);
  }

  return { path: file.path, type: "area", parentPath: parentFile?.path };
}

async function resolveAreaParent(ctx: WorkflowContext, file: TFile): Promise<AreaParentResolution> {
  if (!isInManagedAreaTree(file)) return { kind: "skip" };
  const folderStyleFolder = folderStyleContainer(file);
  if (!folderStyleFolder) return { kind: "skip" };

  const parent = nearestSubnoteParent(ctx, parentFolder(file.path), file.path);
  if (parent) {
    const parentType = readType(await readFileFrontmatterFresh(ctx, parent));
    return parentType === "area" ? { kind: "nested", parent } : { kind: "skip" };
  }

  return folderStyleFolder.parent?.path === normalizeVaultPath(PARA_ZK_PATHS.areasFolder)
    ? { kind: "root" }
    : { kind: "skip" };
}

function isInManagedAreaTree(file: TFile): boolean {
  const root = normalizeVaultPath(PARA_ZK_PATHS.areasFolder);
  const path = normalizeVaultPath(file.path);
  return path.startsWith(`${root}/`);
}

function parentLinksAlreadyPointTo(ctx: WorkflowContext, source: TFile, currentParent: unknown, target: TFile): boolean {
  const targetLinks = new Set([
    target.path,
    target.path.replace(/\.md$/i, "")
  ]);
  return frontmatterLinks(currentParent).some((link) => {
    const normalized = link.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].trim();
    if (targetLinks.has(normalized)) return true;
    return ctx.host.getFirstLinkpathDest(normalized, source.path)?.path === target.path;
  });
}

async function areaTagPlan(
  ctx: WorkflowContext,
  file: TFile,
  frontmatter: Record<string, unknown>,
  parent: TFile | undefined
): Promise<AreaTagPlan> {
  const areaPrefixes = knownAreaTagPrefixes(ctx);
  const existingTags = frontmatterLinks(frontmatter.tags);
  const isAreaTag = (tag: string) => areaPrefixes.some((prefix) => {
    const normalized = stripHashPrefix(tag);
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  });
  const nonAreaTags = existingTags.filter((tag) => !isAreaTag(tag));
  const existingAreaTags = existingTags.map(stripHashPrefix).filter((tag) =>
    areaPrefixes.some((prefix) => tag === prefix || tag.startsWith(`${prefix}/`)));
  const oldOwnNamespace = deepestTag(existingAreaTags);
  const activePrefix = localePack(ctx.settings.locale).tags.area;
  const newOwnNamespace = parent
    ? `${await areaParentNamespace(ctx, parent, activePrefix)}/${slugify(file.basename)}`
    : `${activePrefix}/${slugify(file.basename)}`;

  if (!parent) {
    return { tags: uniqueStrings([...nonAreaTags, newOwnNamespace]), oldOwnNamespace, newOwnNamespace };
  }

  const includeParentNamespace = existingAreaTags.length !== 1;
  const parentNamespace = await areaParentNamespace(ctx, parent, activePrefix);
  const tags = includeParentNamespace
    ? [parentNamespace, newOwnNamespace]
    : [newOwnNamespace];
  return { tags: uniqueStrings([...nonAreaTags, ...tags]), oldOwnNamespace, newOwnNamespace };
}

function knownAreaTagPrefixes(ctx: WorkflowContext): string[] {
  return uniqueStrings([
    localePack("en").tags.area,
    localePack("ko").tags.area,
    localePack(ctx.settings.locale).tags.area
  ]);
}

async function areaParentNamespace(ctx: WorkflowContext, parent: TFile, activePrefix: string): Promise<string> {
  const parentTags = frontmatterLinks((await readFileFrontmatterFresh(ctx, parent)).tags)
    .map(stripHashPrefix)
    .filter((tag) => knownAreaTagPrefixes(ctx).some((prefix) => tag === prefix || tag.startsWith(`${prefix}/`)));
  return deepestTag(parentTags) ?? `${activePrefix}/${slugify(parent.basename)}`;
}

function stripHashPrefix(tag: string): string {
  return tag.startsWith("#") ? tag.slice(1) : tag;
}

function deepestTag(tags: string[]): string | undefined {
  return tags.reduce<string | undefined>(
    (deepest, tag) => deepest === undefined || tag.length > deepest.length ? tag : deepest,
    undefined
  );
}

function frontmatterStringListsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

async function updateAreaDescendantTagPrefix(
  ctx: WorkflowContext,
  area: TFile,
  oldOwnNamespace: string,
  newOwnNamespace: string
): Promise<void> {
  const folder = parentFolder(area.path);
  const descendants: TFile[] = [];
  for (const file of ctx.host.getMarkdownFiles()) {
    if (file.path === area.path || !isInFolder(file, folder)) continue;
    if (readType(await readFileFrontmatterFresh(ctx, file)) === "area") descendants.push(file);
  }

  for (const descendant of descendants) {
    await ctx.host.processFrontMatter(descendant, (fm) => {
      const existing = frontmatterLinks(fm.tags);
      if (existing.length === 0) return;
      const next = existing.map((tag) => rewriteTagNamespace(tag, oldOwnNamespace, newOwnNamespace));
      fm.tags = uniqueStrings(next);
    });
  }
}

function rewriteTagNamespace(tag: string, oldNamespace: string, newNamespace: string): string {
  const prefixed = tag.startsWith("#");
  const normalized = stripHashPrefix(tag);
  if (normalized !== oldNamespace && !normalized.startsWith(`${oldNamespace}/`)) return tag;
  const rewritten = `${newNamespace}${normalized.slice(oldNamespace.length)}`;
  return prefixed ? `#${rewritten}` : rewritten;
}
