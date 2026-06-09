import { TFile } from "obsidian";
import { localePack } from "../i18n";
import { renderTemplate, type TemplateName } from "../templates";
import {
  dateFromCli,
  isoWeekInfo,
  localDate,
  localDateTimeSpace
} from "../time";
import type { NoteResult, ZkKind } from "../types";
import { frontmatterLinks, parseFrontmatterFromContent, readFileFrontmatterFresh, yamlScalar } from "../vault/frontmatter";
import { ensureFolder, parentFolder } from "../vault/files";
import { joinVaultPath, sanitizeFileName, wikiLink } from "../vault/paths";
import { setEditableBody } from "../vault/sections";
import {
  MATURITY_CODE_HELP,
  PRIORITY_CODE_HELP,
  PROJECT_STATUS_CODE_HELP,
  RESOURCE_KIND_CODE_HELP,
  SUBNOTE_TYPE_CODE_HELP,
  parseMaturityCode,
  parsePriorityCode,
  parseProjectStatusCode,
  parseResourceKindCode,
  parseSubnoteTypeCode,
  type MaturityCode
} from "../vocabulary";
import { ZK_KIND_CODE_HELP, parseZkKind, zkKindCode } from "../zk/kinds";
import { escapeRegExp, singleItemList, slugify, uniqueStrings } from "../text";
import { readOptionalCode } from "./code-options";
import type {
  CreateAreaOptions,
  CreateAreaResult,
  CreateProjectOptions,
  CreateProjectResult,
  CreateResourceOptions,
  CreateResourceResult,
  CreateRetroOptions,
  CreateRetroResult,
  CreateSubnoteOptions,
  CreateSubnoteResult,
  CreateZkOptions,
  CreateZkResult,
  ProjectAreaResult,
  TemplateVariables,
  WorkflowContext
} from "./context";
import {
  drillToChild,
  ensureFolderStyleParent,
  findAreaByTitle,
  findExistingSourceRetroForWeek,
  folderForZkKind,
  linkToFile,
  requireTitle,
  resourceTitlePath,
  resolveOptionalFile,
  resolveRequiredByType,
  resolveRequiredFile,
  retroSourceType,
  uniqueFolderStyleMarkdownPath,
  uniqueMarkdownPath
} from "./locations";
import { insertReferenceItem } from "./references";
import { ROOT_ID_FRONTMATTER_KEY, newRootId, rootIdFromFrontmatter } from "./tasks";

// Fill the free-form editable body of a just-created note. Uses the same body
// region + splice as `update key=body op=set`, so create-with-body and a later
// edit stay consistent.
export async function applyBody(ctx: WorkflowContext, file: TFile, body: string | undefined): Promise<void> {
  const text = body?.trim();
  if (!text) return;
  const content = await ctx.host.read(file);
  await ctx.host.modify(file, setEditableBody(content, text));
}

export async function createProject(ctx: WorkflowContext, options: CreateProjectOptions): Promise<CreateProjectResult> {
  const title = requireTitle(options.title, "project title");
  const target = uniqueFolderStyleMarkdownPath(ctx, ctx.settings.paths.projectsFolder, title);
  await ensureFolder(ctx.host, target.folder);

  const createdAt = localDateTimeSpace();
  const statusCode = readOptionalCode(options.status, parseProjectStatusCode, "status", PROJECT_STATUS_CODE_HELP);
  const priorityCode = readOptionalCode(options.priority, parsePriorityCode, "priority", PRIORITY_CODE_HELP);
  const status = statusCode ?? "idea";
  const priority = priorityCode ?? "low";
  const resolvedAreas = await resolveProjectAreas(ctx, options.areaTitles);
  const areaLinks = uniqueStrings([
    ...(options.areas ?? []),
    ...resolvedAreas.map((area) => area.link)
  ]);
  const file = await createMarkdownFile(ctx, "project", target.path, {
    created: createdAt,
    slug: slugify(target.title),
    areas: inlineList(areaLinks),
    status,
    priority,
    cursor: ""
  });

  const tags = localePack(ctx.settings.locale).tags;
  await ctx.host.processFrontMatter(file, (fm) => {
    fm.type = "project";
    applyAlias(fm, options.alias);
    if (areaLinks.length > 0) fm.areas = areaLinks;
    fm.status = fm.status ?? status;
    fm.priority = fm.priority ?? priority;
    fm.tags = [`${tags.project}/${slugify(target.title)}`];
    applyCreatedUpdatedDefaults(fm, createdAt);
  });

  await openIfRequested(ctx, file, options.open);
  return {
    ...noteResult(file, true, options.open),
    areas: resolvedAreas.length > 0 ? resolvedAreas : undefined
  };
}

