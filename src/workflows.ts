import { App, TAbstractFile, TFile, TFolder } from "obsidian";
import { localePack } from "./i18n";
import { renderTemplate, type TemplateName } from "./templates";
import {
  dateFromCli,
  isoWeekInfo,
  localDate,
  localDateTimeSpace,
  localTime
} from "./time";
import type {
  CaptureResult,
  NoteResult,
  ParaZkSettings,
  PromotionResult,
  PromotionZkKind,
  ZkKind
} from "./types";
import { frontmatterLinks, yamlScalar } from "./vault/frontmatter";
import {
  joinVaultPath,
  normalizeVaultPath,
  sanitizeFileName,
  wikiLink
} from "./vault/paths";
import {
  ENERGY_CODE_HELP,
  MATURITY_CODE_HELP,
  PRIORITY_CODE_HELP,
  PROJECT_STATUS_CODE_HELP,
  SUBNOTE_TYPE_CODE_HELP,
  parseEnergyCode,
  parseMaturityCode,
  parsePriorityCode,
  parseProjectStatusCode,
  parseSubnoteTypeCode,
  type EnergyCode,
  type MaturityCode
} from "./vocabulary";
import {
  PROMOTION_ZK_KIND_CODE_HELP,
  ZK_KIND_CODE_HELP,
  parsePromotionKind,
  parseZkKind
} from "./zk/kinds";
import { slugify } from "./text/slug";

export type WorkflowContext = {
  app: App;
  settings: ParaZkSettings;
};

export type CreateProjectOptions = {
  title: string;
  areas?: string[];
  areaTitles?: string[];
  status?: string;
  priority?: string;
  open?: boolean;
};

export type ProjectAreaResult = {
  title: string;
  path: string;
  link: string;
  created: boolean;
};

export type CreateAreaOptions = {
  title: string;
  parentPath?: string;
  open?: boolean;
};

export type CreateResourceOptions = {
  title: string;
  sourcePath?: string;
  linkToSource?: boolean;
  open?: boolean;
};

export type AddReferenceOptions = {
  sourcePath?: string;
  target: string;
  label?: string;
  open?: boolean;
};

export type CreateSubnoteOptions = {
  title: string;
  sourcePath?: string;
  subnoteType?: string;
  open?: boolean;
};

export type CreateSubareaOptions = {
  title: string;
  sourcePath?: string;
  inheritParentTag?: boolean;
  open?: boolean;
};

export type CreateRetroOptions = {
  sourcePath?: string;
  name?: string;
  date?: string;
  open?: boolean;
};

export type CreateZkOptions = {
  title: string;
  kind?: string;
  maturity?: string;
  open?: boolean;
};

export type CaptureJournalOptions = {
  content: string;
  date?: string;
  time?: string;
  energy?: string;
  open?: boolean;
};

export type OpenJournalOptions = {
  date?: string;
  energy?: string;
  open?: boolean;
};

export type PromoteResourceOptions = {
  sourcePath?: string;
  title?: string;
  kind?: string;
  maturity?: string;
  open?: boolean;
};

export type PromoteFleetingOptions = {
  sourcePath?: string;
  title?: string;
  kind?: string;
  maturity?: string;
  open?: boolean;
};

export type ReadByTitleOptions = {
  path?: string;
  title?: string;
  key?: string;
  archived?: boolean;
};

export type ReadProjectOptions = ReadByTitleOptions;
export type ReadAreaOptions = ReadByTitleOptions;
export type ReadResourceOptions = ReadByTitleOptions;

export type ReadZkOptions = {
  path?: string;
  title?: string;
  key?: string;
  kind?: string;
};

export type ReadJournalOptions = {
  path?: string;
  date?: string;
  key?: string;
};

export type ReadRetroOptions = ReadByTitleOptions & {
  date?: string;
};

export type UpdateOperation = "set" | "append" | "prepend" | "replace";

export type UpdatePayloadOptions = {
  key?: string;
  operation?: string;
  value?: unknown;
  match?: string;
  replacement?: string;
  all?: boolean;
};

export type UpdateByTitleOptions = ReadByTitleOptions & UpdatePayloadOptions;
export type UpdateProjectOptions = UpdateByTitleOptions;
export type UpdateAreaOptions = UpdateByTitleOptions;
export type UpdateResourceOptions = UpdateByTitleOptions;

export type UpdateZkOptions = ReadZkOptions & UpdatePayloadOptions;
export type UpdateJournalOptions = ReadJournalOptions & UpdatePayloadOptions;
export type UpdateRetroOptions = ReadRetroOptions & UpdatePayloadOptions;

export type UpdateSurfaceResult = {
  path: string;
  title: string;
  type: string;
  archived: boolean;
  key: string;
  operation: UpdateOperation;
  changed: boolean;
  matches?: number;
  moved?: boolean;
  fromPath?: string;
  toPath?: string;
};

export type RenameByTitleOptions = {
  path?: string;
  title?: string;
  newTitle?: string;
  archived?: boolean;
};

export type RenameZkOptions = {
  path?: string;
  title?: string;
  newTitle?: string;
  kind?: string;
};

export type RenameResult = {
  path: string;
  title: string;
  changed: boolean;
  fromPath: string;
  toPath: string;
  fromTitle: string;
  toTitle: string;
};

export type DeleteByTitleOptions = {
  path?: string;
  title?: string;
  archived?: boolean;
  force?: boolean;
};

export type DeleteZkOptions = {
  path?: string;
  title?: string;
  kind?: string;
  force?: boolean;
};

export type DeleteJournalOptions = {
  path?: string;
  date?: string;
  force?: boolean;
};

export type DeleteRetroOptions = DeleteByTitleOptions & {
  date?: string;
};

export type IncomingLink = {
  sourcePath: string;
  targetPath: string;
  count: number;
};

export type DeleteCleanupResult = {
  frontmatter: number;
  references: number;
};

export type DeleteResult = {
  path: string;
  title: string;
  type: string;
  deleted: true;
  trashed: true;
  trashMethod: string;
  containerPath: string;
  deletedPaths: string[];
  incomingLinks: IncomingLink[];
  cleaned: DeleteCleanupResult;
};

type TemplateVariables = Record<string, string | undefined>;
type Frontmatter = Record<string, unknown>;
type ReadMap = Record<string, unknown>;
type SectionTransformContext = {
  ctx: WorkflowContext;
  file: TFile;
  content: string;
  range?: TextRange;
  section: ReadSectionSpec;
};
type ReadSectionSpec = {
  key: string;
  labelKey?: string;
  labels?: string[];
  includeSubsections?: boolean;
  skipManagedPrelude?: boolean;
  transform?: (content: string, context: SectionTransformContext) => unknown;
};
type ReadSurfaceSpec = {
  frontmatter: string[];
  sections?: ReadSectionSpec[];
  body?: boolean;
  children?: boolean;
};
type ProjectTaskRead = {
  checkbox: string;
  name: string;
  due?: string;
  scheduled?: string;
  start?: string;
  created?: string;
  done?: string;
  cancelled?: string;
  priority?: string;
};
type ProjectTaskLineRead = {
  id: string;
  task: ProjectTaskRead;
};
type TaskMetadata = Pick<ProjectTaskRead, "due" | "scheduled" | "start" | "created" | "done" | "cancelled" | "priority">;
type ReferenceRead = {
  kind: "url" | "note" | "file" | "wiki" | "markdown" | "text";
  label?: string;
  target?: string;
  path?: string;
  text?: string;
};
type ReferenceLineRead = {
  id: string;
  reference: ReferenceRead;
};

export async function createProject(ctx: WorkflowContext, options: CreateProjectOptions): Promise<NoteResult & {
  areas?: ProjectAreaResult[];
}> {
  const title = requireTitle(options.title, "project title");
  const folder = joinVaultPath(ctx.settings.paths.projectsFolder, title);
  await ensureFolder(ctx.app, folder);

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
  const path = await uniqueMarkdownPath(ctx.app, joinVaultPath(folder, `${title}.md`));
  const file = await createMarkdownFile(ctx, "project", path, {
    created: createdAt,
    slug: slugify(title),
    areas: inlineList(areaLinks),
    status,
    priority,
    cursor: ""
  });

  const tags = localePack(ctx.settings.locale).tags;
  await ctx.app.fileManager.processFrontMatter(file, (fm) => {
    fm.type = "project";
    if (areaLinks.length > 0) fm.areas = areaLinks;
    fm.status = fm.status ?? status;
    fm.priority = fm.priority ?? priority;
    fm.tags = [`${tags.project}/${slugify(title)}`];
    applyCreatedUpdatedDefaults(fm, createdAt);
  });

  await openIfRequested(ctx, file, options.open);
  return {
    ...noteResult(file, true, options.open),
    areas: resolvedAreas.length > 0 ? resolvedAreas : undefined
  };
}

export async function readProject(ctx: WorkflowContext, options: ReadProjectOptions): Promise<Record<string, unknown>> {
  return readSurface(ctx, resolveRequiredProject(ctx, options), PROJECT_READ_SPEC, options.key);
}

export async function readArea(ctx: WorkflowContext, options: ReadAreaOptions): Promise<Record<string, unknown>> {
  return readSurface(ctx, resolveRequiredArea(ctx, options), AREA_READ_SPEC, options.key);
}

export async function readResource(ctx: WorkflowContext, options: ReadResourceOptions): Promise<Record<string, unknown>> {
  return readSurface(ctx, resolveRequiredResource(ctx, options), RESOURCE_READ_SPEC, options.key);
}

export async function readZk(ctx: WorkflowContext, options: ReadZkOptions): Promise<Record<string, unknown>> {
  const file = resolveRequiredZk(ctx, options);
  return readSurface(ctx, file, specForType(readType(fileFrontmatter(ctx, file))), options.key);
}

export async function readJournal(ctx: WorkflowContext, options: ReadJournalOptions): Promise<Record<string, unknown>> {
  return readSurface(ctx, resolveRequiredJournal(ctx, options), JOURNAL_READ_SPEC, options.key);
}

export async function readRetro(ctx: WorkflowContext, options: ReadRetroOptions): Promise<Record<string, unknown>> {
  return readSurface(ctx, resolveRequiredRetro(ctx, options), RETRO_READ_SPEC, options.key);
}

export async function updateProject(ctx: WorkflowContext, options: UpdateProjectOptions): Promise<UpdateSurfaceResult> {
  return updateSurface(ctx, resolveRequiredProject(ctx, options), PROJECT_READ_SPEC, options);
}

export async function updateArea(ctx: WorkflowContext, options: UpdateAreaOptions): Promise<UpdateSurfaceResult> {
  return updateSurface(ctx, resolveRequiredArea(ctx, options), AREA_READ_SPEC, options);
}

export async function updateResource(ctx: WorkflowContext, options: UpdateResourceOptions): Promise<UpdateSurfaceResult> {
  return updateSurface(ctx, resolveRequiredResource(ctx, options), RESOURCE_READ_SPEC, options);
}

export async function updateZk(ctx: WorkflowContext, options: UpdateZkOptions): Promise<UpdateSurfaceResult> {
  const file = resolveRequiredZk(ctx, options);
  return updateSurface(ctx, file, specForType(readType(fileFrontmatter(ctx, file))), options);
}

export async function updateJournal(ctx: WorkflowContext, options: UpdateJournalOptions): Promise<UpdateSurfaceResult> {
  return updateSurface(ctx, resolveRequiredJournal(ctx, options), JOURNAL_READ_SPEC, options);
}

export async function updateRetro(ctx: WorkflowContext, options: UpdateRetroOptions): Promise<UpdateSurfaceResult> {
  return updateSurface(ctx, resolveRequiredRetro(ctx, options), RETRO_READ_SPEC, options);
}

export async function renameProject(ctx: WorkflowContext, options: RenameByTitleOptions): Promise<RenameResult> {
  return renameFolderStyleNote(
    ctx,
    resolveRequiredProject(ctx, options),
    requireTitle(options.newTitle, "new_title"),
    "project"
  );
}

export async function renameArea(ctx: WorkflowContext, options: RenameByTitleOptions): Promise<RenameResult> {
  return renameFolderStyleNote(
    ctx,
    resolveRequiredArea(ctx, options),
    requireTitle(options.newTitle, "new_title"),
    "area"
  );
}

