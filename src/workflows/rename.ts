import { TFile } from "obsidian";
import { localePack } from "../i18n";
import { frontmatterLinks, fileFrontmatter, readType, type Frontmatter } from "../vault/frontmatter";
import { ensureFolder, isInFolder, parentFolder } from "../vault/files";
import { joinVaultPath, sanitizeFileName } from "../vault/paths";
import { slugify, uniqueStrings } from "../text";
import type { RenameByTitleOptions, RenameResult, RenameZkOptions, WorkflowContext } from "./context";
import {
  assertVacantPath,
  drillToChild,
  folderName,
  folderStyleContainer,
  requireTitle,
  resolveRequiredArea,
  resolveRequiredProject,
  resolveRequiredResource,
  resolveRequiredZk
} from "./locations";
import { stringReferencesAnyTarget } from "./references";

export async function renameProject(ctx: WorkflowContext, options: RenameByTitleOptions): Promise<RenameResult> {
  const container = await resolveRequiredProject(ctx, options);
  const newTitle = requireTitle(options.newTitle, "new_title");
  if (options.child && options.child.length > 0) return renameChildTarget(ctx, container, options.child, newTitle);
  return renameFolderStyleNote(ctx, container, newTitle, "project");
}

export async function renameArea(ctx: WorkflowContext, options: RenameByTitleOptions): Promise<RenameResult> {
  const container = await resolveRequiredArea(ctx, options);
  const newTitle = requireTitle(options.newTitle, "new_title");
  if (options.child && options.child.length > 0) return renameChildTarget(ctx, container, options.child, newTitle);
  return renameFolderStyleNote(ctx, container, newTitle, "area");
}

export async function renameResource(ctx: WorkflowContext, options: RenameByTitleOptions): Promise<RenameResult> {
  return renameFlatNote(
    ctx,
    await resolveRequiredResource(ctx, options),
    requireTitle(options.newTitle, "new_title"),
    "resource"
  );
}

export async function renameZk(ctx: WorkflowContext, options: RenameZkOptions): Promise<RenameResult> {
  return renameFlatNote(
    ctx,
    await resolveRequiredZk(ctx, options),
    requireTitle(options.newTitle, "new_title"),
    "knowledge"
  );
}

// A child reached via child= can be a flat subnote or a folder-style nested area;
// dispatch by the resolved note's stored type.
async function renameChildTarget(
  ctx: WorkflowContext,
  container: TFile,
  child: string[],
  newTitle: string
): Promise<RenameResult> {
  const file = drillToChild(ctx, container, child);
  const type = readType(fileFrontmatter(ctx, file));
  if (type === "project" || type === "area") {
    return renameFolderStyleNote(ctx, file, newTitle, type === "project" ? "project" : "area");
  }
  return renameFlatNote(ctx, file, newTitle, type === "resource" ? "resource" : "knowledge");
}

type TagDomain = "project" | "area" | "resource" | "knowledge";

async function renameFolderStyleNote(
  ctx: WorkflowContext,
  file: TFile,
  newTitle: string,
  tagDomain: TagDomain
): Promise<RenameResult> {
  const fromTitle = file.basename;
  const fromPath = file.path;
  if (fromTitle === newTitle) {
    return {
      path: file.path,
      title: file.basename,
      changed: false,
      fromPath,
      toPath: file.path,
      fromTitle,
      toTitle: newTitle
    };
  }

  const retroPlans = await dependentRetroRenamePlans(ctx, file, tagDomain, newTitle);
  const folder = folderStyleContainer(file);
  let renamed: TFile;
  let toPath: string;
  if (folder) {
    const targetFolder = joinVaultPath(parentFolder(folder.path), newTitle);
    toPath = joinVaultPath(targetFolder, `${newTitle}.md`);
    assertVacantPath(ctx, targetFolder);
    const conflictingFile = ctx.host.getAbstractFile(joinVaultPath(folder.path, `${newTitle}.md`));
    if (conflictingFile && conflictingFile !== file) {
      throw new Error(`target already exists: ${joinVaultPath(folder.path, `${newTitle}.md`)}`);
    }
    await ctx.host.renameFile(folder, targetFolder);

    renamed = ctx.host.getFile(toPath) ?? await renameMovedFolderStyleMain(ctx, targetFolder, file.name, toPath);
  } else {
    toPath = joinVaultPath(parentFolder(file.path), `${newTitle}.md`);
    assertVacantPath(ctx, toPath);
    await ctx.host.renameFile(file, toPath);
    renamed = ctx.host.getFile(toPath) ?? file;
  }

  const tagUpdate = await updateTitleDerivedTag(ctx, renamed, tagDomain, fromTitle, newTitle);
  if (tagDomain === "area" && folder) {
    await updateAreaDescendantTagPrefixes(ctx, toPath, tagUpdate.namespaceMoves);
  }
  const renamedRetros = await renameDependentRetros(ctx, retroPlans);
  return {
    path: toPath,
    title: newTitle,
    changed: true,
    fromPath,
    toPath,
    fromTitle,
    toTitle: newTitle,
    ...(renamedRetros.length > 0 ? { renamedRetros } : {})
  };
}