export async function createArea(ctx: WorkflowContext, options: CreateAreaOptions): Promise<CreateAreaResult> {
  const title = requireTitle(options.title, "area title");
  const createdAt = localDateTimeSpace();
  const tags = localePack(ctx.settings.locale).tags;

  // A nested area (a parent is given) is an ordinary area that merely has a parent — same
  // stored type, template, and behavior — placed in the parent's folder with an inherited
  // tag namespace and a `parent` link. A root area (no parent) is the unnested form. The
  // `parent` link, not a separate type, is what distinguishes the two everywhere else. The
  // two branches differ only in path strategy and frontmatter; ensureAreaNote is shared.
  if (options.parentTitle === undefined && options.sourcePath === undefined) {
    const target = uniqueFolderStyleMarkdownPath(ctx, ctx.settings.paths.areasFolder, title);
    await ensureFolder(ctx.host, target.folder);
    const { file } = await ensureAreaNote(ctx, target.path, slugify(target.title), createdAt);
    await ctx.host.processFrontMatter(file, (fm) => {
      fm.type = "area";
      fm.tags = [`${tags.area}/${slugify(target.title)}`];
      applyCreatedUpdatedDefaults(fm, createdAt);
    });
    await openIfRequested(ctx, file, options.open);
    return noteResult(file, true, options.open);
  }

  const parent = await ensureFolderStyleParent(ctx, await resolveRequiredParent(ctx, options, "area"));
  const childFolder = joinVaultPath(parent.childFolder, title);
  await ensureFolder(ctx.host, childFolder);
  const { file, created } = await ensureAreaNote(ctx, joinVaultPath(childFolder, `${title}.md`), slugify(title), createdAt);

  const parentTags = frontmatterLinks(parseFrontmatterFromContent(await ctx.host.read(parent.file)).tags)
    .filter((tag) => tag.startsWith(`${tags.area}/`));
  // The parent's own namespace is its deepest area tag — the chain gains a level per nesting,
  // so the longest is the parent's own. The shallowest would drop intermediate levels (e.g.
  // area/ai/vision instead of area/ai/generation/vision for a 3rd-level area).
  const parentNamespace = parentTags.reduce(
    (deepest, tag) => (tag.length > deepest.length ? tag : deepest),
    `${tags.area}/${slugify(parent.file.basename)}`
  );
  const childNamespace = `${parentNamespace}/${slugify(title)}`;
  await ctx.host.processFrontMatter(file, (fm) => {
    fm.type = "area";
    fm.parent = linkToFile(parent.file);
    fm.tags = options.inheritParentTag === false
      ? [childNamespace]
      : Array.from(new Set([parentNamespace, childNamespace]));
    applyCreatedUpdatedDefaults(fm, createdAt);
  });

  await openIfRequested(ctx, file, options.open);
  return {
    ...noteResult(file, created, options.open),
    parentPath: parent.file.path
  };
}

// Get the area note at `path`, or create it from the area template; reports whether it was
// newly created. Shared by createArea's root (unique path) and nested (deterministic path)
// branches so they differ only in path strategy and the frontmatter they then write.
async function ensureAreaNote(
  ctx: WorkflowContext,
  path: string,
  slug: string,
  createdAt: string
): Promise<{ file: TFile; created: boolean }> {
  const existing = ctx.host.getFile(path);
  if (existing) return { file: existing, created: false };
  const file = await createMarkdownFile(ctx, "area", path, { created: createdAt, slug, cursor: "" });
  return { file, created: true };
}

// Origin/parent addressing: prefer an explicit sourcePath (GUI/active note),
// otherwise resolve by name (CLI: type + title). Path stays internal-only.
async function resolveOptionalOrigin(
  ctx: WorkflowContext,
  opts: { sourcePath?: string; sourceType?: string; sourceTitle?: string }
): Promise<TFile | undefined> {
  if (opts.sourcePath) return resolveOptionalFile(ctx, opts.sourcePath);
  if (opts.sourceTitle) return resolveRequiredByType(ctx, opts.sourceType ?? "", { title: opts.sourceTitle });
  return undefined;
}