export async function renameResource(ctx: WorkflowContext, options: RenameByTitleOptions): Promise<RenameResult> {
  return renameFlatNote(
    ctx,
    resolveRequiredResource(ctx, options),
    requireTitle(options.newTitle, "new_title"),
    "resource"
  );
}

export async function renameZk(ctx: WorkflowContext, options: RenameZkOptions): Promise<RenameResult> {
  return renameFlatNote(
    ctx,
    resolveRequiredZk(ctx, options),
    requireTitle(options.newTitle, "new_title"),
    "knowledge"
  );
}

export async function deleteProject(ctx: WorkflowContext, options: DeleteByTitleOptions): Promise<DeleteResult> {
  return deleteDomainNote(ctx, resolveRequiredProject(ctx, options), options);
}

export async function deleteArea(ctx: WorkflowContext, options: DeleteByTitleOptions): Promise<DeleteResult> {
  return deleteDomainNote(ctx, resolveRequiredArea(ctx, options), options);
}

export async function deleteResource(ctx: WorkflowContext, options: DeleteByTitleOptions): Promise<DeleteResult> {
  return deleteDomainNote(ctx, resolveRequiredResource(ctx, options), options);
}

export async function deleteZk(ctx: WorkflowContext, options: DeleteZkOptions): Promise<DeleteResult> {
  return deleteDomainNote(ctx, resolveRequiredZk(ctx, options), options);
}

export async function deleteJournal(ctx: WorkflowContext, options: DeleteJournalOptions): Promise<DeleteResult> {
  return deleteDomainNote(ctx, resolveRequiredJournal(ctx, options), options);
}

export async function deleteRetro(ctx: WorkflowContext, options: DeleteRetroOptions): Promise<DeleteResult> {
  return deleteDomainNote(ctx, resolveRequiredRetro(ctx, options), options);
}

export async function createArea(ctx: WorkflowContext, options: CreateAreaOptions): Promise<NoteResult> {
  const title = requireTitle(options.title, "area title");
  const folder = joinVaultPath(ctx.settings.paths.areasFolder, title);
  await ensureFolder(ctx.app, folder);

  const createdAt = localDateTimeSpace();
  const path = await uniqueMarkdownPath(ctx.app, joinVaultPath(folder, `${title}.md`));
  const parent = resolveOptionalFile(ctx, options.parentPath);
  const file = await createMarkdownFile(ctx, "area", path, {
    created: createdAt,
    slug: slugify(title),
    cursor: ""
  });

  const tags = localePack(ctx.settings.locale).tags;
  await ctx.app.fileManager.processFrontMatter(file, (fm) => {
    fm.type = "area";
    fm.tags = [`${tags.area}/${slugify(title)}`];
    if (parent) fm.parent = linkToFile(parent);
    applyCreatedUpdatedDefaults(fm, createdAt);
  });

  await openIfRequested(ctx, file, options.open);
  return noteResult(file, true, options.open);
}

export async function createResource(ctx: WorkflowContext, options: CreateResourceOptions): Promise<NoteResult & {
  sourcePath?: string;
  linkedFromSource: boolean;
}> {
  const title = requireTitle(options.title, "resource title");
  const source = resolveOptionalFile(ctx, options.sourcePath);
  const createdAt = localDateTimeSpace();
  const path = await uniqueMarkdownPath(ctx.app, joinVaultPath(ctx.settings.paths.resourcesFolder, `${title}.md`));
  const file = await createMarkdownFile(ctx, "resource", path, {
    created: createdAt,
    slug: slugify(title),
    cursor: ""
  });

  const tags = localePack(ctx.settings.locale).tags;
  await ctx.app.fileManager.processFrontMatter(file, (fm) => {
    fm.type = "resource";
    fm.tags = [`${tags.resource}/${slugify(title)}`];
    applyCreatedUpdatedDefaults(fm, createdAt);
  });

  let linkedFromSource = false;
  if (source && options.linkToSource !== false) {
    linkedFromSource = await appendReferenceLink(ctx, source, file);
  }

  await openIfRequested(ctx, file, options.open);
  return {
    ...noteResult(file, true, options.open),
    sourcePath: source?.path,
    linkedFromSource
  };
}

export async function addReference(ctx: WorkflowContext, options: AddReferenceOptions): Promise<{
  path: string;
  title: string;
  reference: string;
  target: string;
  added: boolean;
  opened?: boolean;
}> {
  const source = resolveRequiredFile(ctx, options.sourcePath, "source note");
  const reference = resolveReferenceTarget(ctx, options.target, options.label);
  const added = await appendReferenceLine(ctx, source, reference.line, {
    ordered: true,
    dedupeTargetPath: reference.targetPath,
    dedupeText: reference.dedupeText
  });
  await openIfRequested(ctx, source, options.open);
  return {
    path: source.path,
    title: source.basename,
    reference: reference.line,
    target: reference.target,
    added,
    opened: options.open || undefined
  };
}

