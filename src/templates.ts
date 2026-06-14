import type { ParaZkSettings } from "./types";
import { localePack } from "./i18n";
import type { PropsViewType } from "./props/schema";
import { ZK_KIND_CODES } from "./zk/kinds";

export type ManagedArtifact = {
  path: string;
  content: string;
};

export const TEMPLATE_NAMES = [
  "project",
  "area",
  "resource",
  "llm-wiki",
  "journal",
  "retro",
  "subnote",
  "spark",
  "digest",
  "permanent"
] as const;

export type TemplateName = typeof TEMPLATE_NAMES[number];

export function managedArtifacts(settings: ParaZkSettings): ManagedArtifact[] {
  const t = localePack(settings.locale);
  const templates = TEMPLATE_NAMES.map((name) => ({
    path: `${settings.paths.managedTemplatesFolder}/template_${name}.md`,
    content: renderTemplate(name, settings)
  }));

  return [
    ...templates,
    {
      path: "README.md",
      content: renderGuide(settings)
    },
    {
      path: `${settings.paths.dashboardFolder}/HomePage.md`,
      content: renderDashboard("home", settings)
    },
    {
      path: `${settings.paths.dashboardFolder}/Projects.md`,
      content: renderDashboard("projects", settings)
    },
    {
      path: `${settings.paths.dashboardFolder}/Areas.md`,
      content: renderDashboard("areas", settings)
    },
    {
      path: `${settings.paths.dashboardFolder}/Resources.md`,
      content: renderDashboard("resources", settings)
    },
    {
      path: `${settings.paths.dashboardFolder}/ZK.md`,
      content: renderDashboard("zk", settings)
    },
    {
      path: `${settings.paths.dashboardFolder}/Tasks.md`,
      content: renderDashboard("tasks", settings)
    },
    {
      path: `${settings.paths.dashboardFolder}/Review.md`,
      content: renderDashboard("review", settings)
    },
    {
      path: `${settings.paths.managedTemplatesFolder}/README.md`,
      content: [
        `# ${t.labels.references}`,
        "",
        ...TEMPLATE_NAMES.map((name) => `- [[template_${name}]]`),
        "",
        t.labels.managedTemplatesNote,
        "",
        `${t.labels.locale}: ${t.locale}`,
        ""
      ].join("\n")
    }
  ];
}

export function renderTemplate(name: TemplateName, settings: ParaZkSettings): string {
  const t = localePack(settings.locale);
  const tags = t.tags;
  const slugPlaceholder = "{{slug}}";

  switch (name) {
    case "project":
      return [
        frontmatter([
          "type: project",
          "tags:",
          `  - ${tags.project}/${slugPlaceholder}`,
          "created:",
          "updated:",
          "aliases:",
          "areas:",
          "due_date:",
          "status: {{status}}",
          "start_date:",
          "priority: {{priority}}",
          "done_date:"
        ]),
        paraZkPropsBlock("project"),
        `# ${t.labels.summary}`,
        ...latestRetroSummaryBlock(),
        "{{cursor}}",
        "",
        `# ${t.labels.goals}`,
        "",
        `| ${t.labels.content} | ${t.labels.successCriteria} |`,
        "| --- | --- |",
        "| | |",
        "",
        paraZkManagedBlock(),
        ""
      ].join("\n");
    case "area":
      return [
        frontmatter([
          "type: area",
          "tags:",
          `  - ${tags.area}/${slugPlaceholder}`,
          "created:",
          "updated:",
          "parent:"
        ]),
        paraZkPropsBlock("area"),
        `# ${t.labels.overview}`,
        "",
        "{{cursor}}",
        "",
        paraZkManagedBlock(),
        ""
      ].join("\n");
    case "resource":
      return [
        frontmatter([
          "type: resource",
          "tags:",
          `  - ${tags.resource}`,
          "created:",
          "updated:",
          "aliases:",
          "url:",
          "first_author:",
          "license:",
          "kind:"
        ]),
        paraZkPropsBlock("resource"),
        "{{cursor}}",
        "",
        paraZkManagedBlock(),
        ""
      ].join("\n");
    case "llm-wiki":
      return [
        frontmatter([
          "type: llm-wiki",
          "tags:",
          `  - ${tags.llmWiki}`,
          "created:",
          "updated:",
          "created_by:",
          "updated_by:",
          "aliases:"
        ]),
        paraZkPropsBlock("llm-wiki"),
        "{{cursor}}",
        "",
        paraZkManagedBlock(),
        ""
      ].join("\n");
    case "journal":
      return [
        frontmatter([
          "type: journal",
          "tags:",
          `  - ${tags.journal}`,
          "created:",
          "updated:",
          "date: {{date}}",
          "energy: {{energy}}"
        ]),
        paraZkPropsBlock("journal"),
        `# ${t.labels.focus}`,
        "- [ ] {{cursor}}",
        "",
        `# ${t.labels.quickMemo}`,
        "",
        `# ${t.labels.timeline}`,
        "- 09:00 ",
        "- 14:30 ",
        "",
        `# ${t.labels.shortReview}`,
        `- ${t.labels.whatWentWell}:`,
        `- ${t.labels.improvements}:`,
        "",
        paraZkManagedBlock(),
        ""
      ].join("\n");
    case "retro":
      return [
        frontmatter([
          "type: retro",
          "tags:",
          `  - ${tags.retro}`,
          "created:",
          "updated:",
          "project: {{project_frontmatter}}",
          "date: {{date}}",
          "week_iso: {{week_iso}}",
          "week_start: {{week_start}}",
          "week_end: {{week_end}}",
          "areas: {{areas_frontmatter}}"
        ]),
        paraZkPropsBlock("retro"),
        "---",
        `# ${t.labels.weekProgress}`,
        "- {{cursor}}",
        "",
        `# ${t.labels.good}`,
        "- ",
        "",
        `# ${t.labels.improve}`,
        "- ",
        "",
        `# ${t.labels.risks}`,
        "- ",
        "",
        `# ${t.labels.retroSummary}`,
        ""
      ].join("\n");
    case "subnote":
      return [
        frontmatter([
          "type: subnote",
          "created:",
          "updated:",
          "subnote_type: {{subnote_type}}",
          "parent:"
        ]),
        paraZkPropsBlock("subnote"),
        "{{cursor}}",
        "",
        paraZkManagedBlock(),
        ""
      ].join("\n");
    case "spark":
      return [
        frontmatter([
          "type: spark",
          "tags:",
          "created:",
          "updated:",
          "processed: false"
        ]),
        paraZkPropsBlock("spark"),
        "{{cursor}}",
        "",
        paraZkManagedBlock(),
        ""
      ].join("\n");
    case "digest":
      return [
        frontmatter([
          "type: digest",
          "tags:",
          "created:",
          "updated:",
          "sourceTitle:",
          "url:",
          "first_author:",
          "published:"
        ]),
        paraZkPropsBlock("digest"),
        "{{cursor}}",
        "",
        paraZkManagedBlock(),
        ""
      ].join("\n");
    case "permanent":
      return [
        frontmatter([
          "type: permanent",
          "tags:",
          "created:",
          "updated:",
          "maturity: {{maturity}}",
          "aliases:"
        ]),
        paraZkPropsBlock("permanent"),
        "{{cursor}}",
        "",
        paraZkManagedBlock(),
        ""
      ].join("\n");
  }
}