async function resolveRequiredParent(
  ctx: WorkflowContext,
  opts: { sourcePath?: string; parentType?: string; parentTitle?: string; child?: string[] },
  defaultType?: string
): Promise<TFile> {
  if (opts.sourcePath) return resolveRequiredFile(ctx, opts.sourcePath, "parent note");
  // Root container by name, then drill to a nested parent (areas nest
  // arbitrarily) so a child can be created at any depth.
  const root = await resolveRequiredByType(ctx, opts.parentType ?? defaultType ?? "", { title: opts.parentTitle });
  return opts.child && opts.child.length > 0 ? drillToChild(ctx, root, opts.child) : root;
}

export async function createResource(ctx: WorkflowContext, options: CreateResourceOptions): Promise<CreateResourceResult> {
  const title = resourceTitlePath(options.title);
  const kind = readOptionalCode(options.kind, parseResourceKindCode, "kind", RESOURCE_KIND_CODE_HELP);
  const source = await resolveOptionalOrigin(ctx, options);
  const createdAt = localDateTimeSpace();
  const path = await uniqueMarkdownPath(ctx.host, joinVaultPath(ctx.settings.paths.resourcesFolder, `${title.relpath}.md`));
  const file = await createMarkdownFile(ctx, "resource", path, {
    created: createdAt,
    slug: slugify(title.basename),
    cursor: ""
  });

  const tags = localePack(ctx.settings.locale).tags;
  await ctx.host.processFrontMatter(file, (fm) => {
    fm.type = "resource";
    applyAlias(fm, options.alias);
    fm.tags = [`${tags.resource}/${slugify(title.basename)}`];
    applyCreatedUpdatedDefaults(fm, createdAt);
    // Provenance: write only what was provided. url/first_author/license are free text;
    // kind is already validated to a code (or undefined) by readOptionalCode above.
    if (options.url?.trim()) fm.url = options.url.trim();
    if (options.firstAuthor?.trim()) fm.first_author = options.firstAuthor.trim();
    if (options.license?.trim()) fm.license = options.license.trim();
    if (kind) fm.kind = kind;
  });

  let linkedFromSource = false;
  if (source && options.linkToSource !== false) {
    linkedFromSource = (await insertReferenceItem(ctx, source, { link: wikiLink(file.path) })).added === true;
  }

  await applyBody(ctx, file, options.body);
  await openIfRequested(ctx, file, options.open);
  return {
    ...noteResult(file, true, options.open),
    sourcePath: source?.path,
    linkedFromSource
  };
}

export async function createSubnote(ctx: WorkflowContext, options: CreateSubnoteOptions): Promise<CreateSubnoteResult> {
  const title = requireTitle(options.title, "subnote title");
  const source = await resolveRequiredParent(ctx, options);
  if (title === source.basename) {
    throw new Error(`subnote title conflicts with parent note: ${title}`);
  }
  const parent = await ensureFolderStyleParent(ctx, source);
  const createdAt = localDateTimeSpace();
  const subnoteTypeCode = readOptionalCode(options.subnoteType, parseSubnoteTypeCode, "subnote_type", SUBNOTE_TYPE_CODE_HELP);
  const subnoteType = subnoteTypeCode ?? "free";
  const path = joinVaultPath(parent.childFolder, `${title}.md`);
  if (path === parent.file.path) {
    throw new Error(`subnote title conflicts with parent note: ${title}`);
  }
  let created = true;
  let file = ctx.host.getFile(path);

  if (!file) {
    file = await createMarkdownFile(ctx, "subnote", path, {
      created: createdAt,
      subnote_type: subnoteType,
      cursor: ""
    });
    await ctx.host.processFrontMatter(file, (fm) => {
      fm.type = fm.type || "subnote";
      fm.parent = linkToFile(parent.file);
      fm.subnote_type = fm.subnote_type ?? subnoteType;
      applyCreatedUpdatedDefaults(fm, createdAt);
    });
    await applyBody(ctx, file, options.body);
  } else {
    created = false;
  }

  await openIfRequested(ctx, file, options.open);
  return {
    ...noteResult(file, created, options.open),
    parentPath: parent.file.path
  };
}