export async function createSubnote(ctx: WorkflowContext, options: CreateSubnoteOptions): Promise<NoteResult & {
  parentPath: string;
}> {
  const title = requireTitle(options.title, "subnote title");
  const parent = await ensureFolderStyleParent(ctx, resolveRequiredFile(ctx, options.sourcePath, "source note"));
  const createdAt = localDateTimeSpace();
  const subnoteTypeCode = readOptionalCode(options.subnoteType, parseSubnoteTypeCode, "subnote_type", SUBNOTE_TYPE_CODE_HELP);
  const subnoteType = subnoteTypeCode ?? "free";
  const path = joinVaultPath(parent.childFolder, `${title}.md`);
  let created = true;
  let file = ctx.app.vault.getFileByPath(path);

  if (!file) {
    file = await createMarkdownFile(ctx, "subnote", path, {
      created: createdAt,
      subnote_type: subnoteType,
      cursor: ""
    });
    await ctx.app.fileManager.processFrontMatter(file, (fm) => {
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

export async function createSubarea(ctx: WorkflowContext, options: CreateSubareaOptions): Promise<NoteResult & {
  parentPath: string;
}> {
  const title = requireTitle(options.title, "subarea title");
  const parent = await ensureFolderStyleParent(ctx, resolveRequiredFile(ctx, options.sourcePath, "source area"));
  const subareaFolder = joinVaultPath(parent.childFolder, title);
  await ensureFolder(ctx.app, subareaFolder);

  const createdAt = localDateTimeSpace();
  const path = joinVaultPath(subareaFolder, `${title}.md`);
  let created = true;
  let file = ctx.app.vault.getFileByPath(path);
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
  const parentTags = frontmatterLinks(ctx.app.metadataCache.getFileCache(parent.file)?.frontmatter?.tags);
  const parentNamespace = parentTags.find((tag) => tag.startsWith(`${tags.area}/`)) ?? `${tags.area}/${slugify(parent.file.basename)}`;
  const childNamespace = `${parentNamespace}/${slugify(title)}`;
  await ctx.app.fileManager.processFrontMatter(file, (fm) => {
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

export async function createRetro(ctx: WorkflowContext, options: CreateRetroOptions = {}): Promise<NoteResult & {
  sourcePath?: string;
  weekIso: string;
}> {
  const source = resolveOptionalFile(ctx, options.sourcePath);
  const date = dateFromCli(options.date);
  const dateText = localDate(date);
  const createdAt = localDateTimeSpace();
  const week = isoWeekInfo(date);
  const weekSegment = week.weekIso.replace("-", "_");
  const sourceFm = source ? ctx.app.metadataCache.getFileCache(source)?.frontmatter ?? {} : {};
  const sourceType = String(sourceFm.type ?? "").toLowerCase();
  const labels = localePack(ctx.settings.locale).labels;
  const sourceLink = source ? linkToFile(source) : "";
  const project = sourceType === "project" ? sourceLink : "";
  const areas = sourceType === "area"
    ? [sourceLink]
    : sourceType === "project"
      ? frontmatterLinks(sourceFm.areas)
      : [];
  const defaultName = source
    ? `${sourceType === "area" ? labels.retroNameAreaPrefix : sourceType === "project" ? labels.retroNameProjectPrefix : labels.retroNameNotePrefix}-${source.basename}`
    : labels.retroNameGeneral;
  const name = sanitizeFileName(options.name || defaultName) || "General";
  const folder = joinVaultPath(ctx.settings.paths.retrosFolder, weekSegment);
  await ensureFolder(ctx.app, folder);

  const path = joinVaultPath(folder, `${sanitizeFileName(`Retro-${name}-${weekSegment}`)}.md`);
  let created = true;
  let file = ctx.app.vault.getFileByPath(path);
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
  await ctx.app.fileManager.processFrontMatter(file, (fm) => {
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

export async function createZk(ctx: WorkflowContext, options: CreateZkOptions): Promise<NoteResult & {
  kind: ZkKind;
}> {
  const title = requireTitle(options.title, "ZK title");
  const kind = readOptionalCode(options.kind, parseZkKind, "kind", ZK_KIND_CODE_HELP) ?? "Fleeting";
  const maturityCode = readOptionalCode(options.maturity, parseMaturityCode, "maturity", MATURITY_CODE_HELP);
  const folder = folderForZkKind(ctx.settings, kind);
  await ensureFolder(ctx.app, folder);
  const path = await uniqueMarkdownPath(ctx.app, joinVaultPath(folder, `${title}.md`));
  const file = await createZkFile(ctx, kind, path, title, { maturityCode });

  await openIfRequested(ctx, file, options.open);
  return {
    ...noteResult(file, true, options.open),
    kind
  };
}

export async function captureJournal(ctx: WorkflowContext, options: CaptureJournalOptions): Promise<CaptureResult> {
  const content = options.content?.trim();
  if (!content) throw new Error("journal capture content is required");

  const timeText = options.time?.trim() || localTime();
  const journal = await ensureJournal(ctx, options);

  const t = localePack(ctx.settings.locale);
  await appendLineUnderHeader(ctx.app, journal.file, t.labels.quickMemo, `- ${timeText} - ${content}`, {
    createHeadingLevel: 1,
    ordered: false,
    dedupe: false
  });
  await openIfRequested(ctx, journal.file, options.open);

  return {
    path: journal.file.path,
    content,
    date: journal.date,
    created: journal.created
  };
}

export async function openJournal(ctx: WorkflowContext, options: OpenJournalOptions = {}): Promise<NoteResult & {
  date: string;
  energy: EnergyCode;
}> {
  const journal = await ensureJournal(ctx, options);
  await openIfRequested(ctx, journal.file, options.open);
  return {
    ...noteResult(journal.file, journal.created, options.open),
    date: journal.date,
    energy: journal.energy
  };
}

export async function promoteResource(ctx: WorkflowContext, options: PromoteResourceOptions = {}): Promise<PromotionResult> {
  const source = resolveRequiredFile(ctx, options.sourcePath, "source resource");
  const kind = readOptionalCode(options.kind, parseZkKind, "kind", ZK_KIND_CODE_HELP) ?? "Permanent";
  const maturityCode = readOptionalCode(options.maturity, parseMaturityCode, "maturity", MATURITY_CODE_HELP);
  const title = requireTitle(options.title || source.basename, "ZK title");
  const folder = folderForZkKind(ctx.settings, kind);
  await ensureFolder(ctx.app, folder);
  const path = await uniqueMarkdownPath(ctx.app, joinVaultPath(folder, `${title}.md`));
  const file = await createZkFile(ctx, kind, path, title, { maturityCode });

  await appendReferenceLine(ctx, file, `- ${wikiLink(source.path)}`);
  await openIfRequested(ctx, file, options.open);

  return {
    ...noteResult(file, true, options.open),
    sourcePath: source.path,
    kind
  };
}

export async function promoteFleeting(ctx: WorkflowContext, options: PromoteFleetingOptions = {}): Promise<PromotionResult> {
  const source = resolveRequiredFile(ctx, options.sourcePath, "source fleeting note");
  const kind = readOptionalCode(options.kind, parsePromotionKind, "kind", PROMOTION_ZK_KIND_CODE_HELP) ?? "Permanent";
  const maturityCode = readOptionalCode(options.maturity, parseMaturityCode, "maturity", MATURITY_CODE_HELP);
  const title = requireTitle(options.title || source.basename, "ZK title");
  const folder = folderForZkKind(ctx.settings, kind);
  await ensureFolder(ctx.app, folder);
  const path = await uniqueMarkdownPath(ctx.app, joinVaultPath(folder, `${title}.md`));
  const file = await createZkFile(ctx, kind, path, title, { maturityCode });

  await appendReferenceLine(ctx, file, `- ${wikiLink(source.path)}`);
  await ctx.app.fileManager.processFrontMatter(source, (fm) => {
    fm.processed = true;
    fm.promoted_to = linkToFile(file);
  });

  await openIfRequested(ctx, file, options.open);

  return {
    ...noteResult(file, true, options.open),
    sourcePath: source.path,
    kind
  };
}

async function createZkFile(
  ctx: WorkflowContext,
  kind: ZkKind,
  path: string,
  title: string,
  options: { maturityCode?: MaturityCode } = {}
): Promise<TFile> {
  const createdAt = localDateTimeSpace();
  const templateName: TemplateName = kind === "Fleeting"
    ? "zk_fleeting"
    : kind === "Literature"
      ? "zk_literature"
      : "zk_permanent";
  const maturity = options.maturityCode ?? "draft";
  const file = await createMarkdownFile(ctx, templateName, path, {
    created: createdAt,
    slug: slugify(title),
    maturity,
    cursor: ""
  });

  const tags = localePack(ctx.settings.locale).tags;
  await ctx.app.fileManager.processFrontMatter(file, (fm) => {
    fm.type = `zk_${kind.toLowerCase()}`;
    fm.tags = [`${tags.knowledge}/${slugify(title)}`];
    applyCreatedUpdatedDefaults(fm, createdAt);
    if (kind === "Fleeting" && fm.processed === undefined) fm.processed = false;
    if (kind === "Permanent") fm.maturity = fm.maturity ?? maturity;
  });
  return file;
}

function readOptionalCode<T extends string>(
  value: string | undefined,
  parse: (value: string | undefined) => T | undefined,
  field: string,
  allowed: string
): T | undefined {
  if (value === undefined) return undefined;
  const code = parse(value);
  if (code) return code;
  throw new Error(`${field} must be one of: ${allowed} (received: ${value})`);
}

async function createMarkdownFile(
  ctx: WorkflowContext,
  templateName: TemplateName,
  path: string,
  variables: TemplateVariables
): Promise<TFile> {
  await ensureFolder(ctx.app, parentFolder(path));
  const template = await readTemplate(ctx, templateName);
  const content = applyTemplateVariables(template, variables);
  return ctx.app.vault.create(path, content);
}

async function readTemplate(ctx: WorkflowContext, templateName: TemplateName): Promise<string> {
  const templatePath = joinVaultPath(ctx.settings.paths.managedTemplatesFolder, `template_${templateName}.md`);
  const templateFile = ctx.app.vault.getFileByPath(templatePath);
  if (templateFile) return ctx.app.vault.read(templateFile);
  return renderTemplate(templateName, ctx.settings.locale);
}

function applyTemplateVariables(content: string, variables: TemplateVariables): string {
  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{\\s*${escapeRegExp(key)}\\s*}}`, "g"), value ?? "");
  }
  return result.replace(/{{\s*[A-Za-z0-9_]+\s*}}/g, "");
}

async function appendReferenceLink(ctx: WorkflowContext, source: TFile, target: TFile): Promise<boolean> {
  const link = wikiLink(target.path, target.basename);
  return appendReferenceLine(ctx, source, link, {
    ordered: true,
    dedupeTargetPath: target.path
  });
}

async function appendReferenceLine(
  ctx: WorkflowContext,
  file: TFile,
  line: string,
  options: {
    ordered?: boolean;
    dedupe?: boolean;
    dedupeTargetPath?: string;
    dedupeText?: string;
  } = {}
): Promise<boolean> {
  const label = localePack(ctx.settings.locale).labels.references;
  return appendLineUnderHeader(ctx.app, file, label, line, {
    createHeadingLevel: 2,
    ordered: options.ordered ?? false,
    dedupe: options.dedupe ?? true,
    dedupeTargetPath: options.dedupeTargetPath,
    dedupeText: options.dedupeText
  });
}

async function appendLineUnderHeader(
  app: App,
  file: TFile,
  headerName: string,
  line: string,
  options: {
    createHeadingLevel: number;
    ordered: boolean;
    dedupe?: boolean;
    dedupeTargetPath?: string;
    dedupeText?: string;
  }
): Promise<boolean> {
  const content = await app.vault.read(file);
  const headerPattern = escapeRegExp(headerName).replace(/\s+/g, "\\s+");
  const headerRe = new RegExp(`^(?<quote>(?:>\\s*)*)\\s*(?<hashes>#{1,6})\\s*${headerPattern}(?=\\s|$).*?$`, "im");
  const match = content.match(headerRe);

  if (!match) {
    const prefix = "#".repeat(options.createHeadingLevel);
    const insertedLine = options.ordered ? `1. ${line}` : line;
    await app.vault.modify(file, `${content.replace(/\s*$/, "")}\n\n${prefix} ${headerName}\n${insertedLine}\n`);
    return true;
  }

  const quote = match.groups?.quote ?? "";
  const headerEnd = (match.index ?? 0) + match[0].length;
  const sectionStart = content.charAt(headerEnd) === "\n" ? headerEnd + 1 : headerEnd;
  const after = content.slice(sectionStart);
  const nextHeaderRel = after.search(/^\s*(?:>\s*)*#{1,6}\s+/m);
  const sectionEnd = nextHeaderRel === -1 ? content.length : sectionStart + nextHeaderRel;
  const section = content.slice(sectionStart, sectionEnd);

  if (options.dedupeTargetPath) {
    const linkTargetRe = new RegExp(`\\[\\[${escapeRegExp(options.dedupeTargetPath)}(?:\\|[^\\]]*)?\\]\\]`, "i");
    if (linkTargetRe.test(section)) return false;
  }
  if (options.dedupeText && section.includes(options.dedupeText)) return false;
  if (options.dedupe && section.includes(line)) return false;

  const firstNonEmpty = section.split(/\n/).find((item) => item.trim());
  const insertQuote = quote && firstNonEmpty?.startsWith(quote) ? quote : "";
  const newLine = options.ordered
    ? `${insertQuote}${countListItems(section, insertQuote) + 1}. ${line}`
    : `${insertQuote}${line}`;
  const gap = section.length === 0 || section.endsWith("\n") ? "" : "\n";
  const updated = content.slice(0, sectionStart) + section + gap + newLine + "\n" + content.slice(sectionEnd);
  await app.vault.modify(file, updated);
  return true;
}

function resolveReferenceTarget(ctx: WorkflowContext, target: string, label: string | undefined): {
  line: string;
  target: string;
  targetPath?: string;
  dedupeText?: string;
} {
  const value = target.trim();
  if (!value) throw new Error("reference target is required");

  const wikiTarget = readWikiTarget(value);
  if (wikiTarget) {
    return {
      line: value,
      target: wikiTarget,
      targetPath: wikiTarget
    };
  }

  const markdownTarget = readMarkdownLinkTarget(value);
  if (markdownTarget) {
    return {
      line: value,
      target: markdownTarget,
      dedupeText: markdownTarget
    };
  }

  if (isExternalReference(value)) {
    return {
      line: label ? `[${escapeMarkdownLinkLabel(label)}](${value})` : value,
      target: value,
      dedupeText: value
    };
  }

  const normalized = normalizeVaultPath(value);
  const file = ctx.app.vault.getAbstractFileByPath(normalized);
  if (file instanceof TFile) {
    return {
      line: wikiLink(file.path, label?.trim() || file.basename),
      target: file.path,
      targetPath: file.path
    };
  }

  throw new Error(`reference target must be an existing vault file, URL, wikilink, or markdown link: ${value}`);
}

function readWikiTarget(value: string): string | undefined {
  const match = value.match(/^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/);
  return match ? normalizeVaultPath(match[1]) : undefined;
}

function readWikiLinkLabel(value: string): string | undefined {
  const match = value.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
  if (!match) return undefined;
  return (match[2]?.trim() || pathBasenameWithoutExtension(match[1])).trim();
}

function pathBasenameWithoutExtension(path: string): string {
  const last = path.split("/").filter(Boolean).pop() ?? path;
  return last.replace(/\.md$/i, "");
}

function readMarkdownLinkTarget(value: string): string | undefined {
  const match = value.match(/^\[[^\]]+\]\(([^)]+)\)$/);
  return match?.[1]?.trim() || undefined;
}

function isExternalReference(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value);
}

function escapeMarkdownLinkLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

function countListItems(section: string, prefix: string): number {
  const escapedPrefix = escapeRegExp(prefix);
  const numberRe = new RegExp(`^${escapedPrefix}\\s*\\d+\\.\\s+`);
  const bulletRe = new RegExp(`^${escapedPrefix}\\s*[-*+]\\s+`);
  return section.split(/\n/).filter((line) => numberRe.test(line) || bulletRe.test(line)).length;
}

const PROJECT_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: ["areas", "status", "priority", "start_date", "due_date", "done_date"],
  sections: [
    { key: "summary", labelKey: "summary", skipManagedPrelude: true, transform: stripProjectSummaryManagedBlock },
    { key: "goals", labelKey: "goals" },
    { key: "tasks", labelKey: "tasks", transform: readProjectTasks },
    { key: "references", labelKey: "references", transform: readReferences }
  ],
  children: true
};

const AREA_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: ["parent"],
  sections: [
    { key: "overview", labelKey: "overview" },
    { key: "references", labelKey: "references", transform: readReferences }
  ],
  children: true
};

const RESOURCE_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: [],
  sections: [
    { key: "overview", labelKey: "overview" },
    { key: "body", labelKey: "body" },
    { key: "references", labelKey: "references", transform: readReferences }
  ]
};

const JOURNAL_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: ["date", "energy"],
  sections: [
    { key: "focus", labelKey: "focus" },
    { key: "quick_memo", labelKey: "quickMemo" },
    { key: "timeline", labelKey: "timeline" },
    { key: "today_tasks", labelKey: "todayTasks" },
    { key: "short_review", labelKey: "shortReview" },
    { key: "links", labelKey: "links" }
  ]
};

const RETRO_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: ["project", "areas", "date", "week_iso", "week_start", "week_end"],
  sections: [
    { key: "week_progress", labelKey: "weekProgress" },
    { key: "good", labelKey: "good" },
    { key: "improve", labelKey: "improve" },
    { key: "risks", labelKey: "risks" },
    { key: "next_actions", labelKey: "nextActions" },
    { key: "retro_summary", labelKey: "retroSummary" },
    { key: "links", labels: ["Links", "링크"], includeSubsections: true }
  ]
};

const DOC_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: ["subnote_type"],
  body: true
};

const ZK_FLEETING_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: ["processed"],
  sections: [
    { key: "thought_summary", labelKey: "thoughtSummary" },
    { key: "memo", labelKey: "memo" },
    { key: "references", labelKey: "references", transform: readReferences }
  ]
};

const ZK_LITERATURE_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: ["sourceTitle", "authors", "published", "url"],
  sections: [
    { key: "highlight_block", labelKey: "highlightBlock" },
    { key: "summary", labelKey: "summary" },
    { key: "insight", labelKey: "insight" },
    { key: "evidence", labelKey: "evidence" },
    { key: "references", labelKey: "references", transform: readReferences }
  ]
};

const ZK_PERMANENT_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: ["maturity", "aliases"],
  sections: [
    { key: "one_sentence_summary", labelKey: "oneSentenceSummary" },
    { key: "body", labelKey: "body" },
    { key: "limitations", labelKey: "limitations" },
    { key: "related_questions", labelKey: "relatedQuestions" },
    { key: "references", labelKey: "references", transform: readReferences }
  ]
};

const NOTE_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: [],
  body: true
};