function frontmatter(lines: string[]): string {
  return [
    "---",
    ...lines,
    "---"
  ].join("\n");
}

function paraZkPropsBlock(type: PropsViewType): string {
  return [
    "```para-zk-props",
    `type: ${type}`,
    "```"
  ].join("\n");
}

function paraZkManagedBlock(): string {
  return fenced("para-zk-managed", []).join("\n");
}

function paraZkViewBlock(key: DataviewViewKey, title?: string): string {
  return fenced("para-zk-view", title ? [
    `key: ${key}`,
    `title: ${title}`
  ] : [key]).join("\n");
}

function paraZkTasksBlock(root: "current" | "all", extra: string[] = [], title?: string): string[] {
  return fenced("para-zk-tasks", [
    `root: ${root}`,
    ...(title ? [`title: ${title}`] : []),
    ...extra
  ]);
}

function paraZkReferencesBlock(root: "current", title?: string): string[] {
  return fenced("para-zk-references", [
    `root: ${root}`,
    ...(title ? [`title: ${title}`] : [])
  ]);
}

function latestRetroSummaryBlock(): string[] {
  return fenced("para-zk-latest-retro-summary", []);
}

function fenced(language: string, lines: string[]): string[] {
  return [
    `\`\`\`${language}`,
    ...lines,
    "```"
  ];
}

