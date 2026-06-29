import { TFile } from "obsidian";
import { localePack } from "../i18n";
import { PARA_ZK_PATHS } from "../layout";
import { frontmatterLinks, fileFrontmatter, readType, type Frontmatter } from "../vault/frontmatter";
import { ensureFolder, isInFolder } from "../vault/files";
import { joinVaultPath, normalizeVaultPath, parentFolder, sanitizeFileName, sanitizeVaultRelativePath } from "../vault/paths";
import { slugify, uniqueStrings } from "../text";
import type {
  RefileLlmWikiOptions,
  RefileLlmWikiResult,
  RenameByTitleOptions,
  RenameLlmWikiOptions,
  RenameResult,
  RenameZkOptions,
  WorkflowContext
} from "./context";
import { ensureLlmWikiDomainIndex } from "./create";
import {
  assertVacantPath,
  drillToChild,
  folderName,
  folderStyleContainer,
  requireTitle,
  resolveRequiredArea,
  resolveRequiredLlmWiki,
  resolveRequiredProject,
  resolveRequiredResource,
  resolveRequiredZk
} from "./locations";
import { isSourceScopedRetro } from "./references";

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
  const newTitleSegments = sanitizeVaultRelativePath(options.newTitle, "new_title");
  if (newTitleSegments.length > 1) {
    throw new Error("new_title for rename-resource must be a bare basename. Moving a resource between folders is a link-safe file move handled by the Obsidian/optsidian native CLI (rename/move), not rename-resource; rename-resource only changes the name in place.");
  }
  return renameFlatNote(
    ctx,
    await resolveRequiredResource(ctx, options),
    newTitleSegments[0],
    "resource"
  );
}

export async function renameLlmWiki(ctx: WorkflowContext, options: RenameLlmWikiOptions): Promise<RenameResult> {
  const file = await resolveRequiredLlmWiki(ctx, options);
  const newTitle = llmWikiRenameTargetTitle(file, options.newTitle);
  if (newTitle.toLowerCase() === "index" && newTitle !== "index") {
    throw new Error('llm-wiki domain hub must be named "index" exactly; use new_title=index');
  }
  return renameFlatNote(
    ctx,
    file,
    newTitle,
    "llm-wiki"
  );
}

export async function refileLlmWiki(ctx: WorkflowContext, options: RefileLlmWikiOptions): Promise<RefileLlmWikiResult> {
  rejectLlmWikiIndexRefileSelector(options);
  const file = await resolveRequiredLlmWiki(ctx, options);
  if (isLlmWikiIndexBasename(file.basename)) {
    throw new Error("llm-wiki domain hubs cannot be refiled; create or update the target <domain>/index hub instead.");
  }
  const targetDomain = llmWikiTargetDomain(options.domain);
  const fromPath = file.path;
  const fromDomain = llmWikiDomainFromPath(file.path);
  const toPath = joinVaultPath(PARA_ZK_PATHS.wikiFolder, `${targetDomain}/${file.name}`);
  if (toPath !== fromPath) assertVacantPath(ctx, toPath);

  const createdIndex = await ensureLlmWikiDomainIndex(ctx, targetDomain, options.by);
  let targetFile = file;
  const moved = toPath !== fromPath;
  if (moved) {
    await ensureFolder(ctx.host, parentFolder(toPath));
    await ctx.host.renameFile(file, toPath);
    const renamed = ctx.host.getFile(toPath);
    if (!renamed) throw new Error(`failed to refile llm-wiki note ${fromPath} to ${toPath}`);
    targetFile = renamed;
  }

  const tagChanged = await updateLlmWikiDomainTag(ctx, targetFile, targetDomain);
  return {
    path: toPath,
    title: targetFile.basename,
    changed: moved || tagChanged || createdIndex,
    fromPath,
    toPath,
    fromDomain,
    toDomain: targetDomain,
    createdIndex,
    tagChanged
  };
}

function rejectLlmWikiIndexRefileSelector(options: RefileLlmWikiOptions): void {
  if (options.title !== undefined) {
    const segments = sanitizeVaultRelativePath(options.title, "title");
    if (isLlmWikiIndexBasename(segments.at(-1) ?? "")) {
      throw new Error("llm-wiki domain hubs cannot be refiled; create or update the target <domain>/index hub instead.");
    }
  }

  if (options.path !== undefined) {
    const basename = normalizeVaultPath(options.path).split("/").at(-1)?.replace(/\.md$/i, "") ?? "";
    if (isLlmWikiIndexBasename(basename)) {
      throw new Error("llm-wiki domain hubs cannot be refiled; create or update the target <domain>/index hub instead.");
    }
  }
}