async function readSurface(
  ctx: WorkflowContext,
  file: TFile,
  spec: ReadSurfaceSpec,
  rawKey: string | undefined
): Promise<Record<string, unknown>> {
  const frontmatter = fileFrontmatter(ctx, file);
  const type = readType(frontmatter);
  const surface = await readSurfaceMap(ctx, file, spec);
  const key = rawKey?.trim();

  if (!key) return compactReadEnvelope(ctx, file, type, surface);

  return {
    path: file.path,
    title: file.basename,
    type,
    mode: "exact",
    ...archivedReadFlag(ctx, file),
    key,
    value: await readSurfaceKey(ctx, file, surface, key)
  };
}

async function readSurfaceMap(ctx: WorkflowContext, file: TFile, spec: ReadSurfaceSpec): Promise<ReadMap> {
  const content = await ctx.app.vault.read(file);
  const frontmatter = fileFrontmatter(ctx, file);
  const surface: ReadMap = {
    frontmatter: pickFrontmatter(frontmatter, spec.frontmatter)
  };

  if (spec.body) surface.body = stripManagedPrelude(content);

  for (const section of spec.sections ?? []) {
    const value = readSection(content, sectionHeadingCandidates(section), {
      includeSubsections: section.includeSubsections ?? false
    });
    surface[section.key] = section.transform
      ? section.transform(value, {
        ctx,
        file,
        content,
        range: findSectionContentRange(content, section),
        section
      })
      : value;
  }

  if (spec.children) surface.children = childIndex(ctx, file);
  return surface;
}

function compactReadEnvelope(
  ctx: WorkflowContext,
  file: TFile,
  type: string,
  surface: ReadMap
): Record<string, unknown> {
  return {
    mode: "compact",
    omits_empty: true,
    path: file.path,
    title: file.basename,
    type,
    ...archivedReadFlag(ctx, file),
    ...compactReadMap(surface)
  };
}

function archivedReadFlag(ctx: WorkflowContext, file: TFile): { archived?: true } {
  return isArchivedFile(ctx, file) ? { archived: true } : {};
}

function compactReadMap(value: ReadMap): ReadMap {
  const result: ReadMap = {};
  for (const [key, item] of Object.entries(value)) {
    const compact = key === "frontmatter"
      ? compactFrontmatter(item)
      : key === "tasks" || key === "references"
        ? compactCollectionCount(item)
        : compactReadValue(item);
    if (compact !== undefined) result[key] = compact;
  }
  return result;
}

function compactCollectionCount(value: unknown): unknown {
  if (!isRecord(value)) return compactReadValue(value);
  const entries = Object.entries(value);
  if (entries.length === 0) return undefined;
  return {
    count: entries.length
  };
}

function compactFrontmatter(value: unknown): unknown {
  if (!isRecord(value)) return compactReadValue(value);
  const result: Frontmatter = {};
  for (const [key, item] of Object.entries(value)) {
    const compact = compactFrontmatterValue(item);
    if (compact !== undefined) result[key] = compact;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function compactFrontmatterValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(compactFrontmatterValue).filter((item) => item !== undefined);
    return items.length > 0 ? items : undefined;
  }
  if (typeof value === "string") {
    const linkLabel = readWikiLinkLabel(value);
    return compactReadValue(linkLabel ?? value);
  }
  return compactReadValue(value);
}

function compactReadValue(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const trimmed = trimMarkdownBlock(value);
    return isMarkdownScaffold(trimmed) ? undefined : trimmed;
  }
  if (Array.isArray(value)) {
    const items = value.map(compactReadValue).filter((item) => item !== undefined);
    return items.length > 0 ? items : undefined;
  }
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const compact = compactReadValue(item);
      if (compact !== undefined) result[key] = compact;
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }
  return value;
}

async function readSurfaceKey(
  ctx: WorkflowContext,
  source: TFile,
  surface: ReadMap,
  key: string
): Promise<unknown> {
  const parts = keyParts(key);
  if (parts.length === 0) throw new Error("key is required");

  if (parts[0] !== "children") {
    return readMapPath(surface, parts, key);
  }

  if (!Object.prototype.hasOwnProperty.call(surface, "children")) {
    throw new Error(`unknown read key: ${key}`);
  }
  if (parts.length === 1) return surface.children;

  const childTitle = parts[1];
  const child = findChild(ctx, source, childTitle);
  if (!child) throw new Error(`child not found: ${childTitle}`);

  const childSurface = await readSurfaceMap(ctx, child, specForType(readType(fileFrontmatter(ctx, child))));
  if (parts.length === 2) {
    return compactReadEnvelope(ctx, child, readType(fileFrontmatter(ctx, child)), childSurface);
  }
  return readMapPath(childSurface, parts.slice(2), key);
}

type WritableSurfaceTarget =
  | {
    kind: "frontmatter";
    file: TFile;
    frontmatterKey: string;
  }
  | {
    kind: "text";
    file: TFile;
    range: TextRange;
  };

type TextRange = {
  start: number;
  end: number;
};

type TextUpdateResult = {
  changed: boolean;
  matches?: number;
  file?: TFile;
  moved?: boolean;
  fromPath?: string;
  toPath?: string;
};

async function updateSurface(
  ctx: WorkflowContext,
  file: TFile,
  spec: ReadSurfaceSpec,
  options: UpdatePayloadOptions
): Promise<UpdateSurfaceResult> {
  const key = requireUpdateKey(options.key);
  const operation = parseUpdateOperation(options.operation);
  const target = await resolveWritableSurfaceTarget(ctx, file, spec, key, key);
  const result = target.kind === "frontmatter"
    ? await updateFrontmatterSurface(ctx, target, operation, options)
    : await updateTextSurface(ctx, target, operation, options);
  const resultFile = result.file ?? target.file;

  return {
    path: resultFile.path,
    title: resultFile.basename,
    type: readType(fileFrontmatter(ctx, resultFile)),
    archived: isArchivedFile(ctx, resultFile),
    key,
    operation,
    changed: result.changed,
    matches: result.matches,
    moved: result.moved,
    fromPath: result.fromPath,
    toPath: result.toPath
  };
}

async function resolveWritableSurfaceTarget(
  ctx: WorkflowContext,
  file: TFile,
  spec: ReadSurfaceSpec,
  key: string,
  originalKey: string
): Promise<WritableSurfaceTarget> {
  const parts = keyParts(key);
  if (parts.length === 0) throw new Error("key is required");

  if (parts[0] === "children") {
    if (!spec.children) throw new Error(`unknown update key: ${originalKey}`);
    if (parts.length < 3) throw new Error(`children map is read-only; use children/<title>/<key>`);

    const childTitle = parts[1];
    const child = findChild(ctx, file, childTitle);
    if (!child) throw new Error(`child not found: ${childTitle}`);

    return resolveWritableSurfaceTarget(
      ctx,
      child,
      specForType(readType(fileFrontmatter(ctx, child))),
      parts.slice(2).join("/"),
      originalKey
    );
  }

  if (parts[0] === "frontmatter") {
    if (parts.length !== 2) throw new Error(`frontmatter map is read-only; use frontmatter/<key>`);
    const frontmatterKey = parts[1];
    if (!spec.frontmatter.includes(frontmatterKey)) throw new Error(`unknown update key: ${originalKey}`);
    return {
      kind: "frontmatter",
      file,
      frontmatterKey
    };
  }

  if (parts[0] === "body" && parts.length === 1 && spec.body) {
    const content = await ctx.app.vault.read(file);
    return {
      kind: "text",
      file,
      range: writableBodyRange(content)
    };
  }

  const section = spec.sections?.find((item) => item.key === parts[0]);
  if (!section || parts.length !== 1) throw new Error(`unknown update key: ${originalKey}`);

  const content = await ctx.app.vault.read(file);
  return {
    kind: "text",
    file,
    range: writableSectionRange(content, section, originalKey)
  };
}

async function updateFrontmatterSurface(
  ctx: WorkflowContext,
  target: Extract<WritableSurfaceTarget, { kind: "frontmatter" }>,
  operation: UpdateOperation,
  options: UpdatePayloadOptions
): Promise<TextUpdateResult> {
  if (operation !== "set") throw new Error("frontmatter keys only support op=set");

  const value = normalizeFrontmatterUpdateValue(
    readType(fileFrontmatter(ctx, target.file)),
    target.frontmatterKey,
    requireUpdateValue(options)
  );
  const movePlan = projectStatusMovePlan(ctx, target.file, target.frontmatterKey, value);
  if (movePlan) assertCanMoveNoteBetweenRoots(ctx, target.file, movePlan.fromRoot, movePlan.toRoot);
  const before = fileFrontmatter(ctx, target.file)[target.frontmatterKey];
  const frontmatterChanged = !frontmatterValuesEqual(before, value);

  if (frontmatterChanged) {
    await ctx.app.fileManager.processFrontMatter(target.file, (fm) => {
      fm[target.frontmatterKey] = value;
    });
  }
  if (!movePlan) return { changed: frontmatterChanged };

  const moved = await moveNoteBetweenRoots(ctx, target.file, movePlan.fromRoot, movePlan.toRoot);
  return {
    changed: true,
    file: moved.file,
    moved: true,
    fromPath: moved.fromPath,
    toPath: moved.toPath
  };
}

async function updateTextSurface(
  ctx: WorkflowContext,
  target: Extract<WritableSurfaceTarget, { kind: "text" }>,
  operation: UpdateOperation,
  options: UpdatePayloadOptions
): Promise<TextUpdateResult> {
  const before = await ctx.app.vault.read(target.file);
  const current = before.slice(target.range.start, target.range.end);
  const update = applyTextOperation(current, operation, options);
  if (!update.changed) return update;

  const after = spliceTextRange(before, target.range, update.value);
  if (before !== after) await ctx.app.vault.modify(target.file, after);
  return {
    changed: before !== after,
    matches: update.matches
  };
}

function applyTextOperation(
  current: string,
  operation: UpdateOperation,
  options: UpdatePayloadOptions
): TextUpdateResult & { value: string } {
  switch (operation) {
    case "set": {
      const value = requireUpdateText(options, { allowEmpty: true });
      return {
        changed: current !== value,
        value
      };
    }
    case "append": {
      const value = requireUpdateText(options, { allowEmpty: false });
      const next = current.trim() ? `${current}${current.endsWith("\n") ? "" : "\n"}${value}` : value;
      return {
        changed: current !== next,
        value: next
      };
    }
    case "prepend": {
      const value = requireUpdateText(options, { allowEmpty: false });
      const next = current.trim() ? `${value}${value.endsWith("\n") ? "" : "\n"}${current}` : value;
      return {
        changed: current !== next,
        value: next
      };
    }
    case "replace": {
      const match = requireReplaceMatch(options);
      const replacement = requireReplacementText(options);
      const matches = literalOccurrences(current, match);
      if (matches === 0) throw new Error("replace text was not found");
      if (matches > 1 && !options.all) {
        throw new Error(`replace text matched ${matches} times; pass all=true to replace all`);
      }
      const value = options.all
        ? current.split(match).join(replacement)
        : replaceFirstLiteral(current, match, replacement);
      return {
        changed: current !== value,
        matches,
        value
      };
    }
  }
}

function spliceTextRange(content: string, range: TextRange, value: string): string {
  const before = content.slice(0, range.start);
  const after = content.slice(range.end);
  let replacement = value;
  if (replacement && after && !replacement.endsWith("\n") && !after.startsWith("\n") && !after.startsWith("\r\n")) {
    replacement = `${replacement}\n`;
  }
  return `${before}${replacement}${after}`;
}

function writableSectionRange(content: string, section: ReadSectionSpec, originalKey: string): TextRange {
  const range = findSectionContentRange(content, section);
  if (!range) throw new Error(`section not found for update key: ${originalKey}`);
  const editableStart = section.skipManagedPrelude
    ? skipProjectSummaryManagedBlock(content, range.start, range.end)
    : range.start;
  return trimTextRange(content, editableStart, range.end);
}

function writableBodyRange(content: string): TextRange {
  const body = markdownBodyRange(content);
  const prelude = content.slice(body.start, body.end).match(/^\s*```para-zk-props\r?\n[\s\S]*?\r?\n```\s*/);
  const start = body.start + (prelude?.[0].length ?? 0);
  return trimTextRange(content, start, body.end);
}