export function managedUiBlockForType(type: string, settings: ParaZkSettings): string | undefined {
  const t = localePack(settings.locale);
  switch (type.trim().toLocaleLowerCase()) {
    case "project":
      return joinManagedUiBlocks([
        paraZkTasksBlock("current", [], t.labels.tasks),
        paraZkViewBlock("project-subnotes", t.labels.subnotes),
        paraZkViewBlock("project-retros", t.labels.retros),
        paraZkReferencesBlock("current", t.labels.references)
      ]);
    case "area":
      return joinManagedUiBlocks([
        paraZkViewBlock("area-projects", t.labels.dashboardProjects),
        paraZkTasksBlock("current", [], t.labels.tasks),
        paraZkViewBlock("area-subareas", t.labels.subareas),
        paraZkViewBlock("area-subnotes", t.labels.subnotes),
        paraZkViewBlock("area-retros", t.labels.retros),
        paraZkReferencesBlock("current", t.labels.references)
      ]);
    case "subnote":
      return joinManagedUiBlocks([
        paraZkReferencesBlock("current", t.labels.references)
      ]);
    case "resource":
      return joinManagedUiBlocks([
        paraZkViewBlock("resource-cited-by", t.labels.createdFromThis),
        paraZkReferencesBlock("current", t.labels.references)
      ]);
    case "llm-wiki":
      return joinManagedUiBlocks([
        paraZkViewBlock("llm-wiki-cited-by", t.labels.citedBy),
        paraZkReferencesBlock("current", t.labels.references)
      ]);
    case "journal":
      return joinManagedUiBlocks([
        paraZkTasksBlock("current", [], t.labels.tasks),
        paraZkReferencesBlock("current", t.labels.references)
      ]);
    case "spark":
      return joinManagedUiBlocks([
        paraZkViewBlock("spark-distill", t.labels.createdFromThis),
        paraZkReferencesBlock("current", t.labels.references)
      ]);
    case "digest":
      return joinManagedUiBlocks([
        paraZkViewBlock("digest-cited-by", t.labels.createdFromThis),
        paraZkReferencesBlock("current", t.labels.references)
      ]);
    case "permanent":
      return joinManagedUiBlocks([
        paraZkViewBlock("permanent-cited-by", t.labels.citedBy),
        paraZkReferencesBlock("current", t.labels.references)
      ]);
    default:
      return undefined;
  }
}

function managedUiLines(body: string | string[]): string[] {
  return Array.isArray(body) ? body : body.split(/\r?\n/);
}

function joinManagedUiBlocks(blocks: Array<string | string[]>): string {
  const lines: string[] = ["", "---"];
  for (const [index, block] of blocks.entries()) {
    if (index > 0) lines.push("", "---");
    lines.push(...managedUiLines(block));
  }
  return [...lines, ""].join("\n");
}

function dataviewProjectRetros(t: ReturnType<typeof localePack>, settings: ParaZkSettings, sourcePath?: string): string[] {
  return fenced("dataview", [
    `TABLE WITHOUT ID link(file.path, replace(week_iso, "-", "_")) AS "${t.labels.retros}", file.mtime AS "${t.labels.updated}"`,
    `FROM ${dataviewSource(settings.paths.retrosFolder)}`,
    `WHERE project = ${dataviewCurrentFileLink(sourcePath)}`,
    "SORT date DESC",
    "LIMIT 10"
  ]);
}

function dataviewAreaProjects(t: ReturnType<typeof localePack>, settings: ParaZkSettings, sourcePath?: string): string[] {
  return fenced("dataview", [
    `TABLE WITHOUT ID file.link AS "${t.labels.project}", status AS "${t.labels.status}", priority AS "${t.labels.priority}"`,
    `FROM ${dataviewSource(settings.paths.projectsFolder)}`,
    `WHERE contains(areas, ${dataviewCurrentFileLink(sourcePath)})`,
    "SORT due_date ASC, priority DESC"
  ]);
}

function dataviewChildAreas(t: ReturnType<typeof localePack>, settings: ParaZkSettings, sourcePath?: string): string[] {
  return fenced("dataview", [
    `TABLE WITHOUT ID file.link AS "${t.labels.area}", file.mtime AS "${t.labels.updated}"`,
    `FROM ${dataviewSource(settings.paths.areasFolder)}`,
    `WHERE parent = ${dataviewCurrentFileLink(sourcePath)} AND type = "area"`,
    "SORT file.name ASC"
  ]);
}

function dataviewChildDocs(t: ReturnType<typeof localePack>, sourcePath?: string): string[] {
  return fenced("dataview", [
    `TABLE WITHOUT ID file.link AS "${t.labels.filename}", file.mtime AS "${t.labels.updated}"`,
    "FROM \"\"",
    `WHERE parent = ${dataviewCurrentFileLink(sourcePath)} AND type = "subnote"`,
    "SORT file.name ASC"
  ]);
}

function dataviewAreaRetros(t: ReturnType<typeof localePack>, settings: ParaZkSettings, sourcePath?: string): string[] {
  return fenced("dataview", [
    `TABLE WITHOUT ID link(file.path, replace(week_iso, "-", "_")) AS "${t.labels.retros}", file.mtime AS "${t.labels.updated}"`,
    `FROM ${dataviewSource(settings.paths.retrosFolder)}`,
    `WHERE contains(areas, ${dataviewCurrentFileLink(sourcePath)})`,
    "SORT date DESC",
    "LIMIT 10"
  ]);
}

// Notes (in ZK folders) that reference the current file. Read-only derived view
// over Obsidian's link graph — the single-direction reference made on the citing
// side surfaces here without any reverse link being stored (see ZK redesign).
function dataviewCitedBy(t: ReturnType<typeof localePack>, settings: ParaZkSettings, sourcePath?: string): string[] {
  return dataviewCitedByFromFolders(t, zkSourceFolders(settings), sourcePath);
}

function dataviewWikiCitedBy(t: ReturnType<typeof localePack>, settings: ParaZkSettings, sourcePath?: string): string[] {
  return dataviewCitedByFromFolders(t, [settings.paths.wikiFolder], sourcePath);
}

