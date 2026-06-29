import { TFile } from "obsidian";
import { localePack } from "../i18n";
import { PARA_ZK_PATHS } from "../layout";
import { createMarkdownFile, type TemplateName } from "../templates";
import {
  dateFromCli,
  isoWeekInfo,
  localDate
} from "../time";
import type { NoteResult, ZkKind } from "../types";
import { frontmatterLinks, parseFrontmatterFromContent, readFileFrontmatterFresh, yamlScalar } from "../vault/frontmatter";
import { ensureFolder } from "../vault/files";
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
import { slugify, uniqueStrings } from "../text";
import { readOptionalCode } from "./code-options";
import type {
  CreateAreaOptions,
  CreateAreaResult,
  CreateLlmWikiOptions,
  CreateLlmWikiResult,
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
  WorkflowContext
} from "./context";
import {
  applyAlias,
  applyCreatedUpdatedDefaults,
  applyResourceFrontmatter,
  applySubnoteFrontmatter,
  applyZkFrontmatter
} from "./frontmatter-builders";
import {
  drillToChild,
  ensureFolderStyleParent,
  findAreaByTitle,
  findExistingSourceRetroForWeek,
  folderForZkKind,
  linkToFile,
  findLlmWikiConcept,
  llmWikiTitlePath,
  requireTitle,
  resourceTitlePath,
  subnoteTitlePath,
  resolveOptionalFile,
  resolveRequiredByType,
  resolveRequiredFile,
  retroSourceType,
  existingMarkdownFile,
  folderStyleMarkdownPath
} from "./locations";
import { insertReferenceItem } from "./references";

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
  const target = folderStyleMarkdownPath(ctx, PARA_ZK_PATHS.projectsFolder, title);
  if (target.existing) {
    await openIfRequested(ctx, target.existing, options.open);
    return noteResult(target.existing, false, options.open);
  }
  await ensureFolder(ctx.host, target.folder);

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
    applyCreatedUpdatedDefaults(fm);
  });

  await openIfRequested(ctx, file, options.open);
  return {
    ...noteResult(file, true, options.open),
    areas: resolvedAreas.length > 0 ? resolvedAreas : undefined
  };
}

