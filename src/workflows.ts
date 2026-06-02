import { App, TAbstractFile, TFile, TFolder, parseYaml } from "obsidian";
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
  description?: string;
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
  title?: string;
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

export type CollectionReadOptions = {
  offset?: number;
  limit?: number | "all";
  query?: string;
  checkbox?: string;
  priority?: string;
  dueBefore?: string;
  dueAfter?: string;
  refKind?: string;
};

type ReadOptionsWithCollection = {
  collection?: CollectionReadOptions;
};

type ByTitleSelectorOptions = {
  path?: string;
  title?: string;
  key?: string;
  archived?: boolean;
};

type ZkSelectorOptions = {
  path?: string;
  title?: string;
  key?: string;
  kind?: string;
};

type JournalSelectorOptions = {
  path?: string;
  date?: string;
  key?: string;
};

export type ReadByTitleOptions = ReadOptionsWithCollection & ByTitleSelectorOptions;
export type ReadProjectOptions = ReadByTitleOptions;
export type ReadAreaOptions = ReadByTitleOptions;
export type ReadResourceOptions = ReadByTitleOptions;

export type ReadZkOptions = ReadOptionsWithCollection & ZkSelectorOptions;

export type ReadJournalOptions = ReadOptionsWithCollection & JournalSelectorOptions;

export type ReadRetroOptions = ReadOptionsWithCollection & ByTitleSelectorOptions & {
  date?: string;
};

export type UpdateOperation = "set" | "insert" | "append" | "prepend" | "replace" | "delete";

export type UpdatePayloadOptions = {
  key?: string;
  operation?: string;
  value?: unknown;
  valueSource?: "value" | "value_json";
  match?: string;
  replacement?: string;
  all?: boolean;
};

export type UpdateByTitleOptions = ByTitleSelectorOptions & UpdatePayloadOptions;
export type UpdateProjectOptions = UpdateByTitleOptions;
export type UpdateAreaOptions = UpdateByTitleOptions;
export type UpdateResourceOptions = UpdateByTitleOptions;

export type UpdateZkOptions = ZkSelectorOptions & UpdatePayloadOptions;
export type UpdateJournalOptions = JournalSelectorOptions & UpdatePayloadOptions;
export type UpdateRetroOptions = ByTitleSelectorOptions & { date?: string } & UpdatePayloadOptions;