function dataviewCitedByFromFolders(t: ReturnType<typeof localePack>, folders: string[], sourcePath?: string): string[] {
  return fenced("dataview", [
    `TABLE WITHOUT ID file.link AS "${t.labels.filename}", file.mtime AS "${t.labels.updated}"`,
    `FROM ${dataviewSources(folders)}`,
    `WHERE contains(file.outlinks, ${dataviewCurrentFileLink(sourcePath)})`,
    "SORT file.mtime DESC"
  ]);
}

// The permanents a spark has been distilled into. The `distilled_to` pointer lives
// on the spark itself, so this list (and any link) disappears when the spark is
// discarded — no dangling links are left in the permanents.
function dataviewDistilledInto(t: ReturnType<typeof localePack>): string[] {
  return fenced("dataview", [
    `TABLE WITHOUT ID distilled_to AS "${t.labels.filename}"`,
    "WHERE file.path = this.file.path AND distilled_to"
  ]);
}

export const DATAVIEW_VIEW_KEYS = [
  "project-subnotes",
  "project-retros",
  "area-projects",
  "area-subareas",
  "area-subnotes",
  "area-retros",
  "resource-cited-by",
  "llm-wiki-cited-by",
  "permanent-cited-by",
  "spark-distill",
  "digest-cited-by"
] as const;

export type DataviewViewKey = typeof DATAVIEW_VIEW_KEYS[number];

/**
 * Returns the fenced Dataview block for a named view, so notes can embed a
 * compact `para-zk-view` token instead of the full query. The query (and its
 * localized column labels) stays in code; the renderer expands it at view time.
 */
export function dataviewViewBlock(key: string, settings: ParaZkSettings, sourcePath?: string): string | undefined {
  const t = localePack(settings.locale);
  switch (key) {
    case "project-subnotes": return dataviewChildDocs(t, sourcePath).join("\n");
    case "project-retros": return dataviewProjectRetros(t, settings, sourcePath).join("\n");
    case "area-projects": return dataviewAreaProjects(t, settings, sourcePath).join("\n");
    case "area-subareas": return dataviewChildAreas(t, settings, sourcePath).join("\n");
    case "area-subnotes": return dataviewChildDocs(t, sourcePath).join("\n");
    case "area-retros": return dataviewAreaRetros(t, settings, sourcePath).join("\n");
    case "resource-cited-by":
    case "permanent-cited-by":
    case "digest-cited-by":
      return dataviewCitedBy(t, settings, sourcePath).join("\n");
    case "llm-wiki-cited-by": return dataviewWikiCitedBy(t, settings, sourcePath).join("\n");
    case "spark-distill": return dataviewDistilledInto(t).join("\n");
    default: return undefined;
  }
}

function dataviewCurrentFileLink(sourcePath: string | undefined): string {
  return sourcePath ? `link(${JSON.stringify(sourcePath)})` : "this.file.link";
}

function renderGuide(settings: ParaZkSettings): string {
  const t = localePack(settings.locale);
  const tags = t.tags;
  const lines = [
    "# PARA-ZK Vault Guide",
    "",
    t.labels.guideIntro,
    "",
    `## ${t.labels.folderLayout}`,
    `- ${settings.paths.projectsFolder}: ${t.labels.folderProjects}`,
    `- ${settings.paths.areasFolder}: ${t.labels.folderAreas}`,
    `- ${settings.paths.resourcesFolder}: ${t.labels.folderResources}`,
    `- ${settings.paths.retrosFolder}: ${t.labels.folderRetros}`,
    `- ${settings.paths.archivesFolder}: ${t.labels.folderArchives}`,
    `- ${settings.paths.sparkFolder}: ${t.labels.folderSpark}`,
    `- ${settings.paths.digestFolder}: ${t.labels.folderDigest}`,
    `- ${settings.paths.permanentFolder}: ${t.labels.folderPermanent}`,
    `- ${settings.paths.journalFolder}: ${t.labels.folderJournal}`,
    `- ${settings.paths.dashboardFolder}: ${t.labels.folderDashboard}`,
    `- ${settings.paths.tasksFolder}: ${t.labels.tasks}`,
    `- ${settings.paths.managedTemplatesFolder}: ${t.labels.folderManagedTemplates}`,
    "",
    `## ${t.labels.tagNamespaces}`,
    `- ${tags.project}/...`,
    `- ${tags.area}/...`,
    `- ${tags.resource}/...`,
    `- ${tags.llmWiki}/...`,
    `- ${tags.journal}`,
    `- ${tags.retro}`,
    "",
    `## ${t.labels.rules}`,
    `- ${t.labels.ruleWorkflow}`,
    `- ${t.labels.ruleFrontmatter}`,
    `- ${t.labels.ruleVisibleLocale}`
  ];

  return [
    frontmatter([
      "type: guide"
    ]),
    ...lines,
    ""
  ].join("\n");
}

