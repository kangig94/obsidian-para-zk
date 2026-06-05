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
import {
  MATURITY_CODE_HELP,
  PRIORITY_CODE_HELP,
  PROJECT_STATUS_CODE_HELP,
  SUBNOTE_TYPE_CODE_HELP,
  parseMaturityCode,
  parsePriorityCode,
  parseProjectStatusCode,
  parseSubnoteTypeCode,
  type MaturityCode
} from "../vocabulary";
import { ZK_KIND_CODE_HELP, parseZkKind } from "../zk/kinds";
import { escapeRegExp, slugify, uniqueStrings } from "../text";
import { readOptionalCode } from "./code-options";
import type {
  CreateAreaOptions,
  CreateProjectOptions,
  CreateProjectResult,
  CreateResourceOptions,
  CreateResourceResult,
  CreateRetroOptions,
  CreateRetroResult,
  CreateSubareaOptions,
  CreateSubareaResult,
  CreateSubnoteOptions,
  CreateSubnoteResult,
  CreateZkOptions,
  CreateZkResult,
  ProjectAreaResult,
  TemplateVariables,
  WorkflowContext
} from "./context";
import {
  ensureFolderStyleParent,
  findAreaByTitle,
  findExistingSourceRetroForWeek,
  folderForZkKind,
  linkToFile,
  requireTitle,
  resolveOptionalFile,
  resolveRequiredFile,
  retroSourceType,
  uniqueFolderStyleMarkdownPath,
  uniqueMarkdownPath
} from "./locations";
import { insertReferenceItem } from "./references";
import { ROOT_ID_FRONTMATTER_KEY, insertRootTask, newRootId, rootIdFromFrontmatter } from "./tasks";

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

export async function createArea(ctx: WorkflowContext, options: CreateAreaOptions): Promise<NoteResult> {
  const title = requireTitle(options.title, "area title");
  const target = uniqueFolderStyleMarkdownPath(ctx, ctx.settings.paths.areasFolder, title);
  await ensureFolder(ctx.host, target.folder);

  const createdAt = localDateTimeSpace();
  const parent = resolveOptionalFile(ctx, options.parentPath);
  const file = await createMarkdownFile(ctx, "area", target.path, {
    created: createdAt,
    slug: slugify(target.title),
    cursor: ""
  });

  const tags = localePack(ctx.settings.locale).tags;
  await ctx.host.processFrontMatter(file, (fm) => {
    fm.type = "area";
    fm.tags = [`${tags.area}/${slugify(target.title)}`];
    if (parent) fm.parent = linkToFile(parent);
    applyCreatedUpdatedDefaults(fm, createdAt);
  });

  await openIfRequested(ctx, file, options.open);
  return noteResult(file, true, options.open);
}

export async function createResource(ctx: WorkflowContext, options: CreateResourceOptions): Promise<CreateResourceResult> {
  const title = requireTitle(options.title, "resource title");
  const source = resolveOptionalFile(ctx, options.sourcePath);
  const createdAt = localDateTimeSpace();
  const path = await uniqueMarkdownPath(ctx.host, joinVaultPath(ctx.settings.paths.resourcesFolder, `${title}.md`));
  const file = await createMarkdownFile(ctx, "resource", path, {
    created: createdAt,
    slug: slugify(title),
    cursor: ""
  });

  const tags = localePack(ctx.settings.locale).tags;
  await ctx.host.processFrontMatter(file, (fm) => {
    fm.type = "resource";
    fm.tags = [`${tags.resource}/${slugify(title)}`];
    applyCreatedUpdatedDefaults(fm, createdAt);
  });

  let linkedFromSource = false;
  if (source && options.linkToSource !== false) {
    linkedFromSource = (await insertReferenceItem(ctx, source, { link: wikiLink(file.path) })).added === true;
  }

  await openIfRequested(ctx, file, options.open);
  return {
    ...noteResult(file, true, options.open),
    sourcePath: source?.path,
    linkedFromSource
  };
}