export type UpdateSurfaceResult = {
  path: string;
  title: string;
  type: string;
  archived: boolean;
  key: string;
  operation: UpdateOperation;
  changed: boolean;
  matches?: number;
  index?: number;
  link?: string;
  added?: boolean;
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
  renamedRetros?: Array<{
    fromPath: string;
    toPath: string;
  }>;
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
type ReadCollectionKind = "task" | "reference";
type ReadSectionSpec = {
  key: string;
  labelKey?: string;
  labels?: string[];
  includeSubsections?: boolean;
  skipManagedPrelude?: boolean;
  collection?: ReadCollectionKind;
  transform?: (content: string, context: SectionTransformContext) => unknown | Promise<unknown>;
};
type ReadSurfaceSpec = {
  frontmatter: string[];
  sections?: ReadSectionSpec[];
  body?: boolean;
  children?: boolean;
};
export type TaskRead = {
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
type TaskLineRead = {
  id: string;
  task: TaskRead;
};
type TaskWrite = {
  task: TaskRead;
  position: number | "end";
};
type TaskMetadata = Pick<TaskRead, "due" | "scheduled" | "start" | "created" | "done" | "cancelled" | "priority">;
type TaskDateMetadataField = Exclude<keyof TaskMetadata, "priority">;
export type TaskWritableField = keyof TaskRead;
type EditableTaskLine = {
  id: string;
  range: TextRange & { endWithoutBreak: number };
  prefix: string;
  checkboxSuffix: string;
  task: TaskRead;
  taskId?: string;
  blockId?: string;
};
type ReferenceKind = "url" | "note" | "file" | "wiki" | "text";
export type ReferenceStoredItem = string | {
  link: string;
  description?: string;
};
export type ReferenceRead = {
  link: string;
  kind: ReferenceKind;
  description?: string;
  path?: string;
  target?: string;
};
type NormalizedReferenceItem = {
  link: string;
  description?: string;
};
type ReferenceWritableField = "link" | "description";
type ReferenceWriteInput = {
  link: unknown;
  description?: unknown;
  position?: unknown;
};
type ReferenceMutationResult = {
  changed: boolean;
  index: number;
  link: string;
  added?: boolean;
};
type NormalizedCollectionReadOptions = {
  offset: number;
  limit: number | "all";
  query?: string;
  checkbox?: string;
  priority?: string;
  dueBefore?: string;
  dueAfter?: string;
  refKind?: string;
};

const DEFAULT_COLLECTION_READ_LIMIT = 50;
const REFERENCE_KINDS = new Set<string>(["url", "note", "file", "wiki", "text"]);
const ROOT_ID_FRONTMATTER_KEY = "id";

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
  return readSurface(ctx, resolveRequiredProject(ctx, options), PROJECT_READ_SPEC, options.key, options.collection);
}

export async function readArea(ctx: WorkflowContext, options: ReadAreaOptions): Promise<Record<string, unknown>> {
  return readSurface(ctx, resolveRequiredArea(ctx, options), AREA_READ_SPEC, options.key, options.collection);
}

export async function readResource(ctx: WorkflowContext, options: ReadResourceOptions): Promise<Record<string, unknown>> {
  return readSurface(ctx, resolveRequiredResource(ctx, options), RESOURCE_READ_SPEC, options.key, options.collection);
}

export async function readZk(ctx: WorkflowContext, options: ReadZkOptions): Promise<Record<string, unknown>> {
  const file = resolveRequiredZk(ctx, options);
  return readSurface(ctx, file, specForType(readType(fileFrontmatter(ctx, file))), options.key, options.collection);
}

export async function readJournal(ctx: WorkflowContext, options: ReadJournalOptions): Promise<Record<string, unknown>> {
  return readSurface(ctx, resolveRequiredJournal(ctx, options), JOURNAL_READ_SPEC, options.key, options.collection);
}

export async function readRetro(ctx: WorkflowContext, options: ReadRetroOptions): Promise<Record<string, unknown>> {
  return readSurface(ctx, resolveRequiredRetro(ctx, options), RETRO_READ_SPEC, options.key, options.collection);
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
    linkedFromSource = (await insertReferenceItem(ctx, source, { link: wikiLink(file.path) })).added === true;
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
  index: number;
  link: string;
  added: boolean;
  opened?: boolean;
}> {
  const source = resolveRequiredFile(ctx, options.sourcePath, "source note");
  const reference = await insertReferenceItem(ctx, source, {
    link: options.target,
    ...(options.description !== undefined ? { description: options.description } : {})
  });
  await openIfRequested(ctx, source, options.open);
  return {
    path: source.path,
    title: source.basename,
    index: reference.index,
    link: reference.link,
    added: reference.added === true,
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
  const parentFrontmatter = parseFrontmatterFromContent(await ctx.app.vault.read(parent.file));
  const parentTags = frontmatterLinks(parentFrontmatter.tags);
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
  const name = sanitizeFileName(options.title || defaultName) || "General";
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

  await insertReferenceItem(ctx, file, { link: wikiLink(source.path) });
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

  await insertReferenceItem(ctx, file, { link: wikiLink(source.path) });
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
  if (kind === "Fleeting") {
    const labels = localePack(ctx.settings.locale).labels;
    await insertRootTask(ctx, file, { name: labels.refineFleetingAction });
    await insertRootTask(ctx, file, { name: labels.connectReferencesAction });
  }
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
  return renderTemplate(templateName, ctx.settings);
}

function applyTemplateVariables(content: string, variables: TemplateVariables): string {
  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{\\s*${escapeRegExp(key)}\\s*}}`, "g"), value ?? "");
  }
  return result.replace(/{{\s*[A-Za-z0-9_]+\s*}}/g, "");
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

function readWikiLinkLabel(value: string): string | undefined {
  const match = parseWikiLink(value);
  if (!match) return undefined;
  const target = splitObsidianSubpath(match.target).base || match.target;
  return (match.alias?.trim() || pathBasenameWithoutExtension(target)).trim();
}

export function pathBasenameWithoutExtension(path: string): string {
  const last = path.split("/").filter(Boolean).pop() ?? path;
  return last.replace(/\.md$/i, "");
}

export function readReferenceItems(ctx: WorkflowContext, file: TFile): ReferenceRead[] {
  return referenceItemsFromFrontmatter(fileFrontmatter(ctx, file))
    .map((item) => deriveReferenceRead(ctx, file, item));
}

// metadataCache.getFileCache() lags behind processFrontMatter writes (the cache updates
// asynchronously), so any read immediately after a write returns stale frontmatter. The GUI
// renderer re-renders right after its own write, and rapid mutations chain reads-after-writes,
// so reference reads on the mutation/render path must parse the file's current content instead
// of trusting the cache.
async function readReferenceFrontmatterFresh(ctx: WorkflowContext, file: TFile): Promise<Frontmatter> {
  const content = await ctx.app.vault.read(file);
  const fresh = parseFrontmatterFromContent(content);
  if (hasFrontmatterKeys(fresh)) return fresh;

  const cached = fileFrontmatter(ctx, file);
  if (contentHasYamlFrontmatterBlock(content) && hasFrontmatterKeys(cached)) return cached;
  return fresh;
}

export async function readReferenceItemsFresh(ctx: WorkflowContext, file: TFile): Promise<ReferenceRead[]> {
  return referenceItemsFromFrontmatter(await readReferenceFrontmatterFresh(ctx, file))
    .map((item) => deriveReferenceRead(ctx, file, item));
}

function parseFrontmatterFromContent(content: string): Frontmatter {
  const match = stripLeadingUtf8Bom(content).match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return {};
  try {
    const parsed = parseYaml(match[1]);
    return parsed && typeof parsed === "object" ? parsed as Frontmatter : {};
  } catch {
    return {};
  }
}

function stripLeadingUtf8Bom(content: string): string {
  return content.startsWith("\uFEFF") ? content.slice(1) : content;
}

function hasFrontmatterKeys(frontmatter: Frontmatter): boolean {
  return Object.keys(frontmatter).length > 0;
}

function contentHasYamlFrontmatterBlock(content: string): boolean {
  const normalized = stripLeadingUtf8Bom(content);
  return yamlFrontmatterRange(normalized) !== undefined
    || /^[ \t\r\n]*---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.test(normalized);
}

function yamlFrontmatterRange(content: string): TextRange | undefined {
  const openStart = content.startsWith("\uFEFF") ? 1 : 0;
  if (!content.startsWith("---\n", openStart) && !content.startsWith("---\r\n", openStart)) {
    return undefined;
  }

  const delimiter = /\r?\n---(?:\r?\n|$)/g;
  delimiter.lastIndex = openStart + 3;
  const match = delimiter.exec(content);
  if (!match) return undefined;
  return {
    start: 0,
    end: match.index + match[0].length
  };
}

export async function insertReferenceItem(
  ctx: WorkflowContext,
  file: TFile,
  input: ReferenceWriteInput
): Promise<ReferenceMutationResult> {
  const canonical = canonicalizeReferenceTarget(ctx, file, input.link);
  const description = hasOwn(input, "description")
    ? normalizeReferenceOptionalField(input.description, "description")
    : undefined;
  const item = normalizeReferenceItem({
    link: canonical.link,
    description
  });
  const items = referenceItemsFromFrontmatter(await readReferenceFrontmatterFresh(ctx, file));
  const itemKey = referenceDedupeKey(ctx, file, item.link);
  const duplicateIndex = items.findIndex((candidate) => referenceDedupeKey(ctx, file, candidate.link) === itemKey);
  if (duplicateIndex !== -1) {
    return {
      changed: false,
      index: duplicateIndex,
      link: item.link,
      added: false
    };
  }

  const position = normalizeReferenceInsertPosition(input.position, items.length);
  const next = [...items];
  next.splice(position, 0, item);
  await writeReferenceItems(ctx, file, next);
  return {
    changed: true,
    index: position,
    link: item.link,
    added: true
  };
}

export async function updateReferenceItem(
  ctx: WorkflowContext,
  file: TFile,
  index: number,
  patch: {
    link?: unknown;
    description?: unknown;
  }
): Promise<ReferenceMutationResult> {
  const items = referenceItemsFromFrontmatter(await readReferenceFrontmatterFresh(ctx, file));
  assertReferenceIndex(items, index);

  const current = items[index];
  const hasLink = hasOwn(patch, "link");
  const hasDescription = hasOwn(patch, "description");

  let link = current.link;
  let description = current.description;

  if (hasLink) {
    const canonical = canonicalizeReferenceTarget(ctx, file, patch.link);
    link = canonical.link;
  }
  if (hasDescription) {
    description = normalizeReferenceOptionalField(patch.description, "description");
  }

  const linkKey = referenceDedupeKey(ctx, file, link);
  const duplicateIndex = items.findIndex((candidate, candidateIndex) => candidateIndex !== index && referenceDedupeKey(ctx, file, candidate.link) === linkKey);
  if (duplicateIndex !== -1) {
    throw new Error(`duplicate reference target: ${link}`);
  }

  const nextItem = normalizeReferenceItem({ link, description });
  if (referenceItemsEqual(current, nextItem)) {
    return {
      changed: false,
      index,
      link: nextItem.link
    };
  }

  const next = [...items];
  next[index] = nextItem;
  await writeReferenceItems(ctx, file, next);
  return {
    changed: true,
    index,
    link: nextItem.link
  };
}

export async function setReferenceItemField(
  ctx: WorkflowContext,
  file: TFile,
  index: number,
  field: string,
  value: unknown
): Promise<ReferenceMutationResult> {
  const writableField = readReferenceWritableField(field, `references/${index}/${field}`);
  return updateReferenceItem(ctx, file, index, { [writableField]: value });
}

export async function deleteReferenceItem(
  ctx: WorkflowContext,
  file: TFile,
  index: number
): Promise<ReferenceMutationResult> {
  const items = referenceItemsFromFrontmatter(await readReferenceFrontmatterFresh(ctx, file));
  assertReferenceIndex(items, index);
  const [removed] = items.splice(index, 1);
  await writeReferenceItems(ctx, file, items);
  return {
    changed: true,
    index,
    link: removed.link
  };
}

export async function reorderReferenceItems(
  ctx: WorkflowContext,
  file: TFile,
  links: string[]
): Promise<{ changed: boolean; items: ReferenceRead[] }> {
  const items = referenceItemsFromFrontmatter(await readReferenceFrontmatterFresh(ctx, file));
  if (links.length !== items.length) throw new Error("reference reorder requires the full current link order");

  const byLink = new Map<string, NormalizedReferenceItem>();
  for (const item of items) {
    if (byLink.has(item.link)) throw new Error(`duplicate reference link in current frontmatter: ${item.link}`);
    byLink.set(item.link, item);
  }

  const seen = new Set<string>();
  const next: NormalizedReferenceItem[] = [];
  for (const link of links) {
    if (seen.has(link)) throw new Error(`duplicate reference link in reorder: ${link}`);
    seen.add(link);
    const item = byLink.get(link);
    if (!item) throw new Error(`reference no longer present: ${link}`);
    next.push(item);
  }

  const changed = !items.every((item, itemIndex) => item.link === next[itemIndex]?.link);
  if (changed) await writeReferenceItems(ctx, file, next);
  return {
    changed,
    items: next.map((item) => deriveReferenceRead(ctx, file, item))
  };
}

function referenceItemsFromFrontmatter(frontmatter: Frontmatter): NormalizedReferenceItem[] {
  const value = frontmatter.references;
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error("references frontmatter must be an array");
  return value.map((item, index) => normalizeReferenceStoredItem(item, index));
}

function normalizeReferenceStoredItem(value: unknown, index: number): NormalizedReferenceItem {
  if (typeof value === "string") {
    return normalizeReferenceItem({ link: value }, index);
  }
  if (!isRecord(value)) {
    throw new Error(`references[${index}] must be a string or object`);
  }
  return normalizeReferenceItem({
    link: value.link,
    description: hasOwn(value, "description") ? value.description : undefined
  }, index);
}

function normalizeReferenceItem(value: {
  link: unknown;
  description?: unknown;
}, index?: number): NormalizedReferenceItem {
  const keyPrefix = index === undefined ? "reference" : `references[${index}]`;
  const link = normalizeReferenceLinkValue(value.link, `${keyPrefix}.link`);
  const description = normalizeReferenceOptionalField(value.description, "description");
  return {
    link,
    ...(description !== undefined ? { description } : {})
  };
}

async function writeReferenceItems(
  ctx: WorkflowContext,
  file: TFile,
  items: NormalizedReferenceItem[]
): Promise<void> {
  const stored = items.map(serializeReferenceStoredItem);
  await ctx.app.fileManager.processFrontMatter(file, (fm) => {
    if (stored.length === 0) {
      delete fm.references;
    } else {
      fm.references = stored;
    }
  });
}

function serializeReferenceStoredItem(item: NormalizedReferenceItem): ReferenceStoredItem {
  if (item.description === undefined) return item.link;
  return {
    link: item.link,
    description: item.description
  };
}

function referenceItemsEqual(left: NormalizedReferenceItem, right: NormalizedReferenceItem): boolean {
  return left.link === right.link && left.description === right.description;
}

function assertReferenceIndex(items: NormalizedReferenceItem[], index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= items.length) {
    throw new Error(`reference not found: ${index}`);
  }
}

function normalizeReferenceInsertPosition(value: unknown, length: number): number {
  if (value === undefined || value === null || value === "" || value === "end") return length;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > length) {
    throw new Error(`reference position must be an integer between 0 and ${length}`);
  }
  return value;
}

function normalizeReferenceLinkValue(value: unknown, key: string): string {
  if (typeof value !== "string") throw new Error(`${key} must be a string`);
  const link = value.trim();
  if (!link) throw new Error(`${key} is required`);
  return link;
}

function normalizeReferenceOptionalField(value: unknown, key: "description"): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`reference ${key} must be a string or null`);
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function deriveReferenceRead(ctx: WorkflowContext, file: TFile, item: NormalizedReferenceItem): ReferenceRead {
  const link = item.link;
  const wiki = parseWikiLink(link);
  const derived = wiki
    ? deriveWikiReferenceRead(ctx, file, link, wiki.target)
    : isExternalReference(link)
      ? { link, kind: "url" as const, target: link }
      : { link, kind: "text" as const };

  return {
    ...derived,
    ...(item.description !== undefined ? { description: item.description } : {})
  };
}

function deriveWikiReferenceRead(ctx: WorkflowContext, file: TFile, link: string, target: string): ReferenceRead {
  const resolved = resolveWikiReferenceFile(ctx, file, target);
  const normalized = normalizedReferenceTargetWithSubpath(target);
  if (resolved) {
    return {
      link,
      kind: resolved.file.path.endsWith(".md") ? "note" : "file",
      path: resolved.file.path
    };
  }
  return {
    link,
    kind: "wiki",
    target: normalized
  };
}

// Dedupe identity for a stored reference link. Resolution-based so two textual forms of
// the same vault target collide — e.g. a stored `[[full/path/Note.md]]` and the bare
// `[[Note]]` that Obsidian's rename auto-update normalizes it to both key to the same file.
// Distinct Obsidian subpaths stay distinct; URLs and unresolved/plain links fall back to
// their normalized text.
function referenceDedupeKey(ctx: WorkflowContext, source: TFile, link: string): string {
  const wiki = parseWikiLink(link);
  if (wiki) {
    const resolved = resolveWikiReferenceFile(ctx, source, wiki.target);
    if (resolved) return `file:${resolved.file.path}#${resolved.subpath}`;
    return `wiki:${normalizedReferenceTargetWithSubpath(wiki.target)}`;
  }
  if (isExternalReference(link)) return `url:${link.trim()}`;
  return `text:${link}`;
}