function findSectionContentRange(content: string, section: ReadSectionSpec): TextRange | undefined {
  const body = markdownBodyRange(content);
  const markdown = content.slice(body.start, body.end);

  for (const label of sectionHeadingCandidates(section)) {
    const range = findSectionContentRangeByHeading(markdown, label, {
      includeSubsections: section.includeSubsections ?? false,
      offset: body.start
    });
    if (range) return range;
  }
  return undefined;
}

function findSectionContentRangeByHeading(
  content: string,
  heading: string,
  options: {
    includeSubsections: boolean;
    offset: number;
  }
): TextRange | undefined {
  const headingPattern = escapeRegExp(heading).replace(/\s+/g, "\\s+");
  const headerRe = new RegExp(`^\\s*(?<hashes>#{1,6})\\s+${headingPattern}(?=\\s|$).*?$`, "im");
  const match = content.match(headerRe);
  if (!match) return undefined;

  const level = match.groups?.hashes.length ?? 6;
  const headerEnd = (match.index ?? 0) + match[0].length;
  const sectionStart = headerEnd + lineBreakLengthAt(content, headerEnd);
  const after = content.slice(sectionStart);
  const nextBoundaryRel = nextSectionBoundary(after, options.includeSubsections ? level : undefined);
  const sectionEnd = nextBoundaryRel === -1 ? content.length : sectionStart + nextBoundaryRel;
  return {
    start: options.offset + sectionStart,
    end: options.offset + sectionEnd
  };
}

function markdownBodyRange(content: string): TextRange {
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
    return { start: 0, end: content.length };
  }

  const delimiter = content.match(/\r?\n---(?:\r?\n|$)/);
  if (!delimiter || delimiter.index === undefined) return { start: 0, end: content.length };
  return {
    start: delimiter.index + delimiter[0].length,
    end: content.length
  };
}

function skipProjectSummaryManagedBlock(content: string, start: number, end: number): number {
  let cursor = start;
  const first = readLineSpan(content, cursor, end);
  if (!first?.text.trim().startsWith("> [!tip]")) return start;

  let fenceCount = 0;
  while (cursor < end) {
    const line = readLineSpan(content, cursor, end);
    if (!line) break;
    cursor = line.next;
    if (line.text.trim() === "> ```") fenceCount += 1;
    if (fenceCount === 2) break;
  }
  if (fenceCount < 2) return start;

  while (cursor < end) {
    const line = readLineSpan(content, cursor, end);
    if (!line || line.text.trim() !== "") break;
    cursor = line.next;
  }
  return cursor;
}

function readLineSpan(text: string, start: number, end: number): { text: string; next: number } | undefined {
  if (start >= end) return undefined;
  const lf = text.indexOf("\n", start);
  const rawEnd = lf === -1 || lf >= end ? end : lf;
  const lineEnd = rawEnd > start && text.charAt(rawEnd - 1) === "\r" ? rawEnd - 1 : rawEnd;
  return {
    text: text.slice(start, lineEnd),
    next: lf === -1 || lf >= end ? end : lf + 1
  };
}

function trimTextRange(content: string, start: number, end: number): TextRange {
  let trimmedStart = start;
  let trimmedEnd = end;
  while (trimmedStart < trimmedEnd && /\s/.test(content.charAt(trimmedStart))) trimmedStart += 1;
  while (trimmedEnd > trimmedStart && /\s/.test(content.charAt(trimmedEnd - 1))) trimmedEnd -= 1;
  return {
    start: trimmedStart,
    end: trimmedEnd
  };
}

function lineBreakLengthAt(content: string, index: number): number {
  if (content.slice(index, index + 2) === "\r\n") return 2;
  return content.charAt(index) === "\n" ? 1 : 0;
}

function requireUpdateKey(value: string | undefined): string {
  const key = value?.trim() ?? "";
  if (!key) throw new Error("key is required");
  return key;
}

function parseUpdateOperation(value: string | undefined): UpdateOperation {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "set" || normalized === "append" || normalized === "prepend" || normalized === "replace") {
    return normalized;
  }
  throw new Error("op must be one of: set|append|prepend|replace");
}

function requireUpdateValue(options: UpdatePayloadOptions): unknown {
  if (!Object.prototype.hasOwnProperty.call(options, "value")) throw new Error("value is required");
  return options.value;
}

function requireUpdateText(options: UpdatePayloadOptions, config: { allowEmpty: boolean }): string {
  const value = requireUpdateValue(options);
  if (typeof value !== "string") throw new Error("section/body value must be a string");
  if (!config.allowEmpty && !value) throw new Error("value must not be empty");
  return value;
}

function requireReplaceMatch(options: UpdatePayloadOptions): string {
  const match = options.match;
  if (typeof match !== "string" || match.length === 0) throw new Error("match is required for op=replace");
  return match;
}

function requireReplacementText(options: UpdatePayloadOptions): string {
  if (!Object.prototype.hasOwnProperty.call(options, "replacement")) {
    throw new Error("with is required for op=replace");
  }
  const replacement = options.replacement;
  if (typeof replacement !== "string") throw new Error("with must be a string");
  return replacement;
}

function normalizeFrontmatterUpdateValue(type: string, key: string, value: unknown): unknown {
  if (type === "project" && key === "status") {
    return readOptionalCode(String(value), parseProjectStatusCode, "status", PROJECT_STATUS_CODE_HELP);
  }
  if (type === "project" && key === "priority") {
    return readOptionalCode(String(value), parsePriorityCode, "priority", PRIORITY_CODE_HELP);
  }
  if (type === "journal" && key === "energy") {
    return readOptionalCode(String(value), parseEnergyCode, "energy", ENERGY_CODE_HELP);
  }
  if (type === "doc" && key === "subnote_type") {
    return readOptionalCode(String(value), parseSubnoteTypeCode, "subnote_type", SUBNOTE_TYPE_CODE_HELP);
  }
  if (type === "zk_permanent" && key === "maturity") {
    return readOptionalCode(String(value), parseMaturityCode, "maturity", MATURITY_CODE_HELP);
  }
  if (type === "zk_fleeting" && key === "processed") {
    if (typeof value === "boolean") return value;
    const normalized = String(value).trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
    throw new Error("processed must be a boolean");
  }
  return value;
}

function projectStatusMovePlan(
  ctx: WorkflowContext,
  file: TFile,
  frontmatterKey: string,
  value: unknown
): { fromRoot: string; toRoot: string } | undefined {
  if (frontmatterKey !== "status" || readType(fileFrontmatter(ctx, file)) !== "project") return undefined;

  const archiveRoot = archivedCounterpartFolder(ctx, ctx.settings.paths.projectsFolder);
  const shouldBeArchived = value === "archived";
  const archived = isArchivedFile(ctx, file);
  if (shouldBeArchived && !archived) {
    return {
      fromRoot: ctx.settings.paths.projectsFolder,
      toRoot: archiveRoot
    };
  }
  if (!shouldBeArchived && archived) {
    return {
      fromRoot: archiveRoot,
      toRoot: ctx.settings.paths.projectsFolder
    };
  }
  return undefined;
}

function assertCanMoveNoteBetweenRoots(
  ctx: WorkflowContext,
  file: TFile,
  fromRoot: string,
  toRoot: string
): void {
  const normalizedFromRoot = normalizeVaultPath(fromRoot);
  const normalizedToRoot = normalizeVaultPath(toRoot);
  const folderStyleFolder = folderStyleContainer(file);
  if (folderStyleFolder) {
    const relativeFolder = relativePathUnderRoot(folderStyleFolder.path, normalizedFromRoot);
    assertVacantPath(ctx, joinVaultPath(normalizedToRoot, relativeFolder));
    return;
  }

  const relativeFile = relativePathUnderRoot(file.path, normalizedFromRoot);
  assertVacantPath(ctx, joinVaultPath(normalizedToRoot, relativeFile));
}

async function moveNoteBetweenRoots(
  ctx: WorkflowContext,
  file: TFile,
  fromRoot: string,
  toRoot: string
): Promise<{ file: TFile; fromPath: string; toPath: string }> {
  const normalizedFromRoot = normalizeVaultPath(fromRoot);
  const normalizedToRoot = normalizeVaultPath(toRoot);
  const fromPath = file.path;
  const folderStyleFolder = folderStyleContainer(file);
  assertCanMoveNoteBetweenRoots(ctx, file, normalizedFromRoot, normalizedToRoot);

  if (folderStyleFolder) {
    const relativeFolder = relativePathUnderRoot(folderStyleFolder.path, normalizedFromRoot);
    const targetFolder = joinVaultPath(normalizedToRoot, relativeFolder);
    const toPath = joinVaultPath(targetFolder, file.name);
    await ensureFolder(ctx.app, parentFolder(targetFolder));
    await ctx.app.fileManager.renameFile(folderStyleFolder, targetFolder);
    const moved = ctx.app.vault.getFileByPath(toPath);
    if (!moved) throw new Error(`failed to move ${fromPath} to ${toPath}`);
    return { file: moved, fromPath, toPath };
  }

  const relativeFile = relativePathUnderRoot(file.path, normalizedFromRoot);
  const toPath = joinVaultPath(normalizedToRoot, relativeFile);
  await ensureFolder(ctx.app, parentFolder(toPath));
  await ctx.app.fileManager.renameFile(file, toPath);
  const moved = ctx.app.vault.getFileByPath(toPath);
  if (!moved) throw new Error(`failed to move ${fromPath} to ${toPath}`);
  return { file: moved, fromPath, toPath };
}

function frontmatterValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function literalOccurrences(text: string, needle: string): number {
  if (!needle) throw new Error("replace text must not be empty");
  let count = 0;
  let index = 0;
  while (true) {
    const found = text.indexOf(needle, index);
    if (found === -1) return count;
    count += 1;
    index = found + needle.length;
  }
}

function replaceFirstLiteral(text: string, needle: string, replacement: string): string {
  const index = text.indexOf(needle);
  if (index === -1) return text;
  return `${text.slice(0, index)}${replacement}${text.slice(index + needle.length)}`;
}

function childIndex(ctx: WorkflowContext, parent: TFile): Record<string, unknown> {
  const entries: Record<string, unknown> = {};
  for (const file of childFiles(ctx, parent)) {
    const frontmatter = fileFrontmatter(ctx, file);
    const type = readType(frontmatter);
    const item: Record<string, unknown> = {
      path: file.path,
      type,
      ...archivedReadFlag(ctx, file)
    };
    const subnoteType = frontmatter.subnote_type;
    if (subnoteType !== undefined) item.subnote_type = subnoteType;
    entries[file.basename] = item;
  }
  return entries;
}

function childFiles(ctx: WorkflowContext, parent: TFile): TFile[] {
  const directFolder = parent.parent?.path ?? parentFolder(parent.path);
  const parentLink = linkToFile(parent);
  const byPath = new Map<string, TFile>();

  for (const file of ctx.app.vault.getMarkdownFiles()) {
    if (file.path === parent.path) continue;
    const frontmatter = fileFrontmatter(ctx, file);
    if (file.parent?.path === directFolder || frontmatter.parent === parentLink) {
      byPath.set(file.path, file);
    }
  }

  return Array.from(byPath.values()).sort((left, right) => left.path.localeCompare(right.path));
}

function findChild(ctx: WorkflowContext, parent: TFile, title: string): TFile | undefined {
  const matches = childFiles(ctx, parent).filter((file) => file.basename === title);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`child title is ambiguous: ${title}`);
  return undefined;
}

function specForType(type: string): ReadSurfaceSpec {
  if (type === "project") return PROJECT_READ_SPEC;
  if (type === "area") return AREA_READ_SPEC;
  if (type === "resource") return RESOURCE_READ_SPEC;
  if (type === "journal") return JOURNAL_READ_SPEC;
  if (type === "retro") return RETRO_READ_SPEC;
  if (type === "doc") return DOC_READ_SPEC;
  if (type === "zk_fleeting") return ZK_FLEETING_READ_SPEC;
  if (type === "zk_literature") return ZK_LITERATURE_READ_SPEC;
  if (type === "zk_permanent") return ZK_PERMANENT_READ_SPEC;
  return NOTE_READ_SPEC;
}