export async function createSubnote(ctx: WorkflowContext, options: CreateSubnoteOptions): Promise<CreateSubnoteResult> {
  const title = requireTitle(options.title, "subnote title");
  const parent = await ensureFolderStyleParent(ctx, resolveRequiredFile(ctx, options.sourcePath, "source note"));
  const createdAt = localDateTimeSpace();
  const subnoteTypeCode = readOptionalCode(options.subnoteType, parseSubnoteTypeCode, "subnote_type", SUBNOTE_TYPE_CODE_HELP);
  const subnoteType = subnoteTypeCode ?? "free";
  const path = joinVaultPath(parent.childFolder, `${title}.md`);
  let created = true;
  let file = ctx.host.getFile(path);

  if (!file) {
    file = await createMarkdownFile(ctx, "subnote", path, {
      created: createdAt,
      subnote_type: subnoteType,
      cursor: ""
    });
    await ctx.host.processFrontMatter(file, (fm) => {
      fm.type = fm.type || "doc";
      fm.parent = linkToFile(parent.file);
      fm.subnote_type = fm.subnote_type ?? subnoteType;
      applyCreatedUpdatedDefaults(fm, createdAt);
    });
  } else {
    created = false;
  }

  await openIfRequested(ctx, file, options.open);
  return {
    ...noteResult(file, created, options.open),
    parentPath: parent.file.path
  };
}

export async function createSubarea(ctx: WorkflowContext, options: CreateSubareaOptions): Promise<CreateSubareaResult> {
  const title = requireTitle(options.title, "subarea title");
  const parent = await ensureFolderStyleParent(ctx, resolveRequiredFile(ctx, options.sourcePath, "source area"));
  const subareaFolder = joinVaultPath(parent.childFolder, title);
  await ensureFolder(ctx.host, subareaFolder);

  const createdAt = localDateTimeSpace();
  const path = joinVaultPath(subareaFolder, `${title}.md`);
  let created = true;
  let file = ctx.host.getFile(path);
  if (!file) {
    file = await createMarkdownFile(ctx, "area", path, {
      created: createdAt,
      slug: slugify(title),
      cursor: ""
    });
  } else {
    created = false;
  }

  const tags = localePack(ctx.settings.locale).tags;
  const parentFrontmatter = parseFrontmatterFromContent(await ctx.host.read(parent.file));
  const parentTags = frontmatterLinks(parentFrontmatter.tags);
  const parentNamespace = parentTags.find((tag) => tag.startsWith(`${tags.area}/`)) ?? `${tags.area}/${slugify(parent.file.basename)}`;
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

export async function createRetro(ctx: WorkflowContext, options: CreateRetroOptions = {}): Promise<CreateRetroResult> {
  const source = resolveOptionalFile(ctx, options.sourcePath);
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
  const kind = readOptionalCode(options.kind, parseZkKind, "kind", ZK_KIND_CODE_HELP) ?? "Fleeting";
  const maturityCode = readOptionalCode(options.maturity, parseMaturityCode, "maturity", MATURITY_CODE_HELP);
  const folder = folderForZkKind(ctx.settings, kind);
  await ensureFolder(ctx.host, folder);
  const path = await uniqueMarkdownPath(ctx.host, joinVaultPath(folder, `${title}.md`));
  const file = await createZkFile(ctx, kind, path, title, { maturityCode });

  await openIfRequested(ctx, file, options.open);
  return {
    ...noteResult(file, true, options.open),
    kind
  };
}

export async function createZkFile(
  ctx: WorkflowContext,
  kind: ZkKind,
  path: string,
  title: string,
  options: { maturityCode?: MaturityCode } = {}
): Promise<TFile> {
  const createdAt = localDateTimeSpace();
  let templateName: TemplateName = "zk_permanent";
  if (kind === "Fleeting") {
    templateName = "zk_fleeting";
  } else if (kind === "Literature") {
    templateName = "zk_literature";
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
    fm.tags = [`${tags.knowledge}/${slugify(title)}`];
    applyCreatedUpdatedDefaults(fm, createdAt);
    if (kind === "Fleeting" && fm.processed === undefined) fm.processed = false;
    if (kind === "Permanent") fm.maturity = fm.maturity ?? maturity;
  });
  if (kind === "Fleeting") {
    const labels = localePack(ctx.settings.locale).labels;
    await insertRootTask(ctx, file, { name: labels.refineFleetingAction });
    await insertRootTask(ctx, file, { name: labels.connectReferencesAction });
  }
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

async function readTemplate(ctx: WorkflowContext, templateName: TemplateName): Promise<string> {
  const templatePath = joinVaultPath(ctx.settings.paths.managedTemplatesFolder, `template_${templateName}.md`);
  const templateFile = ctx.host.getFile(templatePath);
  if (templateFile) return ctx.host.read(templateFile);
  return renderTemplate(templateName, ctx.settings);
}

function applyTemplateVariables(content: string, variables: TemplateVariables): string {
  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{\\s*${escapeRegExp(key)}\\s*}}`, "g"), value ?? "");
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
