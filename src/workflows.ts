import { App, TAbstractFile, TFile, TFolder } from "obsidian";
import { localePack } from "./i18n";
import { hasOwn, isRecord } from "./infra/records";
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
import {
  isExternalReference as isExternalReferenceTarget,
  parseMarkdownLink,
  parseWikiLink as parseWikiLinkTarget,
  pathBasenameWithoutExtension as pathBasenameWithoutExtensionTarget,
  referenceTargetWithSubpath,
  splitObsidianSubpath as splitObsidianSubpathTarget
} from "./workflows/reference-targets";
import {
  deleteReferenceItem as deleteReferenceItemModel,
  insertReferenceItem as insertReferenceItemModel,
  readReferenceItems as readReferenceItemsModel,
  readReferenceItemsFresh as readReferenceItemsFreshModel,
  reorderReferenceItems as reorderReferenceItemsModel,
  setReferenceItemField as setReferenceItemFieldModel,
  updateReferenceItem as updateReferenceItemModel,
  type ReferenceMutationResult as ReferenceMutationResultModel,
  type ReferenceRead as ReferenceReadModel,
  type ReferenceStoredItem as ReferenceStoredItemModel,
  type ReferenceWriteInput as ReferenceWriteInputModel
} from "./workflows/reference-items";
import {
  fileFrontmatter,
  parseFrontmatterFromContent,
  readFileFrontmatterFresh,
  readFileTypeFresh,
  readType,
  type Frontmatter
} from "./vault/note-frontmatter";
import {
  ROOT_ID_FRONTMATTER_KEY,
  cycleTaskCheckbox as cycleTaskCheckboxTask,
  deleteRootTask as deleteRootTaskTask,
  insertRootTask as insertRootTaskTask,
  newRootId,
  readAllTaskItems as readAllTaskItemsTask,
  readRootTaskMap as readRootTaskMapTask,
  readTaskShardFile,
  reorderRootTasks as reorderRootTasksTask,
  rootIdFromFrontmatter,
  setRootTaskField as setRootTaskFieldTask,
  type RootTaskItem,
  type TaskRead as TaskReadModel,
  type TaskWritableField as TaskWritableFieldModel
} from "./workflows/tasks";
import {
  archiveAwareFolders,
  archivedCounterpartFolder,
  assertVacantPath,
  ensureFolderStyleParent,
  folderForZkKind,
  folderName,
  folderStyleCanonicalPaths,
  folderStyleContainer,
  isArchivedFile,
  isArchivedPath,
  relativePathUnderRoot,
  uniqueFolderStyleMarkdownPath,
  uniqueMarkdownPath
} from "./workflows/note-locations";
import { readOptionalCode } from "./workflows/code-options";
import {
  AREA_READ_SPEC,
  JOURNAL_READ_SPEC,
  PROJECT_READ_SPEC,
  RESOURCE_READ_SPEC,
  RETRO_READ_SPEC,
  readSurface,
  specForType,
  updateSurface,
  type CollectionReadOptions as SurfaceCollectionReadOptions,
  type UpdateOperation as SurfaceUpdateOperation,
  type UpdatePayloadOptions as SurfaceUpdatePayloadOptions,
  type UpdateSurfaceResult as SurfaceUpdateSurfaceResult
} from "./workflows/surfaces";
import { ensureFolder, isInFolder, parentFolder } from "./vault/files";

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

export type CollectionReadOptions = SurfaceCollectionReadOptions;

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

export type UpdateOperation = SurfaceUpdateOperation;

export type UpdatePayloadOptions = SurfaceUpdatePayloadOptions;

export type UpdateByTitleOptions = ByTitleSelectorOptions & UpdatePayloadOptions;
export type UpdateProjectOptions = UpdateByTitleOptions;
export type UpdateAreaOptions = UpdateByTitleOptions;
export type UpdateResourceOptions = UpdateByTitleOptions;