function readMapPath(map: ReadMap, parts: string[], originalKey: string): unknown {
  let current: unknown = map;
  for (const part of parts) {
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, part)) {
      throw new Error(`unknown read key: ${originalKey}`);
    }
    current = current[part];
  }
  return current;
}

function keyParts(key: string): string[] {
  return key.split("/").map((part) => part.trim()).filter(Boolean);
}

function isMarkdownScaffold(value: string): boolean {
  const text = value.trim();
  if (!text) return true;
  if (text === "-" || text === "*" || text === "+") return true;
  if (isEmptyMarkdownTable(text)) return true;
  if (isPlaceholderBulletBlock(text)) return true;
  if (isHeadingOnlyBlock(text)) return true;
  return /^>\s*#{1,6}\s+\(.+\)\s*$/.test(text);
}

function isEmptyMarkdownTable(value: string): boolean {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2 || !lines.every((line) => line.includes("|"))) return false;
  const separatorIndex = lines.findIndex((line) => /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(line));
  if (separatorIndex === -1) return false;
  const body = lines.slice(separatorIndex + 1);
  if (body.length === 0) return true;
  return body.every((line) => {
    const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
    return cells.every((cell) => cell === "");
  });
}

function isPlaceholderBulletBlock(value: string): boolean {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return true;
  return lines.every((line) => {
    const match = line.match(/^(?:[-*+]|\d+[.)])\s+(.*)$/);
    if (!match) return false;
    let body = (match[1] ?? "").trim();
    body = body.replace(/^\[[^\]\r\n]?\]\s*/, "").trim();
    return body === "" || body === "-" || /^\d{1,2}:\d{2}$/.test(body) || /^[^:]{1,80}:\s*$/.test(body);
  });
}

function isHeadingOnlyBlock(value: string): boolean {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.length > 0 && lines.every((line) => /^#{1,6}\s+\S/.test(line));
}

function readReferences(_content: string, context: SectionTransformContext): Record<string, ReferenceRead> {
  const items: Record<string, ReferenceRead> = {};
  if (!context.range) return items;

  let cursor = context.range.start;
  let line = lineNumberAt(context.content, context.range.start);
  while (cursor < context.range.end) {
    const span = readLineSpan(context.content, cursor, context.range.end);
    if (!span) break;

    const reference = readReferenceLine(context.ctx, context.file.path, line, span.text);
    if (reference) {
      const id = uniqueReadId(reference.id, items);
      items[id] = reference.reference;
    }

    cursor = span.next;
    line += 1;
  }

  return items;
}

function readReferenceLine(ctx: WorkflowContext, sourcePath: string, line: number, text: string): ReferenceLineRead | undefined {
  const body = stripReferenceLineMarker(text);
  if (!body) return undefined;

  const reference = parseReferenceBody(ctx, sourcePath, body);
  const idSource = reference.path ?? reference.target ?? reference.text ?? body;
  return {
    id: `ref-${hashReadId(idSource || `${sourcePath}:${line}:${body}`)}`,
    reference
  };
}

function stripReferenceLineMarker(value: string): string {
  let text = value.trim();
  text = text.replace(/^(?:>\s*)+/, "").trim();
  text = text.replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, "").trim();
  return text;
}

function parseReferenceBody(ctx: WorkflowContext, sourcePath: string, value: string): ReferenceRead {
  const wiki = value.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
  if (wiki) return readWikiReference(ctx, sourcePath, wiki[1], wiki[2]);

  const markdown = value.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (markdown) return readMarkdownReference(ctx, markdown[1], markdown[2]);

  if (isExternalReference(value)) {
    return {
      kind: "url",
      target: value
    };
  }

  return {
    kind: "text",
    text: value
  };
}

function readWikiReference(
  ctx: WorkflowContext,
  sourcePath: string,
  rawTarget: string,
  rawLabel: string | undefined
): ReferenceRead {
  const target = rawTarget.trim();
  const dest = ctx.app.metadataCache.getFirstLinkpathDest(target, sourcePath);
  const path = dest?.path ?? normalizeVaultPath(target.split("#")[0]);
  return {
    kind: path.endsWith(".md") ? "note" : "wiki",
    path,
    label: rawLabel?.trim() || pathBasenameWithoutExtension(path)
  };
}

function readMarkdownReference(ctx: WorkflowContext, rawLabel: string, rawTarget: string): ReferenceRead {
  const label = rawLabel.trim();
  const target = rawTarget.trim();
  if (isExternalReference(target)) {
    return {
      kind: "url",
      label,
      target
    };
  }

  const path = normalizeVaultPath(target);
  const file = ctx.app.vault.getAbstractFileByPath(path);
  if (file instanceof TFile) {
    return {
      kind: path.endsWith(".md") ? "note" : "file",
      label,
      path
    };
  }

  return {
    kind: "markdown",
    label,
    target
  };
}

const TASK_DATE_FIELDS: Array<{ key: keyof TaskMetadata; re: RegExp }> = [
  { key: "due", re: /\u{1F4C5}\s*(\d{4}-\d{2}-\d{2})/gu },
  { key: "scheduled", re: /\u{23F3}\s*(\d{4}-\d{2}-\d{2})/gu },
  { key: "start", re: /\u{1F6EB}\s*(\d{4}-\d{2}-\d{2})/gu },
  { key: "created", re: /\u{2795}\s*(\d{4}-\d{2}-\d{2})/gu },
  { key: "done", re: /\u{2705}\s*(\d{4}-\d{2}-\d{2})/gu },
  { key: "cancelled", re: /\u{274C}\s*(\d{4}-\d{2}-\d{2})/gu }
];

const TASK_PRIORITY_FIELDS: Array<{ value: string; re: RegExp }> = [
  { value: "highest", re: /\u{1F53A}/gu },
  { value: "high", re: /\u{23EB}/gu },
  { value: "medium", re: /\u{1F53C}/gu },
  { value: "low", re: /\u{1F53D}/gu },
  { value: "lowest", re: /\u{23EC}/gu }
];

function readProjectTasks(_content: string, context: SectionTransformContext): Record<string, ProjectTaskRead> {
  const items: Record<string, ProjectTaskRead> = {};

  if (!context.range) return items;

  let cursor = context.range.start;
  let line = lineNumberAt(context.content, context.range.start);
  while (cursor < context.range.end) {
    const span = readLineSpan(context.content, cursor, context.range.end);
    if (!span) break;

    const task = readProjectTaskLine(context.file.path, line, span.text);
    if (task) {
      const id = uniqueReadId(task.id, items);
      items[id] = task.task;
    }

    cursor = span.next;
    line += 1;
  }

  return items;
}

function readProjectTaskLine(path: string, line: number, text: string): ProjectTaskLineRead | undefined {
  const match = text.match(/^\s*(?:[-*+]|\d+[.)])\s+\[([^\]\r\n]?)\]\s*(.*)$/);
  if (!match) return undefined;

  const checkbox = match[1] ?? " ";
  const parsed = parseTaskBody(match[2] ?? "");
  if (!parsed.name) return undefined;

  const id = parsed.blockId ?? syntheticTaskReadId(path, line, text);
  return {
    id,
    task: {
      checkbox,
      name: parsed.name,
      ...parsed.metadata
    }
  };
}

function parseTaskBody(value: string): { name: string; blockId?: string; metadata: TaskMetadata } {
  let body = value.trim();
  const blockId = readTrailingBlockId(body);
  if (blockId) body = body.replace(/\s+\^[A-Za-z0-9_-]+\s*$/, "").trim();

  const metadata: TaskMetadata = {};
  body = stripDataviewTaskFields(body, metadata);
  body = stripEmojiTaskDates(body, metadata);
  body = stripEmojiTaskPriority(body, metadata);

  return {
    name: body.replace(/\s{2,}/g, " ").trim(),
    blockId,
    metadata
  };
}

function readTrailingBlockId(value: string): string | undefined {
  return value.match(/\s+\^([A-Za-z0-9_-]+)\s*$/)?.[1];
}

function stripDataviewTaskFields(value: string, metadata: TaskMetadata): string {
  return value.replace(/\[(due|scheduled|start|created|completion|done|cancelled|priority)::\s*([^\]]+)\]/gi, (
    _match,
    rawKey: string,
    rawValue: string
  ) => {
    const key = normalizeTaskMetadataKey(rawKey);
    const taskValue = rawValue.trim();
    if (key && taskValue && metadata[key] === undefined) metadata[key] = normalizeTaskMetadataValue(key, taskValue);
    return " ";
  });
}

function stripEmojiTaskDates(value: string, metadata: TaskMetadata): string {
  let result = value;
  for (const field of TASK_DATE_FIELDS) {
    result = result.replace(field.re, (_match, rawDate: string) => {
      if (metadata[field.key] === undefined) metadata[field.key] = rawDate;
      return " ";
    });
  }
  return result;
}

function stripEmojiTaskPriority(value: string, metadata: TaskMetadata): string {
  let result = value;
  for (const priority of TASK_PRIORITY_FIELDS) {
    result = result.replace(priority.re, () => {
      if (metadata.priority === undefined) metadata.priority = priority.value;
      return " ";
    });
  }
  return result;
}

function normalizeTaskMetadataKey(value: string): keyof TaskMetadata | undefined {
  const key = value.trim().toLowerCase();
  if (key === "completion") return "done";
  if (
    key === "due"
    || key === "scheduled"
    || key === "start"
    || key === "created"
    || key === "done"
    || key === "cancelled"
    || key === "priority"
  ) {
    return key;
  }
  return undefined;
}

function normalizeTaskMetadataValue(key: keyof TaskMetadata, value: string): string {
  return key === "priority" ? value.toLowerCase() : value;
}

function uniqueReadId(id: string, items: Record<string, unknown>): string {
  if (!Object.prototype.hasOwnProperty.call(items, id)) return id;
  let index = 2;
  while (Object.prototype.hasOwnProperty.call(items, `${id}-${index}`)) index += 1;
  return `${id}-${index}`;
}

function syntheticTaskReadId(path: string, line: number, text: string): string {
  return `task-${hashReadId(`${path}:${line}:${text.trim()}`)}`;
}