function renderDashboard(
  kind: "home" | "projects" | "areas" | "resources" | "zk" | "tasks" | "review",
  settings: ParaZkSettings
): string {
  const t = localePack(settings.locale);
  const titleByKind = {
    home: t.labels.dashboardHome,
    projects: t.labels.dashboardProjects,
    areas: t.labels.dashboardAreas,
    resources: t.labels.dashboardResources,
    zk: t.labels.dashboardZk,
    tasks: t.labels.dashboardTasks,
    review: t.labels.dashboardReview
  };

  return [
    frontmatter([
      "type: dashboard",
      `title: ${titleByKind[kind]}`
    ]),
    `# ${titleByKind[kind]}`,
    "",
    ...renderDashboardBody(kind, t, settings),
    ""
  ].join("\n");
}

function renderDashboardBody(
  kind: "home" | "projects" | "areas" | "resources" | "zk" | "tasks" | "review",
  t: ReturnType<typeof localePack>,
  settings: ParaZkSettings
): string[] {
  switch (kind) {
    case "home":
      return [
        ...fenced("para-zk-dashboard-actions", []),
        "",
        `## ${t.labels.summary}`,
        ...dashboardSummaryBlock("home"),
        "",
        "---",
        `## ${t.labels.dueSoon7}`,
        ...dashboardDueProjects(t, settings, 15),
        "",
        "---",
        `## ${t.labels.todayTasks}`,
        ...paraZkTasksBlock("all", ["checkbox: open", "due: today", "limit: 10"]),
        "",
        "---",
        `## ${t.labels.upcoming7}`,
        ...paraZkTasksBlock("all", ["checkbox: open", "due: upcoming7", "limit: 10"]),
        "",
        "---",
        `## ${t.labels.recentUpdates}`,
        ...dashboardRecentCoreNotes(t, settings, 10),
        "",
        "---",
        `## ${t.labels.independentResources}`,
        ...dashboardOrphanResources(t, settings, 10),
        "",
        "---",
        `## ${t.labels.staleSpark}`,
        ...dashboardStaleSpark(t, settings, 10),
        "",
        `## ${t.labels.draftCandidates}`,
        ...dashboardDraftPermanent(t, settings, 10)
      ];
    case "projects":
      return [
        `## ${t.labels.summary}`,
        ...dashboardSummaryBlock("projects"),
        "",
        "---",
        `## ${t.labels.dueSoon7}`,
        ...dashboardDueProjects(t, settings, 50),
        "",
        "---",
        `## ${t.labels.dueSoon30}`,
        ...dashboardDueProjects30(t, settings),
        "",
        "---",
        `## ${t.labels.recentUpdates}`,
        ...dashboardRecentProjects(t, settings),
        "",
        "---",
        `## ${t.labels.area}`,
        ...dashboardAreaProjectCounts(t, settings)
      ];
    case "areas":
      return [
        `## ${t.labels.summary}`,
        ...dashboardSummaryBlock("areas"),
        "",
        "---",
        `## ${t.labels.dashboardProjects}`,
        ...dashboardAreaProjectCounts(t, settings),
        "",
        "---",
        `## ${t.labels.recentUpdates}`,
        ...dashboardAreaRecentProject(t, settings)
      ];
    case "resources":
      return [
        `## ${t.labels.summary}`,
        ...dashboardSummaryBlock("resources"),
        "",
        "---",
        `## ${t.labels.active}`,
        ...dashboardResourcesInUse(t, settings),
        "",
        "---",
        `## ${t.labels.unreferenced}`,
        ...dashboardResourcesFree(t, settings),
        "",
        "---",
        `## ${t.labels.independentResources}`,
        ...dashboardOrphanResources(t, settings, 50),
        "",
        "---",
        `## ${t.labels.dashboardZk}`,
        ...dashboardResourcesZkReferenced(t, settings)
      ];
    case "zk":
      return [
        `## ${t.labels.summary}`,
        ...dashboardSummaryBlock("zk"),
        "",
        "---",
        `## ${t.labels.staleSpark}`,
        ...dashboardStaleSpark(t, settings, 50),
        "",
        "---",
        `## ${t.labels.draftCandidates}`,
        ...dashboardDraftPermanent(t, settings, 50),
        "",
        "---",
        `## ${t.labels.recentlyCreated}`,
        ...dashboardRecentDigest(t, settings)
      ];
    case "tasks":
      return [
        `## ${t.labels.today}`,
        ...paraZkTasksBlock("all", ["checkbox: open", "due: today"]),
        "",
        "---",
        `## ${t.labels.upcoming7}`,
        ...paraZkTasksBlock("all", ["checkbox: open", "due: upcoming7"]),
        "",
        "---",
        `## ${t.labels.upcoming30}`,
        ...paraZkTasksBlock("all", ["checkbox: open", "due: upcoming30"]),
        "",
        "---",
        `## ${t.labels.completedRecent}`,
        ...paraZkTasksBlock("all", ["checkbox: done", "limit: 50"])
      ];
    case "review":
      return [
        `## ${t.labels.summary}`,
        ...dashboardSummaryBlock("review"),
        "",
        "---",
        `## ${t.labels.createdThisWeek}: ${t.labels.references}`,
        ...dashboardThisWeekResources(t, settings),
        "",
        "---",
        `## ${t.labels.createdThisWeek}: Spark`,
        ...dashboardThisWeekSpark(t, settings),
        "",
        "---",
        `## ${t.labels.draftCandidates}`,
        ...dashboardDraftPermanent(t, settings, 50),
        "",
        "---",
        `## ${t.labels.independentResources}`,
        ...dashboardOrphanResources(t, settings, 50)
      ];
  }
}