function canonicalizeReferenceTarget(
  ctx: WorkflowContext,
  source: TFile,
  target: unknown
): {
  link: string;
  targetPath?: string;
} {
  const value = normalizeReferenceLinkValue(target, "reference target");
  const parsed = parseReferenceTargetInput(value);

  if (parsed.syntax === "url" || (parsed.syntax === "markdown" && isExternalReference(parsed.target))) {
    return {
      link: parsed.target.trim()
    };
  }

  if (parsed.syntax === "wiki") {
    const resolved = resolveWikiReferenceFile(ctx, source, parsed.target);
    if (resolved) {
      return {
        link: canonicalWikiLink(referenceTargetWithSubpath(resolved.file.path, resolved.subpath)),
        targetPath: resolved.file.path
      };
    }
    return {
      link: canonicalWikiLink(normalizedReferenceTargetWithSubpath(parsed.target))
    };
  }

  if (parsed.syntax === "markdown") {
    const resolved = resolveRawReferenceFile(ctx, source, parsed.target);
    if (!resolved) {
      throw new Error(`markdown reference target must be a URL or existing vault file: ${parsed.target}`);
    }
    return {
      link: canonicalWikiLink(referenceTargetWithSubpath(resolved.file.path, resolved.subpath)),
      targetPath: resolved.file.path
    };
  }

  const resolved = resolveRawReferenceFile(ctx, source, parsed.target);
  if (resolved) {
    return {
      link: canonicalWikiLink(referenceTargetWithSubpath(resolved.file.path, resolved.subpath)),
      targetPath: resolved.file.path
    };
  }

  return {
    link: value
  };
}

type ParsedReferenceTarget = {
  syntax: "wiki" | "markdown" | "url" | "raw";
  target: string;
};

function parseReferenceTargetInput(value: string): ParsedReferenceTarget {
  const wiki = parseWikiLink(value);
  if (wiki) {
    return {
      syntax: "wiki",
      target: wiki.target
    };
  }

  const markdown = parseMarkdownLink(value);
  if (markdown) {
    return {
      syntax: "markdown",
      target: markdown.target
    };
  }

  if (isExternalReference(value)) {
    return {
      syntax: "url",
      target: value
    };
  }

  return {
    syntax: "raw",
    target: value
  };
}

export function parseWikiLink(value: string): { target: string; alias?: string } | undefined {
  const match = value.trim().match(/^\[\[([^\]|]+)(?:\|([^\]]*))?\]\]$/);
  const target = match?.[1]?.trim();
  if (!target) return undefined;
  return {
    target,
    ...(match?.[2] !== undefined ? { alias: match[2].trim() } : {})
  };
}

function parseMarkdownLink(value: string): { target: string } | undefined {
  const match = value.trim().match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  const text = match?.[1]?.trim();
  const target = match?.[2]?.trim();
  if (!text || !target) return undefined;
  return { target };
}

function resolveWikiReferenceFile(
  ctx: WorkflowContext,
  source: TFile,
  target: string
): { file: TFile; subpath: string } | undefined {
  const split = splitObsidianSubpath(target);
  const normalized = referenceTargetWithSubpath(split.base, split.subpath);
  const resolved = ctx.app.metadataCache.getFirstLinkpathDest(normalized, source.path)
    ?? (split.base ? ctx.app.metadataCache.getFirstLinkpathDest(split.base, source.path) : null);
  if (resolved) {
    return {
      file: resolved,
      subpath: split.subpath
    };
  }
  if (!split.base && split.subpath) {
    return {
      file: source,
      subpath: split.subpath
    };
  }
  return undefined;
}

function resolveRawReferenceFile(
  ctx: WorkflowContext,
  source: TFile,
  target: string
): { file: TFile; subpath: string } | undefined {
  const split = splitObsidianSubpath(target);
  if (!split.base && split.subpath) {
    return {
      file: source,
      subpath: split.subpath
    };
  }
  const file = ctx.app.vault.getAbstractFileByPath(split.base);
  if (!(file instanceof TFile)) return undefined;
  return {
    file,
    subpath: split.subpath
  };
}

export function splitObsidianSubpath(value: string): { base: string; subpath: string } {
  const normalizedSeparators = value.trim().replace(/\\/g, "/");
  const hash = normalizedSeparators.indexOf("#");
  if (hash === -1) {
    return {
      base: normalizeVaultPath(normalizedSeparators),
      subpath: ""
    };
  }
  return {
    base: normalizeVaultPath(normalizedSeparators.slice(0, hash)),
    subpath: normalizedSeparators.slice(hash).trim()
  };
}

function normalizedReferenceTargetWithSubpath(value: string): string {
  const split = splitObsidianSubpath(value);
  return referenceTargetWithSubpath(split.base, split.subpath);
}

function referenceTargetWithSubpath(base: string, subpath: string): string {
  return `${base}${subpath}`;
}

function canonicalWikiLink(target: string): string {
  return `[[${target}]]`;
}

export function isExternalReference(value: string): boolean {
  const trimmed = value.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || /^(mailto|tel):/i.test(trimmed);
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
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
    { key: "tasks", labelKey: "tasks", transform: readTasks, collection: "task" },
    { key: "references", labelKey: "references", transform: readReferences, collection: "reference" }
  ],
  children: true
};

const AREA_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: ["parent"],
  sections: [
    { key: "overview", labelKey: "overview" },
    { key: "tasks", labelKey: "tasks", transform: readTasks, collection: "task" },
    { key: "references", labelKey: "references", transform: readReferences, collection: "reference" }
  ],
  children: true
};

const RESOURCE_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: [],
  sections: [
    { key: "overview", labelKey: "overview" },
    { key: "body", labelKey: "body" },
    { key: "references", labelKey: "references", transform: readReferences, collection: "reference" }
  ]
};

const JOURNAL_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: ["date", "energy"],
  sections: [
    { key: "focus", labelKey: "focus" },
    { key: "quick_memo", labelKey: "quickMemo" },
    { key: "timeline", labelKey: "timeline" },
    { key: "tasks", labelKey: "tasks", transform: readTasks, collection: "task" },
    { key: "short_review", labelKey: "shortReview" },
    { key: "references", labelKey: "references", transform: readReferences, collection: "reference" }
  ]
};

const RETRO_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: ["project", "areas", "date", "week_iso", "week_start", "week_end"],
  sections: [
    { key: "week_progress", labelKey: "weekProgress" },
    { key: "good", labelKey: "good" },
    { key: "improve", labelKey: "improve" },
    { key: "risks", labelKey: "risks" },
    { key: "tasks", labelKey: "tasks", transform: readTasks, collection: "task" },
    { key: "retro_summary", labelKey: "retroSummary" },
    { key: "references", labelKey: "references", transform: readReferences, collection: "reference" }
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
    { key: "tasks", labelKey: "tasks", transform: readTasks, collection: "task" },
    { key: "references", labelKey: "references", transform: readReferences, collection: "reference" }
  ]
};

const ZK_LITERATURE_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: ["sourceTitle", "authors", "published", "url"],
  sections: [
    { key: "highlight_block", labelKey: "highlightBlock" },
    { key: "summary", labelKey: "summary" },
    { key: "insight", labelKey: "insight" },
    { key: "evidence", labelKey: "evidence" },
    { key: "references", labelKey: "references", transform: readReferences, collection: "reference" }
  ]
};