function isLlmWikiIndexBasename(value: string): boolean {
  return value.trim().toLowerCase() === "index";
}

function llmWikiRenameTargetTitle(file: TFile, newTitleValue: string | undefined): string {
  const newTitleSegments = sanitizeVaultRelativePath(newTitleValue, "new_title");
  if (newTitleSegments.length === 1) return newTitleSegments[0];
  if (newTitleSegments.length === 2) {
    const [domain, concept] = newTitleSegments;
    const currentDomain = llmWikiDomainFromPath(file.path);
    if (domain === currentDomain) return concept;
    throw new Error(
      `new_title changes the llm-wiki domain from ${currentDomain ?? "(none)"} to ${domain}; use para-zk:refile-llm-wiki title="${llmWikiTitleForError(file)}" domain="${domain}" to move between domains.`
    );
  }
  throw new Error(
    'new_title for rename-llm-wiki must be a bare basename or the current-domain path "<domain>/<concept>"; use para-zk:refile-llm-wiki to move between domains.'
  );
}

function llmWikiTargetDomain(value: string | undefined): string {
  const segments = sanitizeVaultRelativePath(value, "domain");
  if (segments.length !== 1) {
    throw new Error("domain for refile-llm-wiki must be exactly one path segment.");
  }
  return segments[0];
}

function llmWikiDomainFromPath(path: string): string | undefined {
  const root = `${PARA_ZK_PATHS.wikiFolder}/`;
  const normalized = normalizeVaultPath(path);
  if (!normalized.startsWith(root)) return undefined;
  const segments = normalized.slice(root.length).split("/");
  return segments.length >= 2 ? segments[0] : undefined;
}

function llmWikiTitleForError(file: TFile): string {
  const domain = llmWikiDomainFromPath(file.path);
  return domain ? `${domain}/${file.basename}` : file.basename;
}

async function updateLlmWikiDomainTag(ctx: WorkflowContext, file: TFile, domain: string): Promise<boolean> {
  const prefix = localePack(ctx.settings.locale).tags.llmWiki;
  const expected = `${prefix}/${slugify(domain)}`;
  let changed = false;
  await ctx.host.processFrontMatter(file, (fm) => {
    const current = frontmatterLinks(fm.tags);
    const others = current.filter((tag) => {
      const normalized = tag.startsWith("#") ? tag.slice(1) : tag;
      return normalized !== prefix && !normalized.startsWith(`${prefix}/`);
    });
    const next = uniqueStrings([...others, expected]);
    if (next.length !== current.length || next.some((tag, index) => tag !== current[index])) {
      fm.tags = next;
      changed = true;
    }
  });
  return changed;
}

export async function renameZk(ctx: WorkflowContext, options: RenameZkOptions): Promise<RenameResult> {
  return renameFlatNote(
    ctx,
    await resolveRequiredZk(ctx, options),
    requireTitle(options.newTitle, "new_title"),
    "knowledge"
  );
}

// A child reached via the *-child CLI family can be a flat subnote or a folder-style nested area;
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

type TagDomain = "project" | "area" | "resource" | "knowledge" | "llm-wiki";

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
  const activeTagPrefix = tagPrefixForDomain(ctx.settings.locale, domain);
  const knownPrefixes = uniqueStrings([
    tagPrefixForDomain("en", domain),
    tagPrefixForDomain("ko", domain),
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
    // Only folder-style notes carry a title-derived identity tag, so only they synthesize one
    // when none was rewritten. resource/llm-wiki tags classify by group (or are absent on ZK),
    // so a rename must leave those untouched rather than mint a per-title tag.
    if (!replaced && isTitleDerivedTagDomain(domain)) next.push(nextTag);
    fm.tags = uniqueStrings(next);
  });

  return {
    namespaceMoves: uniqueTagNamespaceMoves(namespaceMoves)
  };
}

function tagPrefixForDomain(locale: "en" | "ko", domain: TagDomain): string {
  const tags = localePack(locale).tags;
  return domain === "llm-wiki" ? tags.llmWiki : tags[domain];
}

// Folder-style notes (project/area) tag by their own title, so a rename re-derives the tag.
// resource/llm-wiki tags classify by group and ZK notes carry none — a rename preserves them.
function isTitleDerivedTagDomain(domain: TagDomain): boolean {
  return domain === "project" || domain === "area";
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