function jsString(value: string): string {
  return JSON.stringify(value);
}

function normalizedFolder(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function folderPrefix(path: string): string {
  const normalized = normalizedFolder(path);
  return normalized ? `${normalized}/` : "";
}

function dataviewSource(path: string): string {
  return jsString(normalizedFolder(path));
}

function dataviewSources(paths: string[]): string {
  return minimalFolders(paths).map(dataviewSource).join(" OR ");
}

function dataviewJsSource(path: string): string {
  return jsString(dataviewSource(path));
}

function dataviewNotArchived(settings: ParaZkSettings): string {
  const archivePrefix = folderPrefix(settings.paths.archivesFolder);
  return archivePrefix ? `!startswith(file.path, ${jsString(archivePrefix)})` : "true";
}

function dataviewJsNotArchived(settings: ParaZkSettings, pageName = "p"): string {
  const archivePrefix = folderPrefix(settings.paths.archivesFolder);
  return archivePrefix ? `!${pageName}.file.path.startsWith(${jsString(archivePrefix)})` : "true";
}

function minimalFolders(paths: string[]): string[] {
  const result: string[] = [];
  for (const folder of paths.map(normalizedFolder).filter(Boolean)) {
    if (result.includes(folder)) continue;
    if (result.some((parent) => folder.startsWith(`${parent}/`))) continue;
    for (let index = result.length - 1; index >= 0; index -= 1) {
      if (result[index].startsWith(`${folder}/`)) result.splice(index, 1);
    }
    result.push(folder);
  }
  return result;
}

function zkSourceFolders(settings: ParaZkSettings): string[] {
  return minimalFolders([
    settings.paths.zkFolder,
    settings.paths.sparkFolder,
    settings.paths.digestFolder,
    settings.paths.permanentFolder
  ]);
}

function pathStartsWithAnyExpression(pathExpression: string, folders: string[]): string {
  const prefixes = minimalFolders(folders).map(folderPrefix).filter(Boolean);
  if (prefixes.length === 0) return "false";
  return prefixes.map((prefix) => `${pathExpression}.startsWith(${jsString(prefix)})`).join(" || ");
}

function dataviewJs(lines: string[]): string[] {
  return fenced("dataviewjs", [
    "const pages = (source) => dv.pages(source).array();",
    "const asArray = (value) => value == null ? [] : Array.isArray(value) ? value : (typeof value.array === 'function' ? value.array() : [value]);",
    "const sameLink = (value, page) => value?.path === page.file.path || String(value) === String(page.file.link) || String(value) === page.file.path;",
    "const timeOf = (value) => value?.toMillis ? value.toMillis() : new Date(value).getTime();",
    "const dayOf = (value) => { const d = new Date(timeOf(value)); d.setHours(0,0,0,0); return d.getTime(); };",
    ...lines
  ]);
}

function dashboardSummaryBlock(type: "home" | "projects" | "areas" | "resources" | "zk" | "review"): string[] {
  return fenced("para-zk-dashboard-summary", [`type: ${type}`]);
}

function dashboardDueProjects(t: ReturnType<typeof localePack>, settings: ParaZkSettings, limit: number): string[] {
  return fenced("dataview", [
    `TABLE WITHOUT ID file.link AS "${t.labels.project}", priority AS "${t.labels.priority}", due_date AS "${t.labels.dueDate}"`,
    `FROM ${dataviewSource(settings.paths.projectsFolder)}`,
    `WHERE type = "project" AND ${dataviewNotArchived(settings)} AND due_date AND date(due_date) <= date(today) + dur(7 days)`,
    "SORT due_date ASC",
    `LIMIT ${limit}`
  ]);
}

function dashboardDueProjects30(t: ReturnType<typeof localePack>, settings: ParaZkSettings): string[] {
  return dataviewJs([
    "const days = (n) => 1000 * 60 * 60 * 24 * n;",
    "const today = new Date(); today.setHours(0,0,0,0);",
    `const projects = pages(${dataviewJsSource(settings.paths.projectsFolder)}).filter(p => p.type === 'project' && ${dataviewJsNotArchived(settings)} && p.due_date);`,
    "const rows = projects.filter(p => { const diff = dayOf(p.due_date) - today.getTime(); return diff > days(7) && diff <= days(30); })",
    "  .sort((a,b) => dayOf(a.due_date) - dayOf(b.due_date))",
    "  .map(p => [p.file.link, p.priority ?? '', p.due_date]);",
    `dv.table([${jsString(t.labels.project)}, ${jsString(t.labels.priority)}, ${jsString(t.labels.dueDate)}], rows);`
  ]);
}

function dashboardRecentCoreNotes(t: ReturnType<typeof localePack>, settings: ParaZkSettings, limit: number): string[] {
  const coreTypeClause = ["project", "area", "resource", ...ZK_KIND_CODES]
    .map((type) => `type = "${type}"`)
    .join(" OR ");
  return fenced("dataview", [
    `TABLE WITHOUT ID file.link AS "${t.labels.references}", type AS "${t.labels.kind}", file.mtime AS "${t.labels.updated}"`,
    `FROM ${dataviewSources([
      settings.paths.projectsFolder,
      settings.paths.areasFolder,
      settings.paths.resourcesFolder,
      ...zkSourceFolders(settings)
    ])}`,
    `WHERE (${coreTypeClause}) AND ${dataviewNotArchived(settings)}`,
    "SORT file.mtime DESC",
    `LIMIT ${limit}`
  ]);
}

function dashboardRecentProjects(t: ReturnType<typeof localePack>, settings: ParaZkSettings): string[] {
  return fenced("dataview", [
    `TABLE WITHOUT ID file.link AS "${t.labels.project}", file.mtime AS "${t.labels.updated}", due_date AS "${t.labels.dueDate}", priority AS "${t.labels.priority}"`,
    `FROM ${dataviewSource(settings.paths.projectsFolder)}`,
    `WHERE type = "project" AND ${dataviewNotArchived(settings)}`,
    "SORT file.mtime DESC",
    "LIMIT 10"
  ]);
}

function dashboardAreaProjectCounts(t: ReturnType<typeof localePack>, settings: ParaZkSettings): string[] {
  return dataviewJs([
    `const areas = pages(${dataviewJsSource(settings.paths.areasFolder)}).filter(p => p.type === 'area');`,
    `const projects = pages(${dataviewJsSource(settings.paths.projectsFolder)}).filter(p => p.type === 'project' && ${dataviewJsNotArchived(settings)});`,
    "const rows = areas.map(a => {",
    "  const count = projects.filter(p => asArray(p.areas).some(x => sameLink(x, a))).length;",
    "  return [a.file.link, count];",
    "}).sort((a,b) => b[1] - a[1]);",
    `dv.table([${jsString(t.labels.area)}, ${jsString(t.labels.dashboardProjects)}], rows);`
  ]);
}

function dashboardAreaRecentProject(t: ReturnType<typeof localePack>, settings: ParaZkSettings): string[] {
  return dataviewJs([
    `const areas = pages(${dataviewJsSource(settings.paths.areasFolder)}).filter(p => p.type === 'area');`,
    `const projects = pages(${dataviewJsSource(settings.paths.projectsFolder)}).filter(p => p.type === 'project' && ${dataviewJsNotArchived(settings)}).sort((a,b) => timeOf(b.file.mtime) - timeOf(a.file.mtime));`,
    "const rows = [];",
    "for (const area of areas) {",
    "  const matches = projects.filter(p => asArray(p.areas).some(x => sameLink(x, area)));",
    "  if (matches.length) rows.push([area.file.link, matches[0].file.link, matches[0].file.mtime]);",
    "}",
    "rows.sort((a,b) => timeOf(b[2]) - timeOf(a[2]));",
    `dv.table([${jsString(t.labels.area)}, ${jsString(t.labels.project)}, ${jsString(t.labels.updated)}], rows);`
  ]);
}

function dashboardResourcesInUse(t: ReturnType<typeof localePack>, settings: ParaZkSettings): string[] {
  return resourceBacklinkTable(
    t,
    settings,
    `asArray(r.file.inlinks).some(l => ${pathStartsWithAnyExpression("l.path", [
      settings.paths.projectsFolder,
      settings.paths.areasFolder
    ])})`
  );
}

function dashboardResourcesFree(t: ReturnType<typeof localePack>, settings: ParaZkSettings): string[] {
  return resourceBacklinkTable(
    t,
    settings,
    `!asArray(r.file.inlinks).some(l => ${pathStartsWithAnyExpression("l.path", [
      settings.paths.projectsFolder,
      settings.paths.areasFolder
    ])})`
  );
}

function dashboardResourcesZkReferenced(t: ReturnType<typeof localePack>, settings: ParaZkSettings): string[] {
  return resourceBacklinkTable(
    t,
    settings,
    `asArray(r.file.inlinks).some(l => ${pathStartsWithAnyExpression("l.path", zkSourceFolders(settings))})`
  );
}

function dashboardOrphanResources(t: ReturnType<typeof localePack>, settings: ParaZkSettings, limit: number): string[] {
  return dataviewJs([
    `const rows = pages(${dataviewJsSource(settings.paths.resourcesFolder)})`,
    "  .filter(r => asArray(r.file.inlinks).length === 0)",
    "  .sort((a,b) => timeOf(b.file.ctime) - timeOf(a.file.ctime))",
    `  .slice(0, ${limit})`,
    "  .map(r => [r.file.link, r.file.ctime]);",
    `dv.table([${jsString(t.labels.references)}, ${jsString(t.labels.created)}], rows);`
  ]);
}

function resourceBacklinkTable(
  t: ReturnType<typeof localePack>,
  settings: ParaZkSettings,
  filterExpression: string
): string[] {
  return dataviewJs([
    `const rows = pages(${dataviewJsSource(settings.paths.resourcesFolder)})`,
    `  .filter(r => ${filterExpression})`,
    "  .sort((a,b) => timeOf(b.file.mtime) - timeOf(a.file.mtime))",
    "  .map(r => [r.file.link, asArray(r.file.inlinks).length, r.file.mtime, r.file.ctime]);",
    `dv.table([${jsString(t.labels.references)}, ${jsString(t.labels.backlinks)}, ${jsString(t.labels.updated)}, ${jsString(t.labels.created)}], rows);`
  ]);
}

function dashboardStaleSpark(t: ReturnType<typeof localePack>, settings: ParaZkSettings, limit: number): string[] {
  return dataviewJs([
    "const days = (n) => 1000 * 60 * 60 * 24 * n;",
    "const now = Date.now();",
    `const rows = pages(${dataviewJsSource(settings.paths.sparkFolder)})`,
    "  .filter(f => f.processed !== true)",
    "  .filter(f => now - timeOf(f.file.ctime) >= days(7))",
    "  .sort((a,b) => timeOf(a.file.ctime) - timeOf(b.file.ctime))",
    `  .slice(0, ${limit})`,
    "  .map(f => [f.file.link, f.file.ctime]);",
    `dv.table(['Spark', ${jsString(t.labels.created)}], rows);`
  ]);
}

function dashboardDraftPermanent(t: ReturnType<typeof localePack>, settings: ParaZkSettings, limit: number): string[] {
  return dataviewJs([
    "const days = (n) => 1000 * 60 * 60 * 24 * n;",
    "const now = Date.now();",
    `const rows = pages(${dataviewJsSource(settings.paths.permanentFolder)})`,
    "  .filter(p => p.maturity === 'draft' && now - timeOf(p.file.mtime) >= days(14))",
    "  .sort((a,b) => timeOf(a.file.mtime) - timeOf(b.file.mtime))",
    `  .slice(0, ${limit})`,
    "  .map(p => [p.file.link, p.file.mtime]);",
    `dv.table(['Permanent', ${jsString(t.labels.updated)}], rows);`
  ]);
}

function dashboardRecentDigest(t: ReturnType<typeof localePack>, settings: ParaZkSettings): string[] {
  return fenced("dataview", [
    `TABLE WITHOUT ID file.link AS "Digest", file.ctime AS "${t.labels.created}", file.mtime AS "${t.labels.updated}"`,
    `FROM ${dataviewSource(settings.paths.digestFolder)}`,
    "SORT file.ctime DESC",
    "LIMIT 10"
  ]);
}

function dashboardThisWeekResources(t: ReturnType<typeof localePack>, settings: ParaZkSettings): string[] {
  return dataviewJs([
    "const startOfWeek = (() => { const d = new Date(); const day = (d.getDay() + 6) % 7; d.setHours(0,0,0,0); d.setDate(d.getDate() - day); return d; })();",
    `const rows = pages(${dataviewJsSource(settings.paths.resourcesFolder)})`,
    "  .filter(p => timeOf(p.file.ctime) >= startOfWeek.getTime())",
    "  .sort((a,b) => timeOf(b.file.ctime) - timeOf(a.file.ctime))",
    "  .map(p => [p.file.link, p.file.ctime]);",
    `dv.table([${jsString(t.labels.references)}, ${jsString(t.labels.created)}], rows);`
  ]);
}

function dashboardThisWeekSpark(t: ReturnType<typeof localePack>, settings: ParaZkSettings): string[] {
  return dataviewJs([
    "const startOfWeek = (() => { const d = new Date(); const day = (d.getDay() + 6) % 7; d.setHours(0,0,0,0); d.setDate(d.getDate() - day); return d; })();",
    `const rows = pages(${dataviewJsSource(settings.paths.sparkFolder)})`,
    "  .filter(p => p.processed !== true)",
    "  .filter(p => timeOf(p.file.ctime) >= startOfWeek.getTime())",
    "  .sort((a,b) => timeOf(b.file.ctime) - timeOf(a.file.ctime))",
    "  .map(p => [p.file.link, p.file.ctime]);",
    `dv.table(['Spark', ${jsString(t.labels.created)}], rows);`
  ]);
}