const ZK_PERMANENT_READ_SPEC: ReadSurfaceSpec = {
  frontmatter: ["maturity", "aliases"],
  sections: [
    { key: "one_sentence_summary", labelKey: "oneSentenceSummary" },
    { key: "body", labelKey: "body" },
    { key: "limitations", labelKey: "limitations" },
    { key: "related_questions", labelKey: "relatedQuestions" },
    { key: "references", labelKey: "references", transform: readReferences, collection: "reference" }
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
  rawKey: string | undefined,
  collectionOptions?: CollectionReadOptions
): Promise<Record<string, unknown>> {
  const frontmatter = fileFrontmatter(ctx, file);
  const type = readType(frontmatter);
  const surface = await readSurfaceMap(ctx, file, spec);
  const key = rawKey?.trim();

  if (!key) {
    if (hasCollectionReadOptions(collectionOptions)) {
      throw new Error("collection read options require key=<collection>");
    }
    return compactReadEnvelope(ctx, file, type, surface, spec);
  }

  return {
    path: file.path,
    title: file.basename,
    type,
    mode: "exact",
    ...archivedReadFlag(ctx, file),
    key,
    value: await readSurfaceKey(ctx, file, surface, spec, key, collectionOptions)
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
    if (section.collection === "reference" && section.transform) {
      surface[section.key] = await section.transform("", {
        ctx,
        file,
        content,
        section
      });
      continue;
    }
    const value = readSection(content, sectionHeadingCandidates(section), {
      includeSubsections: section.includeSubsections ?? false
    });
    surface[section.key] = section.transform
      ? await section.transform(value, {
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
  surface: ReadMap,
  spec: ReadSurfaceSpec
): Record<string, unknown> {
  return {
    mode: "compact",
    omits_empty: true,
    path: file.path,
    title: file.basename,
    type,
    ...archivedReadFlag(ctx, file),
    ...compactReadMap(surface, spec)
  };
}

function archivedReadFlag(ctx: WorkflowContext, file: TFile): { archived?: true } {
  return isArchivedFile(ctx, file) ? { archived: true } : {};
}

function compactReadMap(value: ReadMap, spec: ReadSurfaceSpec): ReadMap {
  const result: ReadMap = {};
  const collectionKeys = collectionKeysForSpec(spec);
  for (const [key, item] of Object.entries(value)) {
    const compact = key === "frontmatter"
      ? compactFrontmatter(item)
      : collectionKeys.has(key)
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
  spec: ReadSurfaceSpec,
  key: string,
  collectionOptions?: CollectionReadOptions
): Promise<unknown> {
  const parts = keyParts(key);
  if (parts.length === 0) throw new Error("key is required");

  if (parts[0] !== "children") {
    return readSurfaceMapKey(surface, spec, parts, key, collectionOptions);
  }

  if (!Object.prototype.hasOwnProperty.call(surface, "children")) {
    throw unknownReadKeyError(spec, key);
  }
  if (parts.length === 1) return surface.children;

  const childTitle = parts[1];
  const child = findChild(ctx, source, childTitle);
  if (!child) throw new Error(`child not found: ${childTitle}`);

  const childType = readType(fileFrontmatter(ctx, child));
  const childSpec = specForType(childType);
  const childSurface = await readSurfaceMap(ctx, child, childSpec);
  if (parts.length === 2) {
    return compactReadEnvelope(ctx, child, childType, childSurface, childSpec);
  }
  return readSurfaceMapKey(childSurface, childSpec, parts.slice(2), key, collectionOptions);
}

function readSurfaceMapKey(
  surface: ReadMap,
  spec: ReadSurfaceSpec,
  parts: string[],
  originalKey: string,
  collectionOptions?: CollectionReadOptions
): unknown {
  if (parts.length === 0) throw new Error("key is required");

  const collectionKind = collectionKindForKey(spec, parts[0]);
  if (collectionKind && parts.length === 1) {
    return readCollectionPage(surface[parts[0]], collectionKind, collectionOptions);
  }

  if (hasCollectionReadOptions(collectionOptions)) {
    throw new Error("collection read options require key to select a collection root");
  }

  if (!readSurfaceTopLevelKeys(spec).includes(parts[0])) {
    throw unknownReadKeyError(spec, originalKey);
  }
  if (parts[0] === "frontmatter" && parts.length >= 2 && !spec.frontmatter.includes(parts[1])) {
    throw unknownReadKeyError(spec, originalKey);
  }

  return readMapPath(surface, parts, originalKey);
}

function hasCollectionReadOptions(options?: CollectionReadOptions): boolean {
  return !!options && Object.values(options).some((value) => value !== undefined);
}

function collectionKeysForSpec(spec: ReadSurfaceSpec): Set<string> {
  return new Set((spec.sections ?? [])
    .filter((section) => section.collection)
    .map((section) => section.key));
}

function collectionKindForKey(spec: ReadSurfaceSpec, key: string): ReadCollectionKind | undefined {
  return (spec.sections ?? []).find((section) => section.key === key)?.collection;
}

function readCollectionPage(
  value: unknown,
  kind: ReadCollectionKind,
  rawOptions?: CollectionReadOptions
): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("collection read target is not a map");

  const options = normalizeCollectionReadOptions(rawOptions);
  const entries = Object.entries(value).filter(([, item]) => matchesCollectionItem(kind, item, options));
  const pageEntries = options.limit === "all"
    ? entries.slice(options.offset)
    : entries.slice(options.offset, options.offset + options.limit);
  return {
    count: entries.length,
    offset: options.offset,
    limit: options.limit,
    returned: pageEntries.length,
    has_more: options.offset + pageEntries.length < entries.length,
    items: Object.fromEntries(pageEntries)
  };
}

function normalizeCollectionReadOptions(rawOptions?: CollectionReadOptions): NormalizedCollectionReadOptions {
  const offset = rawOptions?.offset ?? 0;
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error("offset must be a non-negative integer");
  }

  const limit = rawOptions?.limit ?? DEFAULT_COLLECTION_READ_LIMIT;
  if (limit !== "all" && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error("limit must be a positive integer or all");
  }

  const refKind = trimOptional(rawOptions?.refKind);
  if (refKind && !REFERENCE_KINDS.has(refKind)) {
    throw new Error(`ref_kind must be one of ${Array.from(REFERENCE_KINDS).join(", ")}`);
  }

  return {
    offset,
    limit,
    query: trimOptional(rawOptions?.query),
    checkbox: normalizeCheckboxFilter(rawOptions?.checkbox),
    priority: trimOptional(rawOptions?.priority),
    dueBefore: normalizeIsoDateFilter(rawOptions?.dueBefore, "due_before"),
    dueAfter: normalizeIsoDateFilter(rawOptions?.dueAfter, "due_after"),
    refKind
  };
}

function matchesCollectionItem(
  kind: ReadCollectionKind,
  item: unknown,
  options: NormalizedCollectionReadOptions
): boolean {
  if (!isRecord(item)) return false;

  if (options.query && !collectionSearchText(kind, item).toLowerCase().includes(options.query.toLowerCase())) {
    return false;
  }

  if (kind === "task") return matchesTaskCollectionItem(item, options);
  return matchesReferenceCollectionItem(item, options);
}

function matchesTaskCollectionItem(
  item: Record<string, unknown>,
  options: NormalizedCollectionReadOptions
): boolean {
  if (options.checkbox !== undefined && readRecordString(item, "checkbox") !== options.checkbox) return false;
  if (options.priority && readRecordString(item, "priority") !== options.priority) return false;
  if (options.dueBefore && !dateOnOrBefore(readRecordString(item, "due"), options.dueBefore)) return false;
  if (options.dueAfter && !dateOnOrAfter(readRecordString(item, "due"), options.dueAfter)) return false;
  return true;
}

function matchesReferenceCollectionItem(
  item: Record<string, unknown>,
  options: NormalizedCollectionReadOptions
): boolean {
  if (options.refKind && readRecordString(item, "kind") !== options.refKind) return false;
  return true;
}

function collectionSearchText(kind: ReadCollectionKind, item: Record<string, unknown>): string {
  const keys = kind === "task"
    ? ["name", "checkbox", "priority", "due", "scheduled", "start", "created", "done", "cancelled"]
    : ["link", "kind", "description", "target", "path"];
  return keys.map((key) => readRecordString(item, key) ?? "").join("\n");
}

function normalizeCheckboxFilter(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "space" || trimmed === "blank" || trimmed === "todo" || trimmed === "open") return " ";
  return trimmed;
}

function normalizeIsoDateFilter(value: string | undefined, key: string): string | undefined {
  const trimmed = trimOptional(value);
  if (!trimmed) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) throw new Error(`${key} must be YYYY-MM-DD`);
  return trimmed;
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readRecordString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function dateOnOrBefore(value: string | undefined, limit: string): boolean {
  const date = readIsoDate(value);
  return !!date && date <= limit;
}

function dateOnOrAfter(value: string | undefined, limit: string): boolean {
  const date = readIsoDate(value);
  return !!date && date >= limit;
}

function readIsoDate(value: string | undefined): string | undefined {
  return value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
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
  }
  | {
    kind: "taskCollection";
    file: TFile;
  }
  | {
    kind: "taskItem";
    file: TFile;
    shardFile: TFile;
    line: EditableTaskLine;
    field?: TaskWritableField;
  }
  | {
    kind: "referenceCollection";
    file: TFile;
  }
  | {
    kind: "referenceItem";
    file: TFile;
    index: number;
    field?: ReferenceWritableField;
  };

type TextRange = {
  start: number;
  end: number;
};

type TextUpdateResult = {
  changed: boolean;
  matches?: number;
  index?: number;
  link?: string;
  added?: boolean;
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
    : target.kind === "text"
      ? await updateTextSurface(ctx, target, operation, options)
      : target.kind === "taskCollection"
        ? await updateTaskCollectionSurface(ctx, target, operation, options)
        : target.kind === "referenceItem"
          ? await updateReferenceItemSurface(ctx, target, operation, options)
          : target.kind === "referenceCollection"
            ? await updateReferenceCollectionSurface(ctx, target, operation, options)
            : await updateTaskItemSurface(ctx, target, operation, options);
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
    index: result.index,
    link: result.link,
    added: result.added,
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
    if (!spec.children) throw unknownUpdateKeyError(spec, originalKey);
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
    if (!spec.frontmatter.includes(frontmatterKey)) throw unknownUpdateKeyError(spec, originalKey);
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
  if (!section) throw unknownUpdateKeyError(spec, originalKey);

  if (section.collection) {
    return resolveWritableCollectionTarget(ctx, file, section, parts, originalKey);
  }

  if (parts.length !== 1) throw new Error(`unknown update key: ${originalKey}`);

  const content = await ctx.app.vault.read(file);
  return {
    kind: "text",
    file,
    range: writableSectionRange(content, section, originalKey)
  };
}

async function resolveWritableCollectionTarget(
  ctx: WorkflowContext,
  file: TFile,
  section: ReadSectionSpec,
  parts: string[],
  originalKey: string
): Promise<WritableSurfaceTarget> {
  if (section.collection === "reference") {
    return resolveWritableReferenceCollectionTarget(file, parts, originalKey);
  }
  if (section.collection !== "task") throw new Error(`unknown update key: ${originalKey}`);

  if (parts.length === 1) {
    return {
      kind: "taskCollection",
      file
    };
  }
  if (parts.length === 2 || parts.length === 3) {
    const shardFile = await readTaskShardFile(ctx, file);
    if (!shardFile) throw new Error(`task not found: ${parts[1]}`);
    const content = await ctx.app.vault.read(shardFile);
    const range = taskShardTaskRange(content);
    const line = range ? findEditableTaskLine(shardFile.path, content, range, parts[1]) : undefined;
    if (!line) throw new Error(`task not found: ${parts[1]}`);
    const field = parts.length === 3 ? readTaskWritableField(parts[2], originalKey) : undefined;
    return {
      kind: "taskItem",
      file,
      shardFile,
      line,
      field
    };
  }

  throw new Error(`unknown update key: ${originalKey}`);
}

async function resolveWritableReferenceCollectionTarget(
  file: TFile,
  parts: string[],
  originalKey: string
): Promise<WritableSurfaceTarget> {
  if (parts.length === 1) {
    return {
      kind: "referenceCollection",
      file
    };
  }
  if (parts.length === 2 || parts.length === 3) {
    const index = parseReferenceIndex(parts[1], originalKey);
    const field = parts.length === 3 ? readReferenceWritableField(parts[2], originalKey) : undefined;
    return {
      kind: "referenceItem",
      file,
      index,
      field
    };
  }

  throw new Error(`unknown update key: ${originalKey}`);
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
  if (operation === "delete") throw new Error("op=delete only supports structured item keys");
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

async function updateTaskCollectionSurface(
  ctx: WorkflowContext,
  target: Extract<WritableSurfaceTarget, { kind: "taskCollection" }>,
  operation: UpdateOperation,
  options: UpdatePayloadOptions
): Promise<TextUpdateResult> {
  if (operation !== "insert") throw new Error("task collection root only supports op=insert");

  if (options.valueSource === "value") throw new Error("task insert requires value_json object");
  const write = normalizeTaskWriteValue(requireUpdateValue(options));
  const taskId = await newTaskId(ctx);
  const line = serializeNewTaskLine(write.task, taskId);
  const shardFile = await ensureTaskShard(ctx, target.file);
  const base = await ctx.app.vault.read(shardFile);
  const normalized = ensureTaskShardTaskSection(base);
  const current = normalized.content.slice(normalized.range.start, normalized.range.end);
  const next = insertTaskLine(current, line, write.position);
  if (current === next && base === normalized.content) return { changed: false };

  const after = spliceTextRange(normalized.content, normalized.range, next);
  if (base !== after) await ctx.app.vault.modify(shardFile, after);
  return { changed: base !== after };
}

async function updateTaskItemSurface(
  ctx: WorkflowContext,
  target: Extract<WritableSurfaceTarget, { kind: "taskItem" }>,
  operation: UpdateOperation,
  options: UpdatePayloadOptions
): Promise<TextUpdateResult> {
  if (!target.field) {
    if (operation !== "delete") throw new Error("task item keys only support op=delete; use tasks/<id>/<field> for op=set");
    const before = await ctx.app.vault.read(target.shardFile);
    const after = removeTextRanges(before, [target.line.range]);
    if (before !== after) await ctx.app.vault.modify(target.shardFile, after);
    return { changed: before !== after };
  }

  if (operation !== "set") throw new Error("task fields only support op=set");
  if (options.valueSource === "value_json") throw new Error("task field updates require value");
  const value = normalizeTaskFieldUpdateValue(target.field, requireUpdateValue(options));
  const nextTask = applyTaskFieldUpdate(target.line.task, target.field, value);
  const nextLine = serializeEditableTaskLine(target.line, nextTask);
  const before = await ctx.app.vault.read(target.shardFile);
  const currentLine = before.slice(target.line.range.start, target.line.range.endWithoutBreak);
  if (currentLine === nextLine) return { changed: false };

  const after = spliceTextRange(before, target.line.range, nextLine);
  if (before !== after) await ctx.app.vault.modify(target.shardFile, after);
  return { changed: before !== after };
}

async function updateReferenceCollectionSurface(
  ctx: WorkflowContext,
  target: Extract<WritableSurfaceTarget, { kind: "referenceCollection" }>,
  operation: UpdateOperation,
  options: UpdatePayloadOptions
): Promise<TextUpdateResult> {
  if (operation !== "insert") throw new Error("references collection root only supports op=insert");
  if (options.valueSource !== "value_json") throw new Error("reference insert requires value_json object");
  const write = normalizeReferenceInsertValue(requireUpdateValue(options));
  const result = await insertReferenceItem(ctx, target.file, write);
  return {
    changed: result.changed,
    index: result.index,
    link: result.link,
    added: result.added
  };
}

async function updateReferenceItemSurface(
  ctx: WorkflowContext,
  target: Extract<WritableSurfaceTarget, { kind: "referenceItem" }>,
  operation: UpdateOperation,
  options: UpdatePayloadOptions
): Promise<TextUpdateResult> {
  if (!target.field) {
    if (operation !== "delete") throw new Error("reference item keys only support op=delete; use references/<i>/<field> for op=set");
    const result = await deleteReferenceItem(ctx, target.file, target.index);
    return {
      changed: result.changed,
      index: result.index,
      link: result.link
    };
  }

  if (operation !== "set") throw new Error("reference fields only support op=set");
  const value = readReferenceFieldUpdateValue(target.field, options);
  const result = await setReferenceItemField(ctx, target.file, target.index, target.field, value);
  return {
    changed: result.changed,
    index: result.index,
    link: result.link
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
    case "insert":
      throw new Error("op=insert only supports task collection keys");
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
    case "delete":
      throw new Error("op=delete only supports structured item keys");
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
  const frontmatter = yamlFrontmatterRange(content);
  if (!frontmatter) return { start: 0, end: content.length };
  return {
    start: frontmatter.end,
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
  if (normalized === "set" || normalized === "insert" || normalized === "append" || normalized === "prepend" || normalized === "replace" || normalized === "delete") {
    return normalized;
  }
  throw new Error("op must be one of: set|insert|append|prepend|replace|delete");
}

function requireUpdateValue(options: UpdatePayloadOptions): unknown {
  if (!Object.prototype.hasOwnProperty.call(options, "value")) throw new Error("value is required");
  return options.value;
}

function requireUpdateText(options: UpdatePayloadOptions, config: { allowEmpty: boolean }): string {
  if (options.valueSource === "value_json") throw new Error("section/body text updates require value");
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
  assertCanMoveTaskShardBetweenArchiveStates(ctx, file, normalizedFromRoot, normalizedToRoot);
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
  const rootId = rootIdFromFrontmatter(fileFrontmatter(ctx, file));
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
    await moveTaskShardBetweenArchiveStates(ctx, rootId, normalizedFromRoot, normalizedToRoot);
    return { file: moved, fromPath, toPath };
  }

  const relativeFile = relativePathUnderRoot(file.path, normalizedFromRoot);
  const toPath = joinVaultPath(normalizedToRoot, relativeFile);
  await ensureFolder(ctx.app, parentFolder(toPath));
  await ctx.app.fileManager.renameFile(file, toPath);
  const moved = ctx.app.vault.getFileByPath(toPath);
  if (!moved) throw new Error(`failed to move ${fromPath} to ${toPath}`);
  await moveTaskShardBetweenArchiveStates(ctx, rootId, normalizedFromRoot, normalizedToRoot);
  return { file: moved, fromPath, toPath };
}

function assertCanMoveTaskShardBetweenArchiveStates(
  ctx: WorkflowContext,
  file: TFile,
  fromRoot: string,
  toRoot: string
): void {
  const rootId = rootIdFromFrontmatter(fileFrontmatter(ctx, file));
  if (!rootId) return;

  const fromArchived = isArchivedPath(ctx, fromRoot);
  const toArchived = isArchivedPath(ctx, toRoot);
  if (fromArchived === toArchived) return;

  const source = ctx.app.vault.getFileByPath(taskShardPath(ctx, rootId, fromArchived));
  if (!source) return;

  const targetPath = taskShardPath(ctx, rootId, toArchived);
  const existing = ctx.app.vault.getAbstractFileByPath(targetPath);
  if (existing && existing !== source) throw new Error(`target already exists: ${targetPath}`);
}

async function moveTaskShardBetweenArchiveStates(
  ctx: WorkflowContext,
  rootId: string | undefined,
  fromRoot: string,
  toRoot: string
): Promise<void> {
  if (!rootId) return;

  const fromArchived = isArchivedPath(ctx, fromRoot);
  const toArchived = isArchivedPath(ctx, toRoot);
  if (fromArchived === toArchived) return;

  const source = ctx.app.vault.getFileByPath(taskShardPath(ctx, rootId, fromArchived));
  if (!source) return;

  const targetPath = taskShardPath(ctx, rootId, toArchived);
  await ensureFolder(ctx.app, parentFolder(targetPath));
  await ctx.app.fileManager.renameFile(source, targetPath);
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

function readSurfaceTopLevelKeys(spec: ReadSurfaceSpec): string[] {
  const keys = ["frontmatter"];
  for (const section of spec.sections ?? []) keys.push(section.key);
  if (spec.body) keys.push("body");
  if (spec.children) keys.push("children");
  return keys;
}

function readKeyHints(spec: ReadSurfaceSpec): string[] {
  const keys: string[] = [];
  if (spec.frontmatter.length > 0) keys.push(`frontmatter/{${spec.frontmatter.join("|")}}`);
  for (const section of spec.sections ?? []) {
    if (section.collection === "reference") {
      keys.push("references", "references/<i>", "references/<i>/{link|description}");
    } else {
      keys.push(section.key);
    }
  }
  if (spec.body) keys.push("body");
  if (spec.children) keys.push("children/<title>/<key>");
  return keys;
}

function writeKeyHints(spec: ReadSurfaceSpec): string[] {
  const keys: string[] = [];
  if (spec.frontmatter.length > 0) keys.push(`frontmatter/{${spec.frontmatter.join("|")}}=set`);
  for (const section of spec.sections ?? []) {
    if (section.collection === "task") {
      keys.push("tasks=insert", "tasks/<id>=delete", "tasks/<id>/<field>=set");
    } else if (section.collection === "reference") {
      keys.push("references=insert", "references/<i>=delete", "references/<i>/{link|description}=set");
    } else {
      keys.push(`${section.key}=set|append|prepend|replace`);
    }
  }
  if (spec.body) keys.push("body=set|append|prepend|replace");
  if (spec.children) keys.push("children/<title>/<key>");
  return keys;
}

function unknownReadKeyError(spec: ReadSurfaceSpec, key: string): Error {
  return new Error(`unknown read key: ${key} (valid: ${readKeyHints(spec).join(", ")})`);
}

function unknownUpdateKeyError(spec: ReadSurfaceSpec, key: string): Error {
  return new Error(`unknown update key: ${key} (writable: ${writeKeyHints(spec).join(", ")})`);
}

export function surfaceReadKeys(type: string): string[] {
  return readKeyHints(specForType(type));
}

export function surfaceWriteKeys(type: string): string[] {
  return writeKeyHints(specForType(type));
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
  return Object.fromEntries(
    readReferenceItems(context.ctx, context.file).map((item, index) => [String(index), item])
  );
}

function readReferenceWritableField(value: string, originalKey: string): ReferenceWritableField {
  if (value === "link" || value === "description") return value;
  if (value === "kind" || value === "path" || value === "target") {
    throw new Error(`reference field is read-only for update key: ${originalKey}`);
  }
  throw new Error(`unknown reference field for update key: ${originalKey}`);
}

function parseReferenceIndex(value: string, originalKey: string): number {
  if (!/^\d+$/.test(value)) throw new Error(`reference index must be a non-negative integer for update key: ${originalKey}`);
  return Number(value);
}

function normalizeReferenceInsertValue(value: unknown): ReferenceWriteInput {
  if (!isRecord(value)) throw new Error("reference insert requires value_json object");
  for (const key of Object.keys(value)) {
    if (key !== "link" && key !== "description" && key !== "position") {
      throw new Error(`unknown reference field: ${key}`);
    }
  }
  return {
    link: value.link,
    ...(hasOwn(value, "description") ? { description: value.description } : {}),
    ...(hasOwn(value, "position") ? { position: value.position } : {})
  };
}

function readReferenceFieldUpdateValue(field: ReferenceWritableField, options: UpdatePayloadOptions): unknown {
  const value = requireUpdateValue(options);
  if (options.valueSource === "value_json") {
    if (value === null && field === "description") return null;
    if (typeof value === "string") return value;
    throw new Error(`reference ${field} update requires ${field === "link" ? "a string" : "a string or null"}`);
  }
  if (typeof value !== "string") throw new Error(`reference ${field} update requires value`);
  if (field === "link" && !value.trim()) throw new Error("reference link is required");
  return value;
}

const TASK_DATE_FIELDS: Array<{ key: TaskDateMetadataField; re: RegExp }> = [
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

const TASK_ID_SYMBOL = "\u{1F194}";
const TASK_ID_REGEX = /\u{1F194}\s*([a-zA-Z0-9-_]+)/u;
const TASK_ID_GLOBAL_REGEX = /\u{1F194}\s*([a-zA-Z0-9-_]+)/gu;
const TASK_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const TASK_ID_LENGTH = 8;
const TASK_DATE_FIELD_SYMBOLS: Record<TaskDateMetadataField, string> = {
  due: "\u{1F4C5}",
  scheduled: "\u{23F3}",
  start: "\u{1F6EB}",
  created: "\u{2795}",
  done: "\u{2705}",
  cancelled: "\u{274C}"
};
const TASK_PRIORITY_FIELD_SYMBOLS: Record<string, string> = {
  highest: "\u{1F53A}",
  high: "\u{23EB}",
  medium: "\u{1F53C}",
  low: "\u{1F53D}",
  lowest: "\u{23EC}"
};

async function ensureTaskShard(ctx: WorkflowContext, rootFile: TFile): Promise<TFile> {
  const rootId = await ensureRootId(ctx, rootFile);
  const path = taskShardPath(ctx, rootId, isArchivedFile(ctx, rootFile));
  await ensureFolder(ctx.app, parentFolder(path));

  let shardFile = ctx.app.vault.getFileByPath(path);
  if (!shardFile) {
    shardFile = await ctx.app.vault.create(path, "# Tasks\n");
  }
  return shardFile;
}

async function ensureRootId(ctx: WorkflowContext, file: TFile): Promise<string> {
  const existing = rootIdFromFrontmatter(fileFrontmatter(ctx, file));
  if (existing) return existing;

  const id = newRootId();
  let resolved = id;
  await ctx.app.fileManager.processFrontMatter(file, (fm) => {
    const current = rootIdFromFrontmatter(fm);
    if (current) {
      resolved = current;
    } else {
      fm[ROOT_ID_FRONTMATTER_KEY] = id;
      resolved = id;
    }
  });
  return resolved;
}

function taskShardFile(ctx: WorkflowContext, rootFile: TFile): TFile | undefined {
  const rootId = rootIdFromFrontmatter(fileFrontmatter(ctx, rootFile));
  return rootId ? ctx.app.vault.getFileByPath(taskShardPath(ctx, rootId, isArchivedFile(ctx, rootFile))) ?? undefined : undefined;
}

function readTaskShardFile(ctx: WorkflowContext, rootFile: TFile): TFile | undefined {
  return taskShardFile(ctx, rootFile);
}

function taskShardPath(ctx: WorkflowContext, rootId: string, archived: boolean): string {
  return joinVaultPath(taskShardFolder(ctx, archived), `${sanitizeFileName(rootId)}.md`);
}

function taskShardFolder(ctx: WorkflowContext, archived: boolean): string {
  return archived ? taskArchivesFolder(ctx) : taskCurrentFolder(ctx);
}

function taskCurrentFolder(ctx: WorkflowContext): string {
  return joinVaultPath(ctx.settings.paths.tasksFolder, "current");
}

function taskArchivesFolder(ctx: WorkflowContext): string {
  return joinVaultPath(ctx.settings.paths.tasksFolder, "archives");
}

function taskRegistryFolder(ctx: WorkflowContext): string {
  return normalizeVaultPath(ctx.settings.paths.tasksFolder);
}

function rootIdFromFrontmatter(frontmatter: Frontmatter): string | undefined {
  const value = frontmatter[ROOT_ID_FRONTMATTER_KEY];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function taskShardTaskRange(content: string): TextRange | undefined {
  const range = findSectionContentRange(content, {
    key: "tasks",
    labels: ["Tasks"]
  });
  return range ? trimTextRange(content, range.start, range.end) : undefined;
}

function ensureTaskShardTaskSection(content: string): { content: string; range: TextRange } {
  const existing = taskShardTaskRange(content);
  if (existing) return { content, range: existing };

  const next = `${content.replace(/\s*$/, "")}\n\n# Tasks\n`;
  return {
    content: next,
    range: {
      start: next.length,
      end: next.length
    }
  };
}

function insertTaskLine(content: string, line: string, position: number | "end"): string {
  const current = isMarkdownScaffold(content) ? "" : content;
  if (!current.trim()) return line;
  if (position === "end") return `${current}${current.endsWith("\n") ? "" : "\n"}${line}`;

  const taskLines = editableTaskLineSpans(current);
  if (position > taskLines.length) return `${current}${current.endsWith("\n") ? "" : "\n"}${line}`;
  const target = taskLines[position - 1];
  return spliceTextRange(current, { start: target.start, end: target.start }, `${line}\n`);
}

function editableTaskLineSpans(content: string): Array<TextRange & { endWithoutBreak: number }> {
  const spans: Array<TextRange & { endWithoutBreak: number }> = [];
  let cursor = 0;
  while (cursor < content.length) {
    const span = lineTextRangeAt(content, cursor, content.length);
    if (!span) break;
    const text = content.slice(span.start, span.endWithoutBreak);
    if (/^\s*(?:[-*+]|\d+[.)])\s+\[[^\]\r\n]?\]\s*/.test(text)) spans.push(span);
    cursor = span.end;
  }
  return spans;
}

function newRootId(): string {
  return newId();
}

async function newTaskId(ctx: WorkflowContext): Promise<string> {
  const existing = await existingTaskIds(ctx);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = randomAlphabetId(TASK_ID_LENGTH, TASK_ID_ALPHABET);
    if (!existing.has(id)) return id;
  }
  throw new Error("failed to generate a unique task id");
}

function newId(): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return fallbackUuid();
}

function fallbackUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

async function existingTaskIds(ctx: WorkflowContext): Promise<Set<string>> {
  const ids = new Set<string>();
  const tasksFolder = taskRegistryFolder(ctx);
  for (const file of ctx.app.vault.getMarkdownFiles()) {
    if (tasksFolder && !isInFolder(file, tasksFolder)) continue;
    const content = await ctx.app.vault.cachedRead(file);
    collectTaskIds(content, ids);
  }
  return ids;
}

function collectTaskIds(content: string, ids: Set<string>): void {
  for (const match of content.matchAll(TASK_ID_GLOBAL_REGEX)) {
    const id = match[1]?.trim();
    if (id) ids.add(id);
  }
}

function randomAlphabetId(length: number, alphabet: string): string {
  const chars: string[] = [];
  const limit = 256 - (256 % alphabet.length);
  while (chars.length < length) {
    for (const byte of randomBytes(length - chars.length)) {
      if (byte >= limit) continue;
      chars.push(alphabet[byte % alphabet.length] ?? alphabet[0]);
      if (chars.length === length) break;
    }
  }
  return chars.join("");
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function frontmatterText(lines: string[]): string {
  return [
    "---",
    ...lines,
    "---"
  ].join("\n");
}

async function readTasks(_content: string, context: SectionTransformContext): Promise<Record<string, TaskRead>> {
  return readRootTaskMap(context.ctx, context.file);
}

export async function readRootTaskMap(ctx: WorkflowContext, rootFile: TFile): Promise<Record<string, TaskRead>> {
  const items: Record<string, TaskRead> = {};
  const shardFile = await readTaskShardFile(ctx, rootFile);
  if (!shardFile) return items;

  const content = await ctx.app.vault.read(shardFile);
  const range = taskShardTaskRange(content);
  if (!range) return items;

  let cursor = range.start;
  let line = lineNumberAt(content, range.start);
  while (cursor < range.end) {
    const span = readLineSpan(content, cursor, range.end);
    if (!span) break;

    const task = readTaskLine(shardFile.path, line, span.text);
    if (task) {
      const id = uniqueReadId(task.id, items);
      items[id] = task.task;
    }

    cursor = span.next;
    line += 1;
  }

  return items;
}

export async function readAllTaskItems(ctx: WorkflowContext): Promise<Array<{
  rootPath: string;
  rootTitle: string;
  rootType: string;
  id: string;
  task: TaskRead;
}>> {
  const rootFiles = rootFilesById(ctx);
  const results: Array<{
    rootPath: string;
    rootTitle: string;
    rootType: string;
    id: string;
    task: TaskRead;
  }> = [];
  for (const file of ctx.app.vault.getMarkdownFiles()) {
    if (!isInFolder(file, taskCurrentFolder(ctx))) continue;
    const rootFile = rootFiles.get(file.basename);
    if (!rootFile) continue;
    const content = await ctx.app.vault.read(file);
    const range = taskShardTaskRange(content);
    if (!range) continue;
    let cursor = range.start;
    let line = lineNumberAt(content, range.start);
    const seen: Record<string, true> = {};
    while (cursor < range.end) {
      const span = readLineSpan(content, cursor, range.end);
      if (!span) break;
      const task = readTaskLine(file.path, line, span.text);
      if (task) {
        const id = uniqueReadId(task.id, seen);
        seen[id] = true;
        results.push({
          rootPath: rootFile.path,
          rootTitle: rootFile.basename,
          rootType: readType(fileFrontmatter(ctx, rootFile)),
          id,
          task: task.task
        });
      }
      cursor = span.next;
      line += 1;
    }
  }
  return results;
}

function rootFilesById(ctx: WorkflowContext): Map<string, TFile> {
  const roots = new Map<string, TFile>();
  for (const file of ctx.app.vault.getMarkdownFiles()) {
    if (isInFolder(file, taskRegistryFolder(ctx)) || isArchivedFile(ctx, file)) continue;
    const rootId = rootIdFromFrontmatter(fileFrontmatter(ctx, file));
    if (rootId && !roots.has(rootId)) roots.set(rootId, file);
  }
  return roots;
}

export async function insertRootTask(ctx: WorkflowContext, rootFile: TFile, value: unknown): Promise<string> {
  const write = normalizeTaskWriteValue(value);
  const taskId = await newTaskId(ctx);
  const line = serializeNewTaskLine(write.task, taskId);
  const shardFile = await ensureTaskShard(ctx, rootFile);
  const base = await ctx.app.vault.read(shardFile);
  const normalized = ensureTaskShardTaskSection(base);
  const current = normalized.content.slice(normalized.range.start, normalized.range.end);
  const next = insertTaskLine(current, line, write.position);
  if (current !== next || base !== normalized.content) {
    await ctx.app.vault.modify(shardFile, spliceTextRange(normalized.content, normalized.range, next));
  }
  return taskId;
}

export async function setRootTaskField(
  ctx: WorkflowContext,
  rootFile: TFile,
  taskId: string,
  field: TaskWritableField,
  value: unknown
): Promise<boolean> {
  const shardFile = await readTaskShardFile(ctx, rootFile);
  if (!shardFile) throw new Error(`task not found: ${taskId}`);
  const before = await ctx.app.vault.read(shardFile);
  const range = taskShardTaskRange(before);
  const line = range ? findEditableTaskLine(shardFile.path, before, range, taskId) : undefined;
  if (!line) throw new Error(`task not found: ${taskId}`);
  const nextValue = normalizeTaskFieldUpdateValue(field, value);
  const nextTask = applyTaskFieldUpdate(line.task, field, nextValue);
  const nextLine = serializeEditableTaskLine(line, nextTask);
  const currentLine = before.slice(line.range.start, line.range.endWithoutBreak);
  if (currentLine === nextLine) return false;
  await ctx.app.vault.modify(shardFile, spliceTextRange(before, line.range, nextLine));
  return true;
}

export async function reorderRootTasks(ctx: WorkflowContext, rootFile: TFile, taskIds: string[]): Promise<boolean> {
  const shardFile = await readTaskShardFile(ctx, rootFile);
  if (!shardFile) throw new Error("task list not found");
  const before = await ctx.app.vault.read(shardFile);
  const range = taskShardTaskRange(before);
  if (!range) throw new Error("task list not found");

  const lines = readEditableTaskLines(shardFile.path, before, range);
  validateTaskReorderIds(lines, taskIds);

  const byId = new Map(lines.map((line) => [line.id, line]));
  const section = before.slice(range.start, range.end);
  const nonTaskContent = removeTextRanges(
    section,
    lines.map((line) => ({
      start: line.range.start - range.start,
      end: line.range.end - range.start
    }))
  );
  if (nonTaskContent.trim()) throw new Error("task reorder only supports managed task lines");

  const nextSection = taskIds
    .map((id) => {
      const line = byId.get(id);
      if (!line) throw new Error(`task not found: ${id}`);
      return before.slice(line.range.start, line.range.endWithoutBreak);
    })
    .join("\n");
  if (section === nextSection) return false;

  await ctx.app.vault.modify(shardFile, spliceTextRange(before, range, nextSection));
  return true;
}

export async function deleteRootTask(ctx: WorkflowContext, rootFile: TFile, taskId: string): Promise<boolean> {
  const shardFile = await readTaskShardFile(ctx, rootFile);
  if (!shardFile) throw new Error(`task not found: ${taskId}`);
  const before = await ctx.app.vault.read(shardFile);
  const range = taskShardTaskRange(before);
  const line = range ? findEditableTaskLine(shardFile.path, before, range, taskId) : undefined;
  if (!line) throw new Error(`task not found: ${taskId}`);
  const after = removeTextRanges(before, [line.range]);
  if (before === after) return false;
  await ctx.app.vault.modify(shardFile, after);
  return true;
}

export function cycleTaskCheckbox(checkbox: string): string {
  const cycle = [" ", "/", "x", "-"];
  const index = cycle.indexOf(checkbox);
  return cycle[index === -1 || index === cycle.length - 1 ? 0 : index + 1];
}

function readTaskLine(path: string, line: number, text: string): TaskLineRead | undefined {
  const match = text.match(/^\s*(?:[-*+]|\d+[.)])\s+\[([^\]\r\n]?)\]\s*(.*)$/);
  if (!match) return undefined;

  const checkbox = match[1] ?? " ";
  const parsed = parseTaskBody(match[2] ?? "");
  if (!parsed.name || !parsed.taskId) return undefined;

  return {
    id: parsed.taskId,
    task: {
      checkbox,
      name: parsed.name,
      ...parsed.metadata
    }
  };
}

function findEditableTaskLine(path: string, content: string, range: TextRange, taskId: string): EditableTaskLine | undefined {
  const seen: Record<string, true> = {};
  let cursor = range.start;
  let line = lineNumberAt(content, range.start);
  while (cursor < range.end) {
    const span = lineTextRangeAt(content, cursor, range.end);
    if (!span) break;

    const text = content.slice(span.start, span.endWithoutBreak);
    const task = readEditableTaskLine(path, line, text, span);
    if (task) {
      const id = uniqueReadId(task.id, seen);
      seen[id] = true;
      if (id === taskId) return {
        ...task,
        id
      };
    }

    cursor = span.end;
    line += 1;
  }
  return undefined;
}

function readEditableTaskLines(path: string, content: string, range: TextRange): EditableTaskLine[] {
  const lines: EditableTaskLine[] = [];
  const seen: Record<string, true> = {};
  let cursor = range.start;
  let line = lineNumberAt(content, range.start);
  while (cursor < range.end) {
    const span = lineTextRangeAt(content, cursor, range.end);
    if (!span) break;

    const text = content.slice(span.start, span.endWithoutBreak);
    const task = readEditableTaskLine(path, line, text, span);
    if (task) {
      const id = uniqueReadId(task.id, seen);
      seen[id] = true;
      lines.push({
        ...task,
        id
      });
    }

    cursor = span.end;
    line += 1;
  }
  return lines;
}

function validateTaskReorderIds(lines: EditableTaskLine[], taskIds: string[]): void {
  if (lines.length !== taskIds.length) {
    throw new Error("task reorder requires the full current task id order");
  }
  const ids = new Set<string>();
  for (const id of taskIds) {
    if (ids.has(id)) throw new Error(`duplicate task id in reorder: ${id}`);
    ids.add(id);
  }
  for (const line of lines) {
    if (!ids.has(line.id)) throw new Error(`missing task id in reorder: ${line.id}`);
  }
}

function readEditableTaskLine(
  path: string,
  line: number,
  text: string,
  range: TextRange & { endWithoutBreak: number }
): EditableTaskLine | undefined {
  const match = text.match(/^(\s*(?:[-*+]|\d+[.)])\s+\[)([^\]\r\n]?)(\]\s*)(.*)$/);
  if (!match) return undefined;

  const parsed = parseTaskBody(match[4] ?? "");
  if (!parsed.name) return undefined;

  return {
    id: parsed.taskId ?? syntheticTaskReadId(path, line),
    range,
    prefix: match[1] ?? "- [",
    checkboxSuffix: match[3] ?? "] ",
    task: {
      checkbox: match[2] ?? " ",
      name: parsed.name,
      ...parsed.metadata
    },
    taskId: parsed.taskId,
    blockId: parsed.blockId
  };
}