function hashReadId(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function lineNumberAt(content: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (content.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

function readSection(
  content: string,
  labels: string[],
  options: { includeSubsections?: boolean } = {}
): string {
  const body = stripYamlFrontmatter(content);
  for (const label of labels) {
    const section = readSectionByHeading(body, label, options);
    if (section !== undefined) return section;
  }
  return "";
}

function readSectionByHeading(
  content: string,
  heading: string,
  options: { includeSubsections?: boolean } = {}
): string | undefined {
  const headingPattern = escapeRegExp(heading).replace(/\s+/g, "\\s+");
  const headerRe = new RegExp(`^\\s*(?<hashes>#{1,6})\\s+${headingPattern}(?=\\s|$).*?$`, "im");
  const match = content.match(headerRe);
  if (!match) return undefined;

  const level = match.groups?.hashes.length ?? 6;
  const headerEnd = (match.index ?? 0) + match[0].length;
  const sectionStart = content.charAt(headerEnd) === "\n" ? headerEnd + 1 : headerEnd;
  const after = content.slice(sectionStart);
  const nextBoundaryRel = nextSectionBoundary(after, options.includeSubsections ? level : undefined);
  const sectionEnd = nextBoundaryRel === -1 ? content.length : sectionStart + nextBoundaryRel;
  return trimMarkdownBlock(content.slice(sectionStart, sectionEnd));
}

function nextSectionBoundary(content: string, maxHeadingLevel: number | undefined): number {
  const headingRe = maxHeadingLevel
    ? new RegExp(`^\\s*#{1,${maxHeadingLevel}}\\s+`, "m")
    : /^\s*#{1,6}\s+/m;
  const thematicBreakRe = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/m;
  return minFoundIndex(content.search(headingRe), content.search(thematicBreakRe));
}

function minFoundIndex(left: number, right: number): number {
  if (left === -1) return right;
  if (right === -1) return left;
  return Math.min(left, right);
}

function stripProjectSummaryManagedBlock(content: string): string {
  const lines = content.split("\n");
  if (!lines[0]?.trim().startsWith("> [!tip]")) return content;

  let fenceCount = 0;
  let index = 0;
  for (; index < lines.length; index += 1) {
    if (lines[index].trim() === "> ```") fenceCount += 1;
    if (fenceCount === 2) {
      index += 1;
      break;
    }
  }

  while (lines[index]?.trim() === "") index += 1;
  return trimMarkdownBlock(lines.slice(index).join("\n"));
}

function stripManagedPrelude(content: string): string {
  return trimMarkdownBlock(stripYamlFrontmatter(content).replace(/^\s*```para-zk-props\n[\s\S]*?\n```\s*/, ""));
}

function stripYamlFrontmatter(content: string): string {
  if (!content.startsWith("---\n")) return content;
  const end = content.indexOf("\n---", 4);
  if (end === -1) return content;
  const after = end + "\n---".length;
  return content.charAt(after) === "\n" ? content.slice(after + 1) : content.slice(after);
}

function sectionLabels(labelKey: string): string[] {
  return uniqueStrings([
    localePack("en").labels[labelKey],
    localePack("ko").labels[labelKey]
  ]);
}

function sectionHeadingCandidates(section: ReadSectionSpec): string[] {
  return uniqueStrings([
    ...(section.labelKey ? sectionLabels(section.labelKey) : []),
    ...(section.labels ?? [])
  ]);
}

function trimMarkdownBlock(value: string): string {
  return value
    .replace(/^(?:[ \t]*\n)+/, "")
    .replace(/(?:\n[ \t]*)+$/, "");
}

function pickFrontmatter(frontmatter: Frontmatter, keys: string[]): Frontmatter {
  const result: Frontmatter = {};
  for (const key of keys) {
    if (frontmatter[key] !== undefined) result[key] = frontmatter[key];
  }
  return result;
}

function fileFrontmatter(ctx: WorkflowContext, file: TFile): Frontmatter {
  return ctx.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
}

function readType(frontmatter: Frontmatter): string {
  const type = frontmatter.type;
  return typeof type === "string" && type.trim() ? type : "note";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

  const folder = folderStyleContainer(file);
  let renamed: TFile;
  let toPath: string;
  if (folder) {
    const targetFolder = joinVaultPath(parentFolder(folder.path), newTitle);
    toPath = joinVaultPath(targetFolder, `${newTitle}.md`);
    assertVacantPath(ctx, targetFolder);
    const conflictingFile = ctx.app.vault.getAbstractFileByPath(joinVaultPath(folder.path, `${newTitle}.md`));
    if (conflictingFile && conflictingFile !== file) {
      throw new Error(`target already exists: ${joinVaultPath(folder.path, `${newTitle}.md`)}`);
    }
    await ctx.app.fileManager.renameFile(folder, targetFolder);

    renamed = ctx.app.vault.getFileByPath(toPath) ?? await renameMovedFolderStyleMain(ctx, targetFolder, file.name, toPath);
  } else {
    toPath = joinVaultPath(parentFolder(file.path), `${newTitle}.md`);
    assertVacantPath(ctx, toPath);
    await ctx.app.fileManager.renameFile(file, toPath);
    renamed = ctx.app.vault.getFileByPath(toPath) ?? file;
  }

  const tagUpdate = await updateTitleDerivedTag(ctx, renamed, tagDomain, fromTitle, newTitle);
  if (tagDomain === "area" && folder) {
    await updateAreaDescendantTagPrefixes(ctx, toPath, tagUpdate.namespaceMoves);
  }
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

async function renameMovedFolderStyleMain(
  ctx: WorkflowContext,
  targetFolder: string,
  oldFileName: string,
  toPath: string
): Promise<TFile> {
  const movedPath = joinVaultPath(targetFolder, oldFileName);
  const movedMain = ctx.app.vault.getFileByPath(movedPath);
  if (!movedMain) throw new Error(`failed to find moved note at ${movedPath}`);

  assertVacantPath(ctx, toPath);
  await ctx.app.fileManager.renameFile(movedMain, toPath);
  return ctx.app.vault.getFileByPath(toPath) ?? movedMain;
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
  await ctx.app.fileManager.renameFile(file, toPath);
  const renamed = ctx.app.vault.getFileByPath(toPath) ?? file;
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

  await ctx.app.fileManager.processFrontMatter(file, (fm) => {
    const existing = frontmatterLinks(fm.tags);
    let replaced = false;
    const next = existing.map((tag) => {
      const normalized = tag.startsWith("#") ? tag.slice(1) : tag;
      if (knownPrefixes.some((prefix) => normalized.startsWith(`${prefix}/`))) {
        const renamed = renamedTitleTag(normalized, knownPrefixes, activeTagPrefix, fromTitle, title, domain);
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
  title: string,
  domain: TagDomain
): { tag: string; changed: boolean } {
  const oldTitleSlug = slugify(fromTitle);
  const titleSlug = slugify(title);
  const matchingPrefix = knownPrefixes.find((prefix) => tag.startsWith(`${prefix}/`));
  if (!matchingPrefix) return { tag: `${activeTagPrefix}/${titleSlug}`, changed: true };
  if (domain !== "area") return { tag: `${activeTagPrefix}/${titleSlug}`, changed: true };

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
  const descendants = ctx.app.vault.getMarkdownFiles().filter((file) => {
    return file.path !== renamedAreaPath
      && isInFolder(file, folder)
      && readType(fileFrontmatter(ctx, file)) === "area";
  });

  for (const descendant of descendants) {
    await ctx.app.fileManager.processFrontMatter(descendant, (fm) => {
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

async function deleteDomainNote(
  ctx: WorkflowContext,
  file: TFile,
  options: { force?: boolean }
): Promise<DeleteResult> {
  const type = readType(fileFrontmatter(ctx, file));
  const container = deleteContainer(ctx, file);
  const containerPath = container.path;
  const deletedPaths = collectAbstractPaths(container);
  const deletedPathSet = new Set(deletedPaths);
  const deletedFiles = deletedMarkdownFiles(ctx, container);
  const deletedFilePaths = new Set(deletedFiles.map((item) => item.path));
  const extraPaths = deletedPaths.filter((path) => path !== containerPath && path !== file.path);
  if (extraPaths.length > 0 && !options.force) {
    throw new Error(`delete target contains child files; pass force=true to delete: ${extraPaths.join(", ")}`);
  }

  const incomingLinks = incomingLinksForPaths(ctx, deletedFilePaths, deletedPathSet);
  const cleaned = await cleanupStructuredReferences(ctx, deletedFiles, deletedPathSet);
  const trashMethod = await trashAbstractFile(ctx, container);

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
  return ctx.app.vault.getMarkdownFiles().filter((file) => isInFolder(file, container.path));
}

async function trashAbstractFile(ctx: WorkflowContext, file: TAbstractFile): Promise<string> {
  const fileManager = ctx.app.fileManager as typeof ctx.app.fileManager & {
    trashFile?: (target: TAbstractFile) => Promise<void>;
  };
  if (typeof fileManager.trashFile === "function") {
    await fileManager.trashFile(file);
    return "fileManager.trashFile";
  }

  await ctx.app.vault.trash(file, false);
  return "vault.trash.local";
}

function incomingLinksForPaths(
  ctx: WorkflowContext,
  targetPaths: Set<string>,
  deletedPathSet: Set<string>
): IncomingLink[] {
  const resolvedLinks = ctx.app.metadataCache.resolvedLinks;
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
    references: await cleanupReferenceSectionLinks(ctx, targets, deletedPathSet)
  };
}

async function cleanupFrontmatterReferences(
  ctx: WorkflowContext,
  targets: TFile[],
  deletedPathSet: Set<string>
): Promise<number> {
  let changedKeys = 0;
  const keys = ["areas", "project", "parent", "promoted_to"];
  for (const file of ctx.app.vault.getMarkdownFiles()) {
    if (deletedPathSet.has(file.path)) continue;
    const frontmatter = fileFrontmatter(ctx, file);
    if (!keys.some((key) => frontmatterNeedsTargetCleanup(ctx, file.path, frontmatter[key], targets))) continue;
    await ctx.app.fileManager.processFrontMatter(file, (fm) => {
      for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(fm, key)) continue;
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

async function cleanupReferenceSectionLinks(
  ctx: WorkflowContext,
  targets: TFile[],
  deletedPathSet: Set<string>
): Promise<number> {
  let removed = 0;
  for (const file of ctx.app.vault.getMarkdownFiles()) {
    if (deletedPathSet.has(file.path)) continue;
    const count = await removeSafeReferenceLines(ctx, file, targets);
    removed += count;
  }
  return removed;
}

async function removeSafeReferenceLines(
  ctx: WorkflowContext,
  source: TFile,
  targets: TFile[]
): Promise<number> {
  const content = await ctx.app.vault.read(source);
  const range = referenceCleanupRange(content);
  if (!range) return 0;

  const spans: TextRange[] = [];
  let cursor = range.start;
  while (cursor < range.end) {
    const span = lineTextRangeAt(content, cursor, range.end);
    if (!span) break;
    const text = content.slice(span.start, span.endWithoutBreak);
    const linkPath = standaloneReferenceLinkPath(text);
    if (linkPath && linkReferencesAnyTarget(ctx, source.path, linkPath, targets)) {
      spans.push({
        start: span.start,
        end: span.end
      });
    }
    cursor = span.end;
  }
  if (spans.length === 0) return 0;

  const updated = removeTextRanges(content, spans);
  if (updated !== content) await ctx.app.vault.modify(source, updated);
  return spans.length;
}

function referenceCleanupRange(content: string): TextRange | undefined {
  const sections: ReadSectionSpec[] = [
    { key: "references", labelKey: "references" },
    { key: "links", labelKey: "links", includeSubsections: true },
    { key: "links", labels: ["Links", "링크"], includeSubsections: true }
  ];
  for (const section of sections) {
    const range = findSectionContentRange(content, section);
    if (range) return range;
  }
  return undefined;
}

function standaloneReferenceLinkPath(line: string): string | undefined {
  let text = line.trim();
  text = text.replace(/^(?:>\s*)+/, "").trim();
  text = text.replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, "").trim();
  if (!text) return undefined;
  return readWikiLinkPath(text);
}

function lineTextRangeAt(
  content: string,
  start: number,
  maxEnd: number
): (TextRange & { endWithoutBreak: number }) | undefined {
  if (start >= maxEnd) return undefined;
  const newline = content.indexOf("\n", start);
  const end = newline === -1 || newline + 1 > maxEnd ? maxEnd : newline + 1;
  const endWithoutBreak = newline === -1 || newline >= maxEnd ? maxEnd : newline;
  return {
    start,
    end,
    endWithoutBreak
  };
}

function removeTextRanges(content: string, ranges: TextRange[]): string {
  let result = content;
  const ordered = [...ranges].sort((left, right) => right.start - left.start);
  for (const range of ordered) {
    result = `${result.slice(0, range.start)}${result.slice(range.end)}`;
  }
  return result;
}

function stringReferencesAnyTarget(
  ctx: WorkflowContext,
  sourcePath: string,
  value: string,
  targets: TFile[]
): boolean {
  const wikiTarget = readWikiLinkPath(value);
  if (wikiTarget) return linkReferencesAnyTarget(ctx, sourcePath, wikiTarget, targets);

  const normalized = normalizeVaultPath(value);
  return targets.some((target) => normalized === target.path || normalized === target.basename);
}

function linkReferencesAnyTarget(
  ctx: WorkflowContext,
  sourcePath: string,
  linkPath: string,
  targets: TFile[]
): boolean {
  const targetPaths = new Set(targets.map((target) => target.path));
  const resolved = ctx.app.metadataCache.getFirstLinkpathDest(linkPath, sourcePath);
  if (resolved && targetPaths.has(resolved.path)) return true;

  const normalized = normalizeVaultPath(linkPath.split("#")[0]);
  return targets.some((target) => normalized === target.path || normalized === target.basename);
}

function readWikiLinkPath(value: string): string | undefined {
  const match = value.trim().match(/^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]$/);
  return match?.[1]?.trim();
}

function folderStyleContainer(file: TFile): TFolder | undefined {
  const folder = file.parent;
  return folder && folder.name === file.basename ? folder : undefined;
}

function assertVacantPath(ctx: WorkflowContext, path: string): void {
  const normalized = normalizeVaultPath(path);
  if (ctx.app.vault.getAbstractFileByPath(normalized)) {
    throw new Error(`target already exists: ${normalized}`);
  }
}

function relativePathUnderRoot(path: string, root: string): string {
  const normalizedPath = normalizeVaultPath(path);
  const normalizedRoot = normalizeVaultPath(root);
  if (normalizedPath === normalizedRoot) return "";
  if (!normalizedPath.startsWith(`${normalizedRoot}/`)) {
    throw new Error(`${normalizedPath} is not under ${normalizedRoot}`);
  }
  return normalizedPath.slice(normalizedRoot.length + 1);
}

async function ensureFolderStyleParent(ctx: WorkflowContext, file: TFile): Promise<{
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

async function ensureFolder(app: App, folder: string): Promise<void> {
  const normalized = normalizeVaultPath(folder);
  if (!normalized) return;

  const parts = normalized.split("/");
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const existing = app.vault.getAbstractFileByPath(current);
    if (existing instanceof TFolder) continue;
    if (existing) throw new Error(`cannot create folder; a file exists at ${current}`);
    await app.vault.createFolder(current);
  }
}

async function uniqueMarkdownPath(app: App, path: string): Promise<string> {
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

function ensureMdPath(path: string): string {
  const normalized = normalizeVaultPath(path);
  return /\.md$/i.test(normalized) ? normalized : `${normalized}.md`;
}

function folderForZkKind(settings: ParaZkSettings, kind: ZkKind | PromotionZkKind): string {
  if (kind === "Literature") return settings.paths.literatureFolder;
  if (kind === "Permanent") return settings.paths.permanentFolder;
  return settings.paths.fleetingFolder;
}

function resolveRequiredProject(ctx: WorkflowContext, options: ReadProjectOptions): TFile {
  const file = options.path
    ? resolveRequiredFile(ctx, options.path, "project note")
    : findProjectByTitle(ctx, requireTitle(options.title, "project title"), options.archived);
  if (!file) throw new Error(`project not found: ${options.title}`);

  const type = readType(fileFrontmatter(ctx, file));
  if (type !== "project") throw new Error(`file is not a project note: ${file.path}`);
  return file;
}

function resolveRequiredArea(ctx: WorkflowContext, options: ReadAreaOptions): TFile {
  const file = options.path
    ? resolveRequiredFile(ctx, options.path, "area note")
    : findAreaByTitleForRead(ctx, requireTitle(options.title, "area title"), options.archived);
  if (!file) throw new Error(`area not found: ${options.title}`);

  const type = readType(fileFrontmatter(ctx, file));
  if (type !== "area") throw new Error(`file is not an area note: ${file.path}`);
  return file;
}

function resolveRequiredResource(ctx: WorkflowContext, options: ReadResourceOptions): TFile {
  const file = options.path
    ? resolveRequiredFile(ctx, options.path, "resource note")
    : findResourceByTitle(ctx, requireTitle(options.title, "resource title"), options.archived);
  if (!file) throw new Error(`resource not found: ${options.title}`);

  const type = readType(fileFrontmatter(ctx, file));
  if (type !== "resource") throw new Error(`file is not a resource note: ${file.path}`);
  return file;
}

function resolveRequiredZk(ctx: WorkflowContext, options: ReadZkOptions): TFile {
  const kind = readOptionalCode(options.kind, parseZkKind, "kind", ZK_KIND_CODE_HELP);
  const file = options.path
    ? resolveRequiredFile(ctx, options.path, "ZK note")
    : findZkByTitle(ctx, requireTitle(options.title, "ZK title"), kind);
  if (!file) throw new Error(`ZK note not found: ${options.title}`);

  const type = readType(fileFrontmatter(ctx, file));
  if (!type.startsWith("zk_")) throw new Error(`file is not a ZK note: ${file.path}`);
  if (kind && type !== typeForZkKind(kind)) throw new Error(`file is not a ${kind} ZK note: ${file.path}`);
  return file;
}

function resolveRequiredJournal(ctx: WorkflowContext, options: ReadJournalOptions): TFile {
  const file = options.path
    ? resolveRequiredFile(ctx, options.path, "journal note")
    : ctx.app.vault.getFileByPath(journalPath(ctx, options.date));
  if (!file) throw new Error(`journal not found: ${localDate(dateFromCli(options.date))}`);

  const type = readType(fileFrontmatter(ctx, file));
  if (type !== "journal") throw new Error(`file is not a journal note: ${file.path}`);
  return file;
}

function resolveRequiredRetro(ctx: WorkflowContext, options: ReadRetroOptions): TFile {
  const file = options.path
    ? resolveRequiredFile(ctx, options.path, "retro note")
    : findRetroByTitle(ctx, requireTitle(options.title, "retro title"), options.date, options.archived);
  if (!file) throw new Error(`retro not found: ${options.title}`);

  const type = readType(fileFrontmatter(ctx, file));
  if (type !== "retro") throw new Error(`file is not a retro note: ${file.path}`);
  return file;
}

function resolveRequiredFile(ctx: WorkflowContext, path: string | undefined, label: string): TFile {
  const file = resolveOptionalFile(ctx, path) ?? ctx.app.workspace.getActiveFile();
  if (!file) throw new Error(`${label} is required`);
  return file;
}

function resolveOptionalFile(ctx: WorkflowContext, path: string | undefined): TFile | undefined {
  const normalized = normalizeVaultPath(path);
  if (!normalized) return undefined;
  const file = ctx.app.vault.getFileByPath(normalized);
  if (!file) throw new Error(`file not found: ${normalized}`);
  return file;
}

function findProjectByTitle(ctx: WorkflowContext, title: string, archived: boolean | undefined): TFile | undefined {
  const folders = archiveAwareFolders(ctx, ctx.settings.paths.projectsFolder, archived);
  const canonicalPaths = folders.flatMap((folder) => folderStyleCanonicalPaths(folder, title));

  for (const path of canonicalPaths) {
    const file = ctx.app.vault.getFileByPath(path);
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
    const file = ctx.app.vault.getFileByPath(path);
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
    const file = ctx.app.vault.getFileByPath(joinVaultPath(folder, `${title}.md`));
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
    const file = ctx.app.vault.getFileByPath(joinVaultPath(folder, `${title}.md`));
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
  const files = ctx.app.vault.getMarkdownFiles().filter((file) => {
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

function archiveAwareFolders(ctx: WorkflowContext, activeFolder: string, archived: boolean | undefined): string[] {
  const active = normalizeVaultPath(activeFolder);
  const archive = archivedCounterpartFolder(ctx, active);
  if (archived === true) return [archive];
  if (archived === false) return [active];
  return [active, archive];
}

function archivedCounterpartFolder(ctx: WorkflowContext, activeFolder: string): string {
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

function zkSearchFolders(ctx: WorkflowContext, kind: ZkKind | undefined): string[] {
  return kind
    ? [folderForZkKind(ctx.settings, kind)]
    : [ctx.settings.paths.fleetingFolder, ctx.settings.paths.literatureFolder, ctx.settings.paths.permanentFolder];
}

function isArchivedFile(ctx: WorkflowContext, file: TFile): boolean {
  return isInFolder(file, ctx.settings.paths.archivesFolder);
}

function folderName(path: string): string {
  return normalizeVaultPath(path).split("/").filter(Boolean).pop() ?? "";
}

function requireTitle(value: string | undefined, label: string): string {
  const title = sanitizeFileName(value ?? "");
  if (!title) throw new Error(`${label} is required`);
  return title;
}

function linkToFile(file: TFile): string {
  return wikiLink(file.path, file.basename);
}

function noteResult(file: TFile, created: boolean, open?: boolean): NoteResult {
  return {
    path: file.path,
    title: file.basename,
    created,
    opened: open || undefined
  };
}

function applyCreatedUpdatedDefaults(frontmatter: {
  created?: unknown;
  updated?: unknown;
}, createdAt: string): void {
  frontmatter.created = frontmatter.created || createdAt;
  if (frontmatter.updated === undefined) frontmatter.updated = "";
}

async function ensureJournal(ctx: WorkflowContext, options: OpenJournalOptions): Promise<{
  file: TFile;
  created: boolean;
  date: string;
  energy: EnergyCode;
}> {
  const date = dateFromCli(options.date);
  const dateText = localDate(date);
  const createdAt = localDateTimeSpace();
  const energyCode = readOptionalCode(options.energy, parseEnergyCode, "energy", ENERGY_CODE_HELP);
  const energy = energyCode ?? "normal";
  const folder = joinVaultPath(ctx.settings.paths.journalFolder, dateText.slice(0, 7));
  await ensureFolder(ctx.app, folder);
  const path = joinVaultPath(folder, `${dateText}.md`);

  let created = false;
  let file = ctx.app.vault.getFileByPath(path);
  if (!file) {
    created = true;
    file = await createMarkdownFile(ctx, "journal", path, {
      created: createdAt,
      date: dateText,
      energy,
      cursor: ""
    });
  }

  const tags = localePack(ctx.settings.locale).tags;
  await ctx.app.fileManager.processFrontMatter(file, (fm) => {
    fm.type = "journal";
    fm.date = fm.date || dateText;
    fm.energy = fm.energy ?? energy;
    fm.tags = fm.tags || [tags.journal];
    applyCreatedUpdatedDefaults(fm, createdAt);
  });

  return {
    file,
    created,
    date: dateText,
    energy
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
    const file = ctx.app.vault.getFileByPath(created.path);
    if (!file) throw new Error(`created area file not found: ${created.path}`);
    results.push(areaResult(file, true));
  }

  return results;
}

function findAreaByTitle(ctx: WorkflowContext, title: string): TFile | undefined {
  const canonicalPaths = [
    joinVaultPath(ctx.settings.paths.areasFolder, title, `${title}.md`),
    joinVaultPath(ctx.settings.paths.areasFolder, `${title}.md`)
  ];

  for (const path of canonicalPaths) {
    const file = ctx.app.vault.getFileByPath(path);
    if (file) return file;
  }

  const areaFiles = ctx.app.vault.getMarkdownFiles().filter((file) => {
    const frontmatter = ctx.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    return frontmatter.type === "area" && isInFolder(file, ctx.settings.paths.areasFolder);
  });
  const exactMatches = areaFiles.filter((file) => file.basename === title);
  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1) throw new Error(`area title is ambiguous: ${title}`);

  const foldedTitle = title.toLocaleLowerCase();
  const foldedMatches = areaFiles.filter((file) => file.basename.toLocaleLowerCase() === foldedTitle);
  if (foldedMatches.length === 1) return foldedMatches[0];
  if (foldedMatches.length > 1) throw new Error(`area title is ambiguous: ${title}`);

  return undefined;
}

function areaResult(file: TFile, created: boolean): ProjectAreaResult {
  return {
    title: file.basename,
    path: file.path,
    link: linkToFile(file),
    created
  };
}

function isInFolder(file: TFile, folder: string): boolean {
  const normalized = normalizeVaultPath(folder);
  return file.path === normalized || file.path.startsWith(`${normalized}/`);
}

async function openIfRequested(ctx: WorkflowContext, file: TFile, open?: boolean): Promise<void> {
  if (!open) return;
  await ctx.app.workspace.getLeaf(true).openFile(file);
}

function parentFolder(path: string): string {
  const normalized = normalizeVaultPath(path);
  const index = normalized.lastIndexOf("/");
  return index === -1 ? "" : normalized.slice(0, index);
}

function frontmatterListBlock(values: string[] | undefined): string {
  const items = values?.map((value) => value.trim()).filter(Boolean) ?? [];
  if (items.length === 0) return "";
  return `\n${items.map((value) => `  - ${yamlScalar(value)}`).join("\n")}`;
}

function inlineList(values: string[] | undefined): string {
  return values?.map((value) => value.trim()).filter(Boolean).join(", ") ?? "";
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