type DependentRetroRenamePlan = {
  fromPath: string;
  toPath: string;
};

async function dependentRetroRenamePlans(
  ctx: WorkflowContext,
  source: TFile,
  domain: TagDomain,
  newTitle: string
): Promise<DependentRetroRenamePlan[]> {
  if (domain !== "project" && domain !== "area") return [];

  const plans: DependentRetroRenamePlan[] = [];
  const seenTargets = new Set<string>();
  for (const file of ctx.host.getMarkdownFiles()) {
    const frontmatter = fileFrontmatter(ctx, file);
    if (readType(frontmatter) !== "retro") continue;
    if (!isSourceScopedRetro(ctx, file, frontmatter, source, domain)) continue;

    const weekSegment = retroWeekSegment(file, frontmatter);
    if (!weekSegment) continue;
    if (!isDefaultSourceRetroFilename(ctx, file.basename, domain, source.basename, weekSegment)) continue;

    const toPath = joinVaultPath(parentFolder(file.path), `${defaultSourceRetroBasename(ctx, domain, newTitle, weekSegment)}.md`);
    if (toPath === file.path) continue;
    if (seenTargets.has(toPath)) throw new Error(`duplicate dependent retro target: ${toPath}`);
    seenTargets.add(toPath);

    const existing = ctx.host.getAbstractFile(toPath);
    if (existing && existing !== file) throw new Error(`target already exists: ${toPath}`);
    plans.push({
      fromPath: file.path,
      toPath
    });
  }

  return plans.sort((left, right) => left.fromPath.localeCompare(right.fromPath));
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

function defaultSourceRetroBasename(
  ctx: WorkflowContext,
  domain: "project" | "area",
  title: string,
  weekSegment: string
): string {
  return sanitizeFileName(`Retro-${sourceRetroNamePrefix(ctx, domain)}-${title}-${weekSegment}`);
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

async function renameDependentRetros(
  ctx: WorkflowContext,
  plans: DependentRetroRenamePlan[]
): Promise<Array<{ fromPath: string; toPath: string }>> {
  const renamed: Array<{ fromPath: string; toPath: string }> = [];
  for (const plan of plans) {
    const file = ctx.host.getFile(plan.fromPath);
    if (!file) continue;
    await ensureFolder(ctx.host, parentFolder(plan.toPath));
    await ctx.host.renameFile(file, plan.toPath);
    const moved = ctx.host.getFile(plan.toPath);
    if (!moved) throw new Error(`failed to rename dependent retro ${plan.fromPath} to ${plan.toPath}`);
    renamed.push({
      fromPath: plan.fromPath,
      toPath: plan.toPath
    });
  }
  return renamed;
}

async function renameMovedFolderStyleMain(
  ctx: WorkflowContext,
  targetFolder: string,
  oldFileName: string,
  toPath: string
): Promise<TFile> {
  const movedPath = joinVaultPath(targetFolder, oldFileName);
  const movedMain = ctx.host.getFile(movedPath);
  if (!movedMain) throw new Error(`failed to find moved note at ${movedPath}`);

  assertVacantPath(ctx, toPath);
  await ctx.host.renameFile(movedMain, toPath);
  return ctx.host.getFile(toPath) ?? movedMain;
}

async function renameFlatNote(
  ctx: WorkflowContext,
  file: TFile,
  newTitle: string,
  tagDomain: TagDomain
): Promise<RenameResult> {
  const fromTitle = file.basename;
  const fromPath = file.path;
  if (fromTitle === newTitle) {
    return {
      path: file.path,
      title: file.basename,
      changed: false,
      fromPath,
      toPath: file.path,
      fromTitle,
      toTitle: newTitle
    };
  }

  const toPath = joinVaultPath(parentFolder(file.path), `${newTitle}.md`);
  assertVacantPath(ctx, toPath);
  await ctx.host.renameFile(file, toPath);
  const renamed = ctx.host.getFile(toPath) ?? file;
  await updateTitleDerivedTag(ctx, renamed, tagDomain, fromTitle, newTitle);
  return {
    path: toPath,
    title: newTitle,
    changed: true,
    fromPath,
    toPath,
    fromTitle,
    toTitle: newTitle
  };
}

async function updateTitleDerivedTag(
  ctx: WorkflowContext,
  file: TFile,
  domain: TagDomain,
  fromTitle: string,
  title: string
): Promise<{ namespaceMoves: TagNamespaceMove[] }> {
  const activeTagPrefix = localePack(ctx.settings.locale).tags[domain];
  const knownPrefixes = uniqueStrings([
    localePack("en").tags[domain],
    localePack("ko").tags[domain],
    activeTagPrefix
  ]);
  const nextTag = `${activeTagPrefix}/${slugify(title)}`;
  const namespaceMoves: TagNamespaceMove[] = [];

  await ctx.host.processFrontMatter(file, (fm) => {
    const existing = frontmatterLinks(fm.tags);
    let replaced = false;
    const next = existing.map((tag) => {
      const normalized = tag.startsWith("#") ? tag.slice(1) : tag;
      if (knownPrefixes.some((prefix) => normalized.startsWith(`${prefix}/`))) {
        const renamed = renamedTitleTag(normalized, knownPrefixes, activeTagPrefix, fromTitle, title);
        if (renamed.changed) {
          replaced = true;
          namespaceMoves.push({
            from: normalized,
            to: renamed.tag
          });
        }
        return tag.startsWith("#") && renamed.tag !== normalized ? `#${renamed.tag}` : renamed.tag;
      }
      return tag;
    });
    if (!replaced) next.push(nextTag);
    fm.tags = uniqueStrings(next);
  });

  return {
    namespaceMoves: uniqueTagNamespaceMoves(namespaceMoves)
  };
}

function renamedTitleTag(
  tag: string,
  knownPrefixes: string[],
  activeTagPrefix: string,
  fromTitle: string,
  title: string
): { tag: string; changed: boolean } {
  const oldTitleSlug = slugify(fromTitle);
  const titleSlug = slugify(title);
  const matchingPrefix = knownPrefixes.find((prefix) => tag.startsWith(`${prefix}/`));
  if (!matchingPrefix) return { tag, changed: false };

  const rest = tag.slice(matchingPrefix.length + 1).split("/").filter(Boolean);
  if (rest.at(-1) !== oldTitleSlug) {
    return { tag, changed: false };
  }
  const parentPath = rest.slice(0, -1).join("/");
  const renamed = parentPath ? `${activeTagPrefix}/${parentPath}/${titleSlug}` : `${activeTagPrefix}/${titleSlug}`;
  return {
    tag: renamed,
    changed: renamed !== tag
  };
}

type TagNamespaceMove = {
  from: string;
  to: string;
};

function uniqueTagNamespaceMoves(moves: TagNamespaceMove[]): TagNamespaceMove[] {
  const seen = new Set<string>();
  const result: TagNamespaceMove[] = [];
  for (const move of moves) {
    const key = `${move.from}\u0000${move.to}`;
    if (move.from === move.to || seen.has(key)) continue;
    seen.add(key);
    result.push(move);
  }
  return result;
}

async function updateAreaDescendantTagPrefixes(
  ctx: WorkflowContext,
  renamedAreaPath: string,
  namespaceMoves: TagNamespaceMove[]
): Promise<void> {
  if (namespaceMoves.length === 0) return;

  const folder = parentFolder(renamedAreaPath);
  const descendants = ctx.host.getMarkdownFiles().filter((file) => {
    return file.path !== renamedAreaPath
      && isInFolder(file, folder)
      && readType(fileFrontmatter(ctx, file)) === "area";
  });

  for (const descendant of descendants) {
    await ctx.host.processFrontMatter(descendant, (fm) => {
      const existing = frontmatterLinks(fm.tags);
      if (existing.length === 0) return;
      const next = existing.map((tag) => renameTagNamespace(tag, namespaceMoves));
      fm.tags = uniqueStrings(next);
    });
  }
}

function renameTagNamespace(tag: string, namespaceMoves: TagNamespaceMove[]): string {
  const prefixed = tag.startsWith("#");
  const normalized = prefixed ? tag.slice(1) : tag;
  for (const move of namespaceMoves) {
    if (normalized !== move.from && !normalized.startsWith(`${move.from}/`)) continue;
    const renamed = `${move.to}${normalized.slice(move.from.length)}`;
    return prefixed ? `#${renamed}` : renamed;
  }
  return tag;
}