const TASK_WRITABLE_FIELDS: TaskWritableField[] = [
  "checkbox",
  "name",
  "priority",
  "due",
  "scheduled",
  "start",
  "created",
  "done",
  "cancelled"
];

const TASK_METADATA_WRITE_FIELDS: Array<keyof TaskMetadata> = [
  "priority",
  "due",
  "scheduled",
  "start",
  "created",
  "done",
  "cancelled"
];

const TASK_PRIORITIES = new Set(["highest", "high", "medium", "low", "lowest"]);

function readTaskWritableField(value: string, originalKey: string): TaskWritableField {
  if (TASK_WRITABLE_FIELDS.includes(value as TaskWritableField)) return value as TaskWritableField;
  throw new Error(`unknown task field for update key: ${originalKey}`);
}

function normalizeTaskWriteValue(value: unknown): TaskWrite {
  if (!isRecord(value)) throw new Error("task insert requires value_json object");
  assertKnownTaskWriteKeys(value);

  const name = normalizeTaskNameValue(value.name);
  const task: TaskRead = {
    checkbox: Object.prototype.hasOwnProperty.call(value, "checkbox") ? normalizeTaskCheckboxValue(value.checkbox) : " ",
    name
  };

  for (const field of TASK_METADATA_WRITE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) continue;
    const normalized = normalizeTaskMetadataWriteValue(field, value[field]);
    if (normalized !== undefined) task[field] = normalized;
  }
  return {
    task,
    position: normalizeTaskInsertPosition(value.position)
  };
}