export type UpdateZkOptions = ZkSelectorOptions & UpdatePayloadOptions;
export type UpdateJournalOptions = JournalSelectorOptions & UpdatePayloadOptions;
export type UpdateRetroOptions = ByTitleSelectorOptions & { date?: string } & UpdatePayloadOptions;

export type UpdateSurfaceResult = SurfaceUpdateSurfaceResult;

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
export type TaskRead = TaskReadModel;
export type TaskWritableField = TaskWritableFieldModel;
export type ReferenceStoredItem = ReferenceStoredItemModel;
export type ReferenceRead = ReferenceReadModel;
type ReferenceWriteInput = ReferenceWriteInputModel;
type ReferenceMutationResult = ReferenceMutationResultModel;
export async function createProject(ctx: WorkflowContext, options: CreateProjectOptions): Promise<NoteResult & {
  areas?: ProjectAreaResult[];
}> {
  const title = requireTitle(options.title, "project title");
  const target = uniqueFolderStyleMarkdownPath(ctx, ctx.settings.paths.projectsFolder, title);
  await ensureFolder(ctx.app, target.folder);

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
  await ctx.app.fileManager.processFrontMatter(file, (fm) => {
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

export async function readProject(ctx: WorkflowContext, options: ReadProjectOptions): Promise<Record<string, unknown>> {
  return readSurface(ctx, await resolveRequiredProject(ctx, options), PROJECT_READ_SPEC, options.key, options.collection);
}

export async function readArea(ctx: WorkflowContext, options: ReadAreaOptions): Promise<Record<string, unknown>> {
  return readSurface(ctx, await resolveRequiredArea(ctx, options), AREA_READ_SPEC, options.key, options.collection);
}

export async function readResource(ctx: WorkflowContext, options: ReadResourceOptions): Promise<Record<string, unknown>> {
  return readSurface(ctx, await resolveRequiredResource(ctx, options), RESOURCE_READ_SPEC, options.key, options.collection);
}

export async function readZk(ctx: WorkflowContext, options: ReadZkOptions): Promise<Record<string, unknown>> {
  const file = await resolveRequiredZk(ctx, options);
  const type = await readFileTypeFresh(ctx, file);
  return readSurface(ctx, file, specForType(type), options.key, options.collection);
}

export async function readJournal(ctx: WorkflowContext, options: ReadJournalOptions): Promise<Record<string, unknown>> {
  return readSurface(ctx, await resolveRequiredJournal(ctx, options), JOURNAL_READ_SPEC, options.key, options.collection);
}

export async function readRetro(ctx: WorkflowContext, options: ReadRetroOptions): Promise<Record<string, unknown>> {
  return readSurface(ctx, await resolveRequiredRetro(ctx, options), RETRO_READ_SPEC, options.key, options.collection);
}

export async function updateProject(ctx: WorkflowContext, options: UpdateProjectOptions): Promise<UpdateSurfaceResult> {
  return updateSurface(ctx, await resolveRequiredProject(ctx, options), PROJECT_READ_SPEC, options);
}

export async function updateArea(ctx: WorkflowContext, options: UpdateAreaOptions): Promise<UpdateSurfaceResult> {
  return updateSurface(ctx, await resolveRequiredArea(ctx, options), AREA_READ_SPEC, options);
}

export async function updateResource(ctx: WorkflowContext, options: UpdateResourceOptions): Promise<UpdateSurfaceResult> {
  return updateSurface(ctx, await resolveRequiredResource(ctx, options), RESOURCE_READ_SPEC, options);
}

export async function updateZk(ctx: WorkflowContext, options: UpdateZkOptions): Promise<UpdateSurfaceResult> {
  const file = await resolveRequiredZk(ctx, options);
  const type = await readFileTypeFresh(ctx, file);
  return updateSurface(ctx, file, specForType(type), options);
}

export async function updateJournal(ctx: WorkflowContext, options: UpdateJournalOptions): Promise<UpdateSurfaceResult> {
  return updateSurface(ctx, await resolveRequiredJournal(ctx, options), JOURNAL_READ_SPEC, options);
}

export async function updateRetro(ctx: WorkflowContext, options: UpdateRetroOptions): Promise<UpdateSurfaceResult> {
  return updateSurface(ctx, await resolveRequiredRetro(ctx, options), RETRO_READ_SPEC, options);
}

export async function renameProject(ctx: WorkflowContext, options: RenameByTitleOptions): Promise<RenameResult> {
  return renameFolderStyleNote(
    ctx,
    await resolveRequiredProject(ctx, options),
    requireTitle(options.newTitle, "new_title"),
    "project"
  );
}

export async function renameArea(ctx: WorkflowContext, options: RenameByTitleOptions): Promise<RenameResult> {
  return renameFolderStyleNote(
    ctx,
    await resolveRequiredArea(ctx, options),
    requireTitle(options.newTitle, "new_title"),
    "area"
  );
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

export async function createArea(ctx: WorkflowContext, options: CreateAreaOptions): Promise<NoteResult> {
  const title = requireTitle(options.title, "area title");
  const target = uniqueFolderStyleMarkdownPath(ctx, ctx.settings.paths.areasFolder, title);
  await ensureFolder(ctx.app, target.folder);

  const createdAt = localDateTimeSpace();
  const parent = resolveOptionalFile(ctx, options.parentPath);
  const file = await createMarkdownFile(ctx, "area", target.path, {
    created: createdAt,
    slug: slugify(target.title),
    cursor: ""
  });

  const tags = localePack(ctx.settings.locale).tags;
  await ctx.app.fileManager.processFrontMatter(file, (fm) => {
    fm.type = "area";
    fm.tags = [`${tags.area}/${slugify(target.title)}`];
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
  return normalizeTemplateOutput(collapseExcessBlankLines(result.replace(/{{\s*[A-Za-z0-9_]+\s*}}/g, "")));
}

function collapseExcessBlankLines(content: string): string {
  return content.replace(/\n[ \t]*\n[ \t]*\n+/g, "\n\n");
}

function normalizeTemplateOutput(content: string): string {
  return content.replace(/\n+$/, "\n");
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

export function pathBasenameWithoutExtension(path: string): string {
  return pathBasenameWithoutExtensionTarget(path);
}

export function readReferenceItems(ctx: WorkflowContext, file: TFile): ReferenceRead[] {
  return readReferenceItemsModel(ctx, file);
}

export async function readReferenceItemsFresh(ctx: WorkflowContext, file: TFile): Promise<ReferenceRead[]> {
  return readReferenceItemsFreshModel(ctx, file);
}

export async function insertReferenceItem(
  ctx: WorkflowContext,
  file: TFile,
  input: ReferenceWriteInput
): Promise<ReferenceMutationResult> {
  return insertReferenceItemModel(ctx, file, input);
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
  return updateReferenceItemModel(ctx, file, index, patch);
}

export async function setReferenceItemField(
  ctx: WorkflowContext,
  file: TFile,
  index: number,
  field: string,
  value: unknown
): Promise<ReferenceMutationResult> {
  return setReferenceItemFieldModel(ctx, file, index, field, value);
}

export async function deleteReferenceItem(
  ctx: WorkflowContext,
  file: TFile,
  index: number
): Promise<ReferenceMutationResult> {
  return deleteReferenceItemModel(ctx, file, index);
}

export async function reorderReferenceItems(
  ctx: WorkflowContext,
  file: TFile,
  links: string[]
): Promise<{ changed: boolean; items: ReferenceRead[] }> {
  return reorderReferenceItemsModel(ctx, file, links);
}

export function parseWikiLink(value: string): { target: string; alias?: string } | undefined {
  return parseWikiLinkTarget(value);
}

export function splitObsidianSubpath(value: string): { base: string; subpath: string } {
  return splitObsidianSubpathTarget(value);
}

export function isExternalReference(value: string): boolean {
  return isExternalReferenceTarget(value);
}

function countListItems(section: string, prefix: string): number {
  const escapedPrefix = escapeRegExp(prefix);
  const numberRe = new RegExp(`^${escapedPrefix}\\s*\\d+\\.\\s+`);
  const bulletRe = new RegExp(`^${escapedPrefix}\\s*[-*+]\\s+`);
  return section.split(/\n/).filter((line) => numberRe.test(line) || bulletRe.test(line)).length;
}

export async function readRootTaskMap(ctx: WorkflowContext, rootFile: TFile): Promise<Record<string, TaskRead>> {
  return readRootTaskMapTask(ctx, rootFile);
}

export async function readAllTaskItems(ctx: WorkflowContext): Promise<RootTaskItem[]> {
  return readAllTaskItemsTask(ctx);
}

export async function insertRootTask(ctx: WorkflowContext, rootFile: TFile, value: unknown): Promise<string> {
  return insertRootTaskTask(ctx, rootFile, value);
}

export async function setRootTaskField(
  ctx: WorkflowContext,
  rootFile: TFile,
  taskId: string,
  field: TaskWritableField,
  value: unknown
): Promise<boolean> {
  return setRootTaskFieldTask(ctx, rootFile, taskId, field, value);
}

export async function reorderRootTasks(ctx: WorkflowContext, rootFile: TFile, taskIds: string[]): Promise<boolean> {
  return reorderRootTasksTask(ctx, rootFile, taskIds);
}

export async function deleteRootTask(ctx: WorkflowContext, rootFile: TFile, taskId: string): Promise<boolean> {
  return deleteRootTaskTask(ctx, rootFile, taskId);
}

export function cycleTaskCheckbox(checkbox: string): string {
  return cycleTaskCheckboxTask(checkbox);
}

function retroSourceType(ctx: WorkflowContext, file: TFile, frontmatter: Frontmatter): string {
  const type = String(frontmatter.type ?? "").trim().toLowerCase();
  if (type) return type;
  if (isCanonicalFolderNote(file, ctx.settings.paths.projectsFolder)) return "project";
  if (isCanonicalFolderNote(file, ctx.settings.paths.areasFolder)) return "area";
  return "";
}

async function findExistingSourceRetroForWeek(
  ctx: WorkflowContext,
  source: TFile,
  sourceType: string,
  weekSegment: string
): Promise<TFile | undefined> {
  const domain = sourceType === "project" || sourceType === "area" ? sourceType : undefined;
  if (!domain) return undefined;

  const matches: TFile[] = [];
  for (const file of ctx.app.vault.getMarkdownFiles()) {
    if (!isInFolder(file, ctx.settings.paths.retrosFolder)) continue;
    const frontmatter = await readFileFrontmatterFresh(ctx, file);
    if (readType(frontmatter) !== "retro") continue;
    if (retroWeekSegment(file, frontmatter) !== weekSegment) continue;
    if (!isSourceScopedRetro(ctx, file, frontmatter, source, domain)) continue;
    matches.push(file);
  }

  return matches.sort((left, right) => {
    const leftDefault = isDefaultSourceRetroFilename(ctx, left.basename, domain, source.basename, weekSegment);
    const rightDefault = isDefaultSourceRetroFilename(ctx, right.basename, domain, source.basename, weekSegment);
    if (leftDefault !== rightDefault) return leftDefault ? -1 : 1;
    return left.path.localeCompare(right.path);
  })[0];
}

function isCanonicalFolderNote(file: TFile, rootFolder: string): boolean {
  if (!isInFolder(file, rootFolder)) return false;
  const directPath = joinVaultPath(rootFolder, `${file.basename}.md`);
  const folderStylePath = joinVaultPath(rootFolder, file.basename, `${file.basename}.md`);
  return file.path === directPath || file.path === folderStylePath;
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

async function resolveRequiredProject(ctx: WorkflowContext, options: ReadProjectOptions): Promise<TFile> {
  const file = options.path
    ? resolveRequiredFile(ctx, options.path, "project note")
    : findProjectByTitle(ctx, requireTitle(options.title, "project title"), options.archived);
  if (!file) throw new Error(`project not found: ${options.title}`);

  const type = await readFileTypeFresh(ctx, file);
  if (type !== "project") throw new Error(`file is not a project note: ${file.path}`);
  return file;
}

async function resolveRequiredArea(ctx: WorkflowContext, options: ReadAreaOptions): Promise<TFile> {
  const file = options.path
    ? resolveRequiredFile(ctx, options.path, "area note")
    : findAreaByTitleForRead(ctx, requireTitle(options.title, "area title"), options.archived);
  if (!file) throw new Error(`area not found: ${options.title}`);

  const type = await readFileTypeFresh(ctx, file);
  if (type !== "area") throw new Error(`file is not an area note: ${file.path}`);
  return file;
}

async function resolveRequiredResource(ctx: WorkflowContext, options: ReadResourceOptions): Promise<TFile> {
  const file = options.path
    ? resolveRequiredFile(ctx, options.path, "resource note")
    : findResourceByTitle(ctx, requireTitle(options.title, "resource title"), options.archived);
  if (!file) throw new Error(`resource not found: ${options.title}`);

  const type = await readFileTypeFresh(ctx, file);
  if (type !== "resource") throw new Error(`file is not a resource note: ${file.path}`);
  return file;
}

async function resolveRequiredZk(ctx: WorkflowContext, options: ReadZkOptions): Promise<TFile> {
  const kind = readOptionalCode(options.kind, parseZkKind, "kind", ZK_KIND_CODE_HELP);
  const file = options.path
    ? resolveRequiredFile(ctx, options.path, "ZK note")
    : findZkByTitle(ctx, requireTitle(options.title, "ZK title"), kind);
  if (!file) throw new Error(`ZK note not found: ${options.title}`);

  const type = await readFileTypeFresh(ctx, file);
  if (!type.startsWith("zk_")) throw new Error(`file is not a ZK note: ${file.path}`);
  if (kind && type !== typeForZkKind(kind)) throw new Error(`file is not a ${kind} ZK note: ${file.path}`);
  return file;
}

async function resolveRequiredJournal(ctx: WorkflowContext, options: ReadJournalOptions): Promise<TFile> {
  const file = options.path
    ? resolveRequiredFile(ctx, options.path, "journal note")
    : ctx.app.vault.getFileByPath(journalPath(ctx, options.date));
  if (!file) throw new Error(`journal not found: ${localDate(dateFromCli(options.date))}`);

  const type = await readFileTypeFresh(ctx, file);
  if (type !== "journal") throw new Error(`file is not a journal note: ${file.path}`);
  return file;
}

async function resolveRequiredRetro(ctx: WorkflowContext, options: ReadRetroOptions): Promise<TFile> {
  const file = options.path
    ? resolveRequiredFile(ctx, options.path, "retro note")
    : findRetroByTitle(ctx, requireTitle(options.title, "retro title"), options.date, options.archived);
  if (!file) throw new Error(`retro not found: ${options.title}`);

  const type = await readFileTypeFresh(ctx, file);
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

function zkSearchFolders(ctx: WorkflowContext, kind: ZkKind | undefined): string[] {
  return kind
    ? [folderForZkKind(ctx.settings, kind)]
    : [ctx.settings.paths.fleetingFolder, ctx.settings.paths.literatureFolder, ctx.settings.paths.permanentFolder];
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
  const canonicalPaths = folderStyleCanonicalPaths(ctx.settings.paths.areasFolder, title);

  for (const path of canonicalPaths) {
    const file = ctx.app.vault.getFileByPath(path);
    if (file) return file;
  }

  return findUniqueNoteByTitle(ctx, {
    title,
    folders: [ctx.settings.paths.areasFolder],
    type: "area",
    label: "area"
  });
}

function areaResult(file: TFile, created: boolean): ProjectAreaResult {
  return {
    title: file.basename,
    path: file.path,
    link: linkToFile(file),
    created
  };
}

async function openIfRequested(ctx: WorkflowContext, file: TFile, open?: boolean): Promise<void> {
  if (!open) return;
  await ctx.app.workspace.getLeaf(true).openFile(file);
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