export async function createRetro(ctx: WorkflowContext, options: CreateRetroOptions = {}): Promise<CreateRetroResult> {
  const source = await resolveOptionalOrigin(ctx, options);
  const date = dateFromCli(options.date);
  const dateText = localDate(date);
  const createdAt = localDateTimeSpace();
  const week = isoWeekInfo(date);
  const weekSegment = week.weekIso.replace("-", "_");
  const sourceFm = source ? await readFileFrontmatterFresh(ctx, source) : {};
  const sourceType = source ? retroSourceType(ctx, source, sourceFm) : "";
  const labels = localePack(ctx.settings.locale).labels;
  const sourceLink = source ? linkToFile(source) : "";
  const project = sourceType === "project" ? sourceLink : "";
  let areas: string[] = [];
  let defaultName = labels.retroNameGeneral;
  if (source) {
    let sourceNamePrefix = labels.retroNameNotePrefix;
    if (sourceType === "area") {
      areas = [sourceLink];
      sourceNamePrefix = labels.retroNameAreaPrefix;
    } else if (sourceType === "project") {
      areas = frontmatterLinks(sourceFm.areas);
      sourceNamePrefix = labels.retroNameProjectPrefix;
    }
    defaultName = `${sourceNamePrefix}-${source.basename}`;
  }
  const existingSourceRetro = source && !options.title
    ? await findExistingSourceRetroForWeek(ctx, source, sourceType, weekSegment)
    : undefined;
  if (existingSourceRetro) {
    await openIfRequested(ctx, existingSourceRetro, options.open);
    return {
      ...noteResult(existingSourceRetro, false, options.open),
      sourcePath: source?.path,
      weekIso: week.weekIso
    };
  }

  const name = sanitizeFileName(options.title || defaultName) || "General";
  const folder = joinVaultPath(ctx.settings.paths.retrosFolder, weekSegment);
  await ensureFolder(ctx.host, folder);

  const path = joinVaultPath(folder, `${sanitizeFileName(`Retro-${name}-${weekSegment}`)}.md`);
  let created = true;
  let file = ctx.host.getFile(path);
  if (!file) {
    file = await createMarkdownFile(ctx, "retro", path, {
      created: createdAt,
      date: dateText,
      week_iso: week.weekIso,
      week_start: week.weekStart,
      week_end: week.weekEnd,
      project,
      project_frontmatter: project ? yamlScalar(project) : "",
      areas: inlineList(areas),
      areas_frontmatter: frontmatterListBlock(areas),
      cursor: ""
    });
  } else {
    created = false;
  }

  const tags = localePack(ctx.settings.locale).tags;
  await ctx.host.processFrontMatter(file, (fm) => {
    fm.type = "retro";
    if (project) fm.project = project;
    if (areas.length > 0) fm.areas = areas;
    fm.date = fm.date || dateText;
    fm.week_iso = fm.week_iso || week.weekIso;
    fm.week_start = fm.week_start || week.weekStart;
    fm.week_end = fm.week_end || week.weekEnd;
    fm.tags = fm.tags || [tags.retro];
    applyCreatedUpdatedDefaults(fm, createdAt);
  });

  await openIfRequested(ctx, file, options.open);
  return {
    ...noteResult(file, created, options.open),
    sourcePath: source?.path,
    weekIso: week.weekIso
  };
}

export async function createZk(ctx: WorkflowContext, options: CreateZkOptions): Promise<CreateZkResult> {
  const title = requireTitle(options.title, "ZK title");
  const kind = readOptionalCode(options.kind, parseZkKind, "kind", ZK_KIND_CODE_HELP) ?? "Spark";
  const maturityCode = readOptionalCode(options.maturity, parseMaturityCode, "maturity", MATURITY_CODE_HELP);
  const folder = folderForZkKind(ctx.settings, kind);
  await ensureFolder(ctx.host, folder);
  const path = await uniqueMarkdownPath(ctx.host, joinVaultPath(folder, `${title}.md`));
  const file = await createZkFile(ctx, kind, path, title, { maturityCode, alias: options.alias });

  await applyBody(ctx, file, options.body);
  await openIfRequested(ctx, file, options.open);
  return {
    ...noteResult(file, true, options.open),
    kind: zkKindCode(kind)
  };
}