function assertKnownTaskWriteKeys(value: Record<string, unknown>): void {
  for (const key of Object.keys(value)) {
    if (key !== "position" && !TASK_WRITABLE_FIELDS.includes(key as TaskWritableField)) {
      throw new Error(`unknown task field: ${key}`);
    }
  }
}

function normalizeTaskInsertPosition(value: unknown): number | "end" {
  if (value === undefined || value === null || value === "" || value === "end") return "end";
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error("task position must be a positive integer or end");
  }
  return value;
}

function normalizeTaskFieldUpdateValue(field: TaskWritableField, value: unknown): string | undefined {
  if (field === "checkbox") return normalizeTaskCheckboxValue(value);
  if (field === "name") return normalizeTaskNameValue(value);
  return normalizeTaskMetadataWriteValue(field, value);
}

function normalizeTaskCheckboxValue(value: unknown): string {
  if (typeof value !== "string") throw new Error("task checkbox must be a string");
  const checkbox = normalizeCheckboxFilter(value);
  if (checkbox === undefined) throw new Error("task checkbox is required");
  if (checkbox.length > 1 || checkbox === "]" || checkbox.includes("\n") || checkbox.includes("\r")) {
    throw new Error("task checkbox must be a single status character");
  }
  return checkbox;
}

function normalizeTaskNameValue(value: unknown): string {
  if (typeof value !== "string") throw new Error("task name must be a string");
  const name = value.trim();
  if (!name) throw new Error("task name is required");
  if (/[\r\n]/.test(name)) throw new Error("task name must be a single line");
  return name;
}