export async function createArea(ctx: WorkflowContext, options: CreateAreaOptions): Promise<CreateAreaResult> {
  const title = requireTitle(options.title, "area title");
  const tags = localePack(ctx.settings.locale).tags;

  // A nested area (a parent is given) is an ordinary area that merely has a parent — same
  // stored type, template, and behavior — placed in the parent's folder with an inherited
  // tag namespace and a `parent` link. A root area (no parent) is the unnested form. The
  // `parent` link, not a separate type, is what distinguishes the two everywhere else. The
  // two branches differ only in path strategy and frontmatter; ensureAreaNote is shared.
  if (options.parentTitle === undefined && options.sourcePath === undefined) {
    const target = folderStyleMarkdownPath(ctx, PARA_ZK_PATHS.areasFolder, title);
    if (target.existing) {
      await openIfRequested(ctx, target.existing, options.open);
      return noteResult(target.existing, false, options.open);
    }
    await ensureFolder(ctx.host, target.folder);
    const { file } = await ensureAreaNote(ctx, target.path, slugify(target.title));
    await ctx.host.processFrontMatter(file, (fm) => {
      fm.type = "area";
      fm.tags = [`${tags.area}/${slugify(target.title)}`];
      applyCreatedUpdatedDefaults(fm);
    });
    await openIfRequested(ctx, file, options.open);
    return noteResult(file, true, options.open);
  }

  const parent = await ensureFolderStyleParent(ctx, await resolveRequiredParent(ctx, options, "area"));
  const childFolder = joinVaultPath(parent.childFolder, title);
  await ensureFolder(ctx.host, childFolder);
  const { file, created } = await ensureAreaNote(ctx, joinVaultPath(childFolder, `${title}.md`), slugify(title));

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
    applyCreatedUpdatedDefaults(fm);
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
  slug: string
): Promise<{ file: TFile; created: boolean }> {
  const existing = ctx.host.getFile(path);
  if (existing) return { file: existing, created: false };
  const file = await createMarkdownFile(ctx, "area", path, { slug, cursor: "" });
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
  const path = joinVaultPath(PARA_ZK_PATHS.resourcesFolder, `${title.relpath}.md`);
  const existing = existingMarkdownFile(ctx.host, path);
  if (existing) {
    await openIfRequested(ctx, existing, options.open);
    return { ...noteResult(existing, false, options.open), linkedFromSource: false };
  }
  const kind = readOptionalCode(options.kind, parseResourceKindCode, "kind", RESOURCE_KIND_CODE_HELP);
  const source = await resolveOptionalOrigin(ctx, options);
  const file = await createMarkdownFile(ctx, "resource", path, {
    slug: slugify(title.basename),
    cursor: ""
  });

  await applyResourceFrontmatter(ctx, file, {
    alias: options.alias,
    domain: options.domain,
    firstAuthor: options.firstAuthor,
    kind,
    license: options.license,
    url: options.url
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

// The per-domain hub page. Unlike every other concept it is NOT globally unique (each domain
// owns one), so it is resolved by PATH within its domain, never by the cross-domain concept lookup.
const DOMAIN_INDEX_CONCEPT = "index";

export async function createLlmWiki(ctx: WorkflowContext, options: CreateLlmWikiOptions): Promise<CreateLlmWikiResult> {
  const title = llmWikiTitlePath(options.title);
  // Every wiki page is filed under exactly one domain folder: `<domain>/<concept>` (1 level).
  // The domain is its file-tree home; cross-domain relationships live in links, not folders.
  const segments = title.relpath.split("/");
  if (segments.length !== 2) {
    throw new Error(
      `llm-wiki title must be "<domain>/<concept>" (exactly one domain folder): ${options.title ?? ""}`
    );
  }
  const [domain, concept] = segments;

  if (concept.toLowerCase() === DOMAIN_INDEX_CONCEPT && concept !== DOMAIN_INDEX_CONCEPT) {
    throw new Error('llm-wiki domain hub must be named "index" exactly; use "<domain>/index"');
  }

  if (concept === DOMAIN_INDEX_CONCEPT) {
    // Domain hub: get-or-create by exact path so every domain keeps its own `index` page.
    const existingIndex = ctx.host.getFile(domainIndexPath(ctx, domain));
    if (existingIndex) {
      await openIfRequested(ctx, existingIndex, options.open);
      return noteResult(existingIndex, false, options.open);
    }
    const indexFile = await writeLlmWikiPage(ctx, domain, concept, options);
    await openIfRequested(ctx, indexFile, options.open);
    return noteResult(indexFile, true, options.open);
  }

  // A concept is a single page across the whole wiki — reuse it regardless of domain, so the
  // same concept is never duplicated into a second folder. Re-filing a page to another domain
  // is a deliberate refile-llm-wiki move, not a re-create.
  const existing = findLlmWikiConcept(ctx, concept);
  if (existing) {
    await openIfRequested(ctx, existing, options.open);
    return noteResult(existing, false, options.open);
  }
  const file = await writeLlmWikiPage(ctx, domain, concept, options);
  // Guarantee the domain's `index` hub exists (a scaffold — the LLM fills its body). Idempotent:
  // minted only when absent, so a domain's first concept page creates its index and later pages
  // find it. The index is the deterministic per-domain entry point an LLM reads for the area map.
  await ensureLlmWikiDomainIndex(ctx, domain, options.by);
  await openIfRequested(ctx, file, options.open);
  return noteResult(file, true, options.open);
}

function domainIndexPath(ctx: WorkflowContext, domain: string): string {
  return joinVaultPath(PARA_ZK_PATHS.wikiFolder, `${domain}/${DOMAIN_INDEX_CONCEPT}.md`);
}

export async function ensureLlmWikiDomainIndex(ctx: WorkflowContext, domain: string, by: string | undefined): Promise<boolean> {
  if (ctx.host.getFile(domainIndexPath(ctx, domain))) return false;
  await writeLlmWikiPage(ctx, domain, DOMAIN_INDEX_CONCEPT, { by });
  return true;
}

// Writes a fresh `<domain>/<concept>.md` wiki page with the managed template + frontmatter; the
// body is `options.body` (left empty for an index scaffold). Callers own get-or-create and opening.
async function writeLlmWikiPage(
  ctx: WorkflowContext,
  domain: string,
  concept: string,
  options: { alias?: string; by?: string; body?: string }
): Promise<TFile> {
  const path = joinVaultPath(PARA_ZK_PATHS.wikiFolder, `${domain}/${concept}.md`);
  const file = await createMarkdownFile(ctx, "llm-wiki", path, { slug: slugify(concept) });
  const tags = localePack(ctx.settings.locale).tags;
  const by = llmWikiBy(options.by);
  await ctx.host.processFrontMatter(file, (fm) => {
    fm.type = "llm-wiki";
    applyAlias(fm, options.alias);
    fm.tags = [`${tags.llmWiki}/${slugify(domain)}`];
    applyCreatedUpdatedDefaults(fm);
    if (by) {
      fm.created_by = by;
      fm.updated_by = by;
    }
  });
  await applyBody(ctx, file, options.body);
  return file;
}

function llmWikiBy(value: string | undefined): string | undefined {
  const by = value?.trim();
  return by || undefined;
}

export async function createSubnote(ctx: WorkflowContext, options: CreateSubnoteOptions): Promise<CreateSubnoteResult> {
  // A subnote title may be a relative path ("subdir/note") to file it in a subfolder under the
  // parent — same as create-resource. The subnote stays a child of the parent by frontmatter
  // regardless of subfolder, so the parent's subnote view is unaffected.
  const title = subnoteTitlePath(options.title);
  const source = await resolveRequiredParent(ctx, options);
  if (!title.qualified && title.basename === source.basename) {
    throw new Error(`subnote title conflicts with parent note: ${title.basename}`);
  }
  const parent = await ensureFolderStyleParent(ctx, source);
  const subnoteTypeCode = readOptionalCode(options.subnoteType, parseSubnoteTypeCode, "subnote_type", SUBNOTE_TYPE_CODE_HELP);
  const subnoteType = subnoteTypeCode ?? "free";
  const path = joinVaultPath(parent.childFolder, `${title.relpath}.md`);
  if (path === parent.file.path) {
    throw new Error(`subnote title conflicts with parent note: ${title.basename}`);
  }
  let created = true;
  let file = ctx.host.getFile(path);

  if (!file) {
    file = await createMarkdownFile(ctx, "subnote", path, {
      subnote_type: subnoteType,
      cursor: ""
    });
    await applySubnoteFrontmatter(ctx, file, { parent: parent.file, subnoteType });
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
  const folder = joinVaultPath(PARA_ZK_PATHS.retrosFolder, weekSegment);
  await ensureFolder(ctx.host, folder);

  const path = joinVaultPath(folder, `${sanitizeFileName(`Retro-${name}-${weekSegment}`)}.md`);
  let created = true;
  let file = ctx.host.getFile(path);
  if (!file) {
    file = await createMarkdownFile(ctx, "retro", path, {
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
    applyCreatedUpdatedDefaults(fm);
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
  const folder = folderForZkKind(kind);
  const path = joinVaultPath(folder, `${title}.md`);
  const { file, created } = await createZkFile(ctx, kind, path, title, { maturityCode, alias: options.alias });

  if (created) await applyBody(ctx, file, options.body);
  await openIfRequested(ctx, file, options.open);
  return {
    ...noteResult(file, created, options.open),
    kind: zkKindCode(kind)
  };
}

export async function createZkFile(
  ctx: WorkflowContext,
  kind: ZkKind,
  path: string,
  title: string,
  options: { maturityCode?: MaturityCode; alias?: string } = {}
): Promise<{ file: TFile; created: boolean }> {
  const existing = existingMarkdownFile(ctx.host, path);
  if (existing) return { file: existing, created: false };
  const templateName: TemplateName = zkKindCode(kind);
  const maturity = options.maturityCode ?? "draft";
  const file = await createMarkdownFile(ctx, templateName, path, {
    slug: slugify(title),
    maturity,
    cursor: ""
  });

  await applyZkFrontmatter(ctx, file, kind, { alias: options.alias, maturityCode: options.maturityCode });
  return { file, created: true };
}

export function noteResult(file: TFile, created: boolean, open?: boolean): NoteResult {
  return {
    path: file.path,
    title: file.basename,
    created,
    opened: open || undefined
  };
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