export async function createZkFile(
  ctx: WorkflowContext,
  kind: ZkKind,
  path: string,
  title: string,
  options: { maturityCode?: MaturityCode; alias?: string } = {}
): Promise<TFile> {
  const createdAt = localDateTimeSpace();
  let templateName: TemplateName = "zk_permanent";
  if (kind === "Spark") {
    templateName = "zk_spark";
  } else if (kind === "Digest") {
    templateName = "zk_digest";
  }
  const maturity = options.maturityCode ?? "draft";
  const file = await createMarkdownFile(ctx, templateName, path, {
    created: createdAt,
    slug: slugify(title),
    maturity,
    cursor: ""
  });

  const tags = localePack(ctx.settings.locale).tags;
  await ctx.host.processFrontMatter(file, (fm) => {
    fm.type = `zk_${kind.toLowerCase()}`;
    applyAlias(fm, options.alias);
    fm.tags = [`${tags.knowledge}/${slugify(title)}`];
    applyCreatedUpdatedDefaults(fm, createdAt);
    if (kind === "Spark" && fm.processed === undefined) fm.processed = false;
    if (kind === "Permanent") fm.maturity = fm.maturity ?? maturity;
  });
  return file;
}

export async function createMarkdownFile(
  ctx: WorkflowContext,
  templateName: TemplateName,
  path: string,
  variables: TemplateVariables
): Promise<TFile> {
  await ensureFolder(ctx.host, parentFolder(path));
  const template = await readTemplate(ctx, templateName);
  const content = applyTemplateVariables(template, variables);
  return ctx.host.create(path, content);
}

function applyAlias(frontmatter: Record<string, unknown>, alias: string | undefined): void {
  if (alias === undefined) return;
  const aliases = singleItemList(alias);
  if (aliases.length > 0) frontmatter.aliases = aliases;
}

async function readTemplate(ctx: WorkflowContext, templateName: TemplateName): Promise<string> {
  const templatePath = joinVaultPath(ctx.settings.paths.managedTemplatesFolder, `template_${templateName}.md`);
  const templateFile = ctx.host.getFile(templatePath);
  if (templateFile) return ctx.host.read(templateFile);
  return renderTemplate(templateName, ctx.settings);
}

function applyTemplateVariables(content: string, variables: TemplateVariables): string {
  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{\\s*${escapeRegExp(key)}\\s*}}`, "g"), () => value ?? "");
  }
  return normalizeTemplateOutput(collapseExcessBlankLines(result.replace(/{{\s*[A-Za-z0-9_]+\s*}}/g, "")));
}

function collapseExcessBlankLines(content: string): string {
  return content.replace(/\n[ \t]*\n[ \t]*\n+/g, "\n\n");
}

function normalizeTemplateOutput(content: string): string {
  return content.replace(/\n+$/, "\n");
}

export function noteResult(file: TFile, created: boolean, open?: boolean): NoteResult {
  return {
    path: file.path,
    title: file.basename,
    created,
    opened: open || undefined
  };
}

export function applyCreatedUpdatedDefaults(frontmatter: {
  created?: unknown;
  updated?: unknown;
  [ROOT_ID_FRONTMATTER_KEY]?: unknown;
}, createdAt: string): void {
  frontmatter.created = frontmatter.created || createdAt;
  if (frontmatter.updated === undefined) frontmatter.updated = "";
  if (!rootIdFromFrontmatter(frontmatter)) frontmatter[ROOT_ID_FRONTMATTER_KEY] = newRootId();
}

async function resolveProjectAreas(ctx: WorkflowContext, areaTitles: string[] | undefined): Promise<ProjectAreaResult[]> {
  const results: ProjectAreaResult[] = [];
  const seen = new Set<string>();

  for (const rawTitle of areaTitles ?? []) {
    const title = requireTitle(rawTitle, "area title");
    const key = title.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const existing = findAreaByTitle(ctx, title);
    if (existing) {
      results.push(areaResult(existing, false));
      continue;
    }

    const created = await createArea(ctx, { title, open: false });
    const file = ctx.host.getFile(created.path);
    if (!file) throw new Error(`created area file not found: ${created.path}`);
    results.push(areaResult(file, true));
  }

  return results;
}

function areaResult(file: TFile, created: boolean): ProjectAreaResult {
  return {
    title: file.basename,
    path: file.path,
    link: linkToFile(file),
    created
  };
}

export async function openIfRequested(ctx: WorkflowContext, file: TFile, open?: boolean): Promise<void> {
  if (!open) return;
  await ctx.host.openFile(file);
}

function frontmatterListBlock(values: string[] | undefined): string {
  const items = values?.map((value) => value.trim()).filter(Boolean) ?? [];
  if (items.length === 0) return "";
  return `\n${items.map((value) => `  - ${yamlScalar(value)}`).join("\n")}`;
}

function inlineList(values: string[] | undefined): string {
  return values?.map((value) => value.trim()).filter(Boolean).join(", ") ?? "";
}