function normalizeTaskMetadataWriteValue(field: keyof TaskMetadata, value: unknown): string | undefined {
  if (typeof value !== "string") throw new Error(`task ${field} must be a string`);
  const normalized = normalizeTaskMetadataValue(field, value.trim());
  if (!normalized) return undefined;
  if (field !== "priority" && !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`task ${field} must be YYYY-MM-DD`);
  }
  if (field === "priority" && !TASK_PRIORITIES.has(normalized)) {
    throw new Error("task priority must be one of: highest|high|medium|low|lowest");
  }
  return normalized;
}

function applyTaskFieldUpdate(task: TaskRead, field: TaskWritableField, value: string | undefined): TaskRead {
  const next: TaskRead = { ...task };
  if (value === undefined) {
    if (field === "checkbox" || field === "name") throw new Error(`task ${field} is required`);
    delete next[field];
  } else {
    next[field] = value;
  }
  return next;
}

function serializeNewTaskLine(task: TaskRead, taskId: string): string {
  return `- [${task.checkbox}] ${serializeTaskBody(task, { taskId })}`;
}

function serializeEditableTaskLine(line: EditableTaskLine, task: TaskRead): string {
  return `${line.prefix}${task.checkbox}${line.checkboxSuffix}${serializeTaskBody(task, {
    taskId: line.taskId,
    blockId: line.blockId
  })}`;
}

function serializeTaskBody(task: TaskRead, options: { taskId?: string; blockId?: string } = {}): string {
  const name = normalizeTaskNameValue(task.name);
  const parts = [name];
  if (options.taskId) parts.push(`${TASK_ID_SYMBOL} ${options.taskId}`);
  for (const field of TASK_METADATA_WRITE_FIELDS) {
    const value = task[field];
    if (typeof value === "string" && value.trim()) {
      parts.push(serializeTaskMetadataField(field, value));
    }
  }
  if (options.blockId) parts.push(`^${options.blockId}`);
  return parts.join(" ");
}

function serializeTaskMetadataField(field: keyof TaskMetadata, value: string): string {
  const normalized = normalizeTaskMetadataWriteValue(field, value);
  if (!normalized) return "";
  if (field === "priority") return TASK_PRIORITY_FIELD_SYMBOLS[normalized];
  return `${TASK_DATE_FIELD_SYMBOLS[field]} ${normalized}`;
}

function parseTaskBody(value: string): { name: string; taskId?: string; blockId?: string; metadata: TaskMetadata } {
  let body = value.trim();
  const blockId = readTrailingBlockId(body);
  if (blockId) body = body.replace(/\s+\^[A-Za-z0-9_-]+\s*$/, "").trim();

  const metadata: TaskMetadata = {};
  const taskId = readTaskId(body);
  body = stripTaskIdField(body);
  body = stripEmojiTaskDates(body, metadata);
  body = stripEmojiTaskPriority(body, metadata);

  return {
    name: body.replace(/\s{2,}/g, " ").trim(),
    taskId,
    blockId,
    metadata
  };
}

function readTaskId(value: string): string | undefined {
  return value.match(TASK_ID_REGEX)?.[1];
}

function stripTaskIdField(value: string): string {
  return value.replace(TASK_ID_GLOBAL_REGEX, " ");
}

function readTrailingBlockId(value: string): string | undefined {
  return value.match(/\s+\^([A-Za-z0-9_-]+)\s*$/)?.[1];
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

function normalizeTaskMetadataValue(key: keyof TaskMetadata, value: string): string {
  return key === "priority" ? value.toLowerCase() : value;
}

function uniqueReadId(id: string, items: Record<string, unknown>): string {
  if (!Object.prototype.hasOwnProperty.call(items, id)) return id;
  let index = 2;
  while (Object.prototype.hasOwnProperty.call(items, `${id}-${index}`)) index += 1;
  return `${id}-${index}`;
}

function syntheticTaskReadId(path: string, line: number): string {
  return `task-${hashReadId(`${path}:${line}`)}`;
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
  const frontmatter = yamlFrontmatterRange(content);
  return frontmatter ? content.slice(frontmatter.end) : content;
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

  const retroPlans = await dependentRetroRenamePlans(ctx, file, tagDomain, newTitle);
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
  for (const file of ctx.app.vault.getMarkdownFiles()) {
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

    const existing = ctx.app.vault.getAbstractFileByPath(toPath);
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
    const file = ctx.app.vault.getFileByPath(plan.fromPath);
    if (!file) continue;
    await ensureFolder(ctx.app, parentFolder(plan.toPath));
    await ctx.app.fileManager.renameFile(file, plan.toPath);
    const moved = ctx.app.vault.getFileByPath(plan.toPath);
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
    if (ctx.app.vault.getAbstractFileByPath(shard.path)) await trashAbstractFile(ctx, shard);
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
  return ctx.app.vault.getMarkdownFiles().filter((file) => isInFolder(file, container.path));
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

async function cleanupReferenceFrontmatterItems(
  ctx: WorkflowContext,
  targets: TFile[],
  deletedPathSet: Set<string>
): Promise<number> {
  let removed = 0;
  for (const file of ctx.app.vault.getMarkdownFiles()) {
    if (deletedPathSet.has(file.path)) continue;
    const frontmatter = fileFrontmatter(ctx, file);
    if (!Array.isArray(frontmatter.references)) continue;
    if (!frontmatter.references.some((item) => referenceFrontmatterItemReferencesAnyTarget(ctx, file.path, item, targets))) continue;

    await ctx.app.fileManager.processFrontMatter(file, (fm) => {
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

function lineTextRangeAt(
  content: string,
  start: number,
  maxEnd: number
): (TextRange & { endWithoutBreak: number }) | undefined {
  if (start >= maxEnd) return undefined;
  const newline = content.indexOf("\n", start);
  const end = newline === -1 || newline + 1 > maxEnd ? maxEnd : newline + 1;
  const rawEndWithoutBreak = newline === -1 || newline >= maxEnd ? maxEnd : newline;
  const endWithoutBreak = rawEndWithoutBreak > start && content.charAt(rawEndWithoutBreak - 1) === "\r"
    ? rawEndWithoutBreak - 1
    : rawEndWithoutBreak;
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

  const markdown = parseMarkdownLink(value);
  if (markdown) {
    const target = splitObsidianSubpath(markdown.target).base;
    return target ? linkReferencesAnyTarget(ctx, sourcePath, target, targets) : false;
  }

  return bareStringReferencesAnyTarget(ctx, sourcePath, value, targets);
}

function linkReferencesAnyTarget(
  ctx: WorkflowContext,
  sourcePath: string,
  linkPath: string,
  targets: TFile[]
): boolean {
  const targetPaths = new Set(targets.map((target) => target.path));
  const resolved = resolveLinkReference(ctx, sourcePath, linkPath);
  if (resolved) return targetPaths.has(resolved.path);

  const normalized = normalizeVaultPath(linkPath.split("#")[0]);
  return targets.some((target) => normalized === target.path || normalized === target.basename);
}

function bareStringReferencesAnyTarget(
  ctx: WorkflowContext,
  sourcePath: string,
  value: string,
  targets: TFile[]
): boolean {
  const targetPaths = new Set(targets.map((target) => target.path));
  if (targetPaths.has(normalizeVaultPath(value))) return true;

  const resolved = resolveLinkReference(ctx, sourcePath, value);
  return resolved ? targetPaths.has(resolved.path) : false;
}

function resolveLinkReference(ctx: WorkflowContext, sourcePath: string, linkPath: string): TFile | null {
  if (!linkPath.trim()) return null;
  const split = splitObsidianSubpath(linkPath);
  const withSubpath = referenceTargetWithSubpath(split.base, split.subpath);
  return ctx.app.metadataCache.getFirstLinkpathDest(withSubpath, sourcePath)
    ?? (split.base ? ctx.app.metadataCache.getFirstLinkpathDest(split.base, sourcePath) : null);
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

function isArchivedPath(ctx: WorkflowContext, path: string): boolean {
  const archiveRoot = normalizeVaultPath(ctx.settings.paths.archivesFolder);
  const normalized = normalizeVaultPath(path);
  return normalized === archiveRoot || normalized.startsWith(`${archiveRoot}/`);
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
  [ROOT_ID_FRONTMATTER_KEY]?: unknown;
}, createdAt: string): void {
  frontmatter.created = frontmatter.created || createdAt;
  if (frontmatter.updated === undefined) frontmatter.updated = "";
  if (!rootIdFromFrontmatter(frontmatter)) frontmatter[ROOT_ID_FRONTMATTER_KEY] = newRootId();
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

function uniqueFiles(files: TFile[]): TFile[] {
  const seen = new Set<string>();
  const result: TFile[] = [];
  for (const file of files) {
    if (seen.has(file.path)) continue;
    seen.add(file.path);
    result.push(file);
  }
  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
