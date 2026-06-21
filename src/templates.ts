import type { TFile } from "obsidian";
import type { ParaZkSettings } from "./types";
import { localePack } from "./i18n";
import { PARA_ZK_PATHS } from "./layout";
import type { PropsViewType } from "./props/schema";
import { escapeRegExp } from "./text";
import { ensureFolder } from "./vault/files";
import type { WorkflowHost } from "./vault/host";
import { joinVaultPath, parentFolder } from "./vault/paths";
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
export type TemplateVariables = Record<string, string | undefined>;
type TemplateContext = {
  host: Pick<WorkflowHost, "create" | "createFolder" | "getAbstractFile" | "getFile" | "read">;
  settings: ParaZkSettings;
};
type TemplateLocalePack = ReturnType<typeof localePack>;
type TemplateRenderContext = {
  t: TemplateLocalePack;
  tags: TemplateLocalePack["tags"];
  slugPlaceholder: string;
};
type TemplateRenderer = (context: TemplateRenderContext) => string;

const TEMPLATE_RENDERERS: Record<TemplateName, TemplateRenderer> = {
  project: renderProjectTemplate,
  area: renderAreaTemplate,
  resource: renderResourceTemplate,
  "llm-wiki": renderLlmWikiTemplate,
  journal: renderJournalTemplate,
  retro: renderRetroTemplate,
  subnote: renderSubnoteTemplate,
  spark: renderSparkTemplate,
  digest: renderDigestTemplate,
  permanent: renderPermanentTemplate
};

export function managedArtifacts(settings: ParaZkSettings): ManagedArtifact[] {
  const t = localePack(settings.locale);
  const templates = TEMPLATE_NAMES.map((name) => ({
    path: `${PARA_ZK_PATHS.managedTemplatesFolder}/template_${name}.md`,
    content: renderTemplate(name, settings)
  }));

  return [
    ...templates,
    {
      path: "README.md",
      content: renderGuide(settings)
    },
    {
      path: `${PARA_ZK_PATHS.dashboardFolder}/HomePage.md`,
      content: renderDashboard("home", settings)
    },
    {
      path: `${PARA_ZK_PATHS.dashboardFolder}/Projects.md`,
      content: renderDashboard("projects", settings)
    },
    {
      path: `${PARA_ZK_PATHS.dashboardFolder}/Areas.md`,
      content: renderDashboard("areas", settings)
    },
    {
      path: `${PARA_ZK_PATHS.dashboardFolder}/Resources.md`,
      content: renderDashboard("resources", settings)
    },
    {
      path: `${PARA_ZK_PATHS.dashboardFolder}/ZK.md`,
      content: renderDashboard("zk", settings)
    },
    {
      path: `${PARA_ZK_PATHS.dashboardFolder}/Tasks.md`,
      content: renderDashboard("tasks", settings)
    },
    {
      path: `${PARA_ZK_PATHS.dashboardFolder}/Review.md`,
      content: renderDashboard("review", settings)
    },
    {
      path: `${PARA_ZK_PATHS.managedTemplatesFolder}/README.md`,
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
  return TEMPLATE_RENDERERS[name]({
    t,
    tags: t.tags,
    slugPlaceholder: "{{slug}}"
  });
}

export async function readTemplate(ctx: TemplateContext, templateName: TemplateName): Promise<string> {
  const templatePath = joinVaultPath(PARA_ZK_PATHS.managedTemplatesFolder, `template_${templateName}.md`);
  const templateFile = ctx.host.getFile(templatePath);
  if (templateFile) return ctx.host.read(templateFile);
  return renderTemplate(templateName, ctx.settings);
}

export function applyTemplateVariables(content: string, variables: TemplateVariables): string {
  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    if (key === "created") continue;
    result = result.replace(placeholderPattern(escapeRegExp(key)), () => value ?? "");
  }
  // Drop any unresolved placeholder so it never lands in a saved note.
  return normalizeTemplateOutput(collapseExcessBlankLines(result.replace(placeholderPattern("[A-Za-z0-9_]+"), "")));
}

export async function createMarkdownFile(
  ctx: TemplateContext,
  templateName: TemplateName,
  path: string,
  variables: TemplateVariables
): Promise<TFile> {
  await ensureFolder(ctx.host, parentFolder(path));
  const template = await readTemplate(ctx, templateName);
  const content = applyTemplateVariables(template, variables);
  return ctx.host.create(path, content);
}

// Matches a `{{ inner }}` placeholder, optionally wrapped in the double quotes the templates use
// to keep frontmatter valid YAML. The quotes are part of the match, so substitution consumes them
// and the rendered value stays unquoted (or carries the value's own quotes); bare body and
// mid-scalar placeholders match the unquoted alternative.
function placeholderPattern(inner: string): RegExp {
  const token = `\\{\\{\\s*${inner}\\s*\\}\\}`;
  return new RegExp(`"${token}"|${token}`, "g");
}

function collapseExcessBlankLines(content: string): string {
  return content.replace(/\n[ \t]*\n[ \t]*\n+/g, "\n\n");
}

function normalizeTemplateOutput(content: string): string {
  return content.replace(/\n+$/, "\n");
}

function renderProjectTemplate({ t, tags, slugPlaceholder }: TemplateRenderContext): string {
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
      "status: \"{{status}}\"",
      "start_date:",
      "priority: \"{{priority}}\"",
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
}

function renderAreaTemplate({ t, tags, slugPlaceholder }: TemplateRenderContext): string {
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
}

function renderResourceTemplate({ tags }: TemplateRenderContext): string {
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
}

function renderLlmWikiTemplate({ tags }: TemplateRenderContext): string {
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
}

function renderJournalTemplate({ t, tags }: TemplateRenderContext): string {
  return [
    frontmatter([
      "type: journal",
      "tags:",
      `  - ${tags.journal}`,
      "created:",
      "updated:",
      "date: \"{{date}}\"",
      "energy: \"{{energy}}\""
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
}

function renderRetroTemplate({ t, tags }: TemplateRenderContext): string {
  return [
    frontmatter([
      "type: retro",
      "tags:",
      `  - ${tags.retro}`,
      "created:",
      "updated:",
      "project: \"{{project_frontmatter}}\"",
      "date: \"{{date}}\"",
      "week_iso: \"{{week_iso}}\"",
      "week_start: \"{{week_start}}\"",
      "week_end: \"{{week_end}}\"",
      "areas: \"{{areas_frontmatter}}\""
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
}

function renderSubnoteTemplate(): string {
  return [
    frontmatter([
      "type: subnote",
      "created:",
      "updated:",
      "subnote_type: \"{{subnote_type}}\"",
      "parent:"
    ]),
    paraZkPropsBlock("subnote"),
    "{{cursor}}",
    "",
    paraZkManagedBlock(),
    ""
  ].join("\n");
}

function renderSparkTemplate(): string {
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
}

function renderDigestTemplate(): string {
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
}

function renderPermanentTemplate(): string {
  return [
    frontmatter([
      "type: permanent",
      "tags:",
      "created:",
      "updated:",
      "maturity: \"{{maturity}}\"",
      "aliases:"
    ]),
    paraZkPropsBlock("permanent"),
    "{{cursor}}",
    "",
    paraZkManagedBlock(),
    ""
  ].join("\n");
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
  return fenced("para-zk-view", [
    `key: ${key}`,
    ...(title ? [`title: ${title}`] : [])
  ]).join("\n");
}

function paraZkActionBlock(actions: ReadonlyArray<{ command: string; icon: string; label: string }>): string[] {
  return fenced("para-zk-action", actions.map((a) => `${a.command}|${a.icon}|${a.label}`));
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

type TemplateLabelKey = keyof TemplateLocalePack["labels"];
type ManagedUiType = Exclude<TemplateName, "retro">;
type ManagedUiAction = { command: string; label: TemplateLabelKey; icon: string };
type ManagedUiBlockRecipeItem =
  | { kind: "tasks"; label: TemplateLabelKey }
  | { kind: "view"; key: DataviewViewKey; label: TemplateLabelKey }
  | { kind: "references"; label: TemplateLabelKey }
  | { kind: "action"; actions: readonly ManagedUiAction[] };

const MANAGED_UI_BLOCK_RECIPES: Record<ManagedUiType, readonly ManagedUiBlockRecipeItem[]> = {
  project: [
    { kind: "tasks", label: "tasks" },
    { kind: "action", actions: [{ command: "create-subnote", label: "createSubnote", icon: "file-plus" }] },
    { kind: "view", key: "project-subnotes", label: "subnotes" },
    { kind: "action", actions: [{ command: "create-retro", label: "createRetro", icon: "calendar-plus" }] },
    { kind: "view", key: "project-retros", label: "retros" },
    { kind: "view", key: "cited-by", label: "citedBy" },
    { kind: "references", label: "references" }
  ],
  area: [
    { kind: "view", key: "area-projects", label: "dashboardProjects" },
    { kind: "tasks", label: "tasks" },
    { kind: "action", actions: [{ command: "create-subarea", label: "createSubarea", icon: "folder-plus" }] },
    { kind: "view", key: "area-subareas", label: "subareas" },
    { kind: "action", actions: [{ command: "create-subnote", label: "createSubnote", icon: "file-plus" }] },
    { kind: "view", key: "area-subnotes", label: "subnotes" },
    { kind: "action", actions: [{ command: "create-retro", label: "createRetro", icon: "calendar-plus" }] },
    { kind: "view", key: "area-retros", label: "retros" },
    { kind: "view", key: "cited-by", label: "citedBy" },
    { kind: "references", label: "references" }
  ],
  subnote: [
    { kind: "view", key: "cited-by", label: "citedBy" },
    { kind: "references", label: "references" }
  ],
  resource: [
    { kind: "action", actions: [{ command: "create-from-resource", label: "createZkButton", icon: "arrow-up-right" }] },
    { kind: "view", key: "cited-by", label: "citedBy" },
    { kind: "references", label: "references" }
  ],
  "llm-wiki": [
    { kind: "view", key: "cited-by", label: "citedBy" },
    { kind: "references", label: "references" }
  ],
  journal: [
    { kind: "tasks", label: "tasks" },
    { kind: "view", key: "cited-by", label: "citedBy" },
    { kind: "references", label: "references" }
  ],
  spark: [
    {
      kind: "action",
      actions: [
        { command: "discard-spark", label: "discardButton", icon: "trash-2" },
        { command: "distill-spark", label: "distillButton", icon: "arrow-up-right" }
      ]
    },
    { kind: "view", key: "spark-distill", label: "createdFromThis" },
    { kind: "references", label: "references" }
  ],
  digest: [
    { kind: "action", actions: [{ command: "create-from-digest", label: "createPermanentButton", icon: "arrow-up-right" }] },
    { kind: "view", key: "cited-by", label: "citedBy" },
    { kind: "references", label: "references" }
  ],
  permanent: [
    { kind: "view", key: "cited-by", label: "citedBy" },
    { kind: "references", label: "references" }
  ]
};

export function managedUiBlockForType(type: string, settings: ParaZkSettings): string | undefined {
  const recipe = managedUiBlockRecipe(type);
  if (!recipe) return undefined;
  const t = localePack(settings.locale);
  return joinManagedUiBlocks(recipe.map((item) => renderManagedUiBlockRecipeItem(item, t)));
}

function managedUiBlockRecipe(type: string): readonly ManagedUiBlockRecipeItem[] | undefined {
  const normalized = type.trim().toLocaleLowerCase();
  return Object.prototype.hasOwnProperty.call(MANAGED_UI_BLOCK_RECIPES, normalized)
    ? MANAGED_UI_BLOCK_RECIPES[normalized as ManagedUiType]
    : undefined;
}

function renderManagedUiBlockRecipeItem(
  item: ManagedUiBlockRecipeItem,
  t: TemplateLocalePack
): string | string[] {
  switch (item.kind) {
    case "tasks":
      return paraZkTasksBlock("current", [], t.labels[item.label]);
    case "view":
      return paraZkViewBlock(item.key, t.labels[item.label]);
    case "references":
      return paraZkReferencesBlock("current", t.labels[item.label]);
    case "action":
      return paraZkActionBlock(item.actions.map((a) => ({ command: a.command, icon: a.icon, label: t.labels[a.label] })));
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

function dataviewProjectRetros(t: ReturnType<typeof localePack>, sourcePath?: string): string[] {
  return dataviewRetros(t, `project = ${dataviewCurrentFileLink(sourcePath)}`);
}

function dataviewRetros(t: ReturnType<typeof localePack>, whereClause: string): string[] {
  return fenced("dataview", [
    `TABLE WITHOUT ID link(file.path, replace(week_iso, "-", "_")) AS "${t.labels.retros}", file.mtime AS "${t.labels.updated}"`,
    `FROM ${dataviewSource(PARA_ZK_PATHS.retrosFolder)}`,
    `WHERE ${whereClause}`,
    "SORT date DESC",
    "LIMIT 10"
  ]);
}

function dataviewAreaProjects(t: ReturnType<typeof localePack>, sourcePath?: string): string[] {
  return fenced("dataview", [
    `TABLE WITHOUT ID file.link AS "${t.labels.project}", status AS "${t.labels.status}", priority AS "${t.labels.priority}"`,
    `FROM ${dataviewSource(PARA_ZK_PATHS.projectsFolder)}`,
    `WHERE contains(areas, ${dataviewCurrentFileLink(sourcePath)})`,
    "SORT due_date ASC, priority DESC"
  ]);
}

function dataviewChildAreas(t: ReturnType<typeof localePack>, sourcePath?: string): string[] {
  return fenced("dataview", [
    `TABLE WITHOUT ID file.link AS "${t.labels.area}", file.mtime AS "${t.labels.updated}"`,
    `FROM ${dataviewSource(PARA_ZK_PATHS.areasFolder)}`,
    `WHERE parent = ${dataviewCurrentFileLink(sourcePath)} AND type = "area"`,
    "SORT file.name ASC"
  ]);
}

function dataviewChildDocs(t: ReturnType<typeof localePack>, sourcePath?: string): string[] {
  return fenced("dataview", [
    `TABLE WITHOUT ID file.link AS "${t.labels.filename}", ${dataviewChildSubfolder(sourcePath)} AS "${t.labels.subfolder}", file.mtime AS "${t.labels.updated}"`,
    "FROM \"\"",
    `WHERE parent = ${dataviewCurrentFileLink(sourcePath)} AND type = "subnote"`,
    "SORT file.mtime DESC"
  ]);
}

// Each subnote's folder relative to the parent note's folder, so a subnote filed under
// a subdirectory shows where it lives while a flat subnote leaves the column blank. The
// view is regenerated with the live source path on every render (renamed parents included),
// so the baked parent folder never goes stale; path-less callers fall back to this.file.folder.
function dataviewChildSubfolder(sourcePath: string | undefined): string {
  if (sourcePath === undefined) {
    return `regexreplace(file.folder, "^" + this.file.folder + "(/|$)", "")`;
  }
  const pattern = `^${escapeRegExp(parentFolder(sourcePath))}(/|$)`;
  return `regexreplace(file.folder, ${JSON.stringify(pattern)}, "")`;
}

function dataviewAreaRetros(t: ReturnType<typeof localePack>, sourcePath?: string): string[] {
  return dataviewRetros(t, `contains(areas, ${dataviewCurrentFileLink(sourcePath)})`);
}

function dataviewCitedBy(t: ReturnType<typeof localePack>, sourcePath?: string): string[] {
  const ownSubtree = dataviewCitedByExcludeOwnSubtree(sourcePath);
  return fenced("dataview", [
    `TABLE WITHOUT ID ${dataviewCitedByName()} AS "${t.labels.filename}", ${dataviewNoteTypeLabel(t)} AS "${t.labels.noteType}", file.mtime AS "${t.labels.updated}"`,
    `FROM ""`,
    `WHERE contains(file.outlinks, ${dataviewCurrentFileLink(sourcePath)}) AND ${dataviewNotArchived()}${ownSubtree ? ` AND ${ownSubtree}` : ""}`,
    "SORT file.mtime DESC"
  ]);
}

// In cited-by, drop the folder note's OWN subtree: a project/area note's children link back to it
// (parent: [[…]]) and already appear in the subnotes view, so they would otherwise duplicate. The
// startswith prefix excludes every descendant at any depth; the trailing "/" keeps sibling folders
// that share a name prefix (Alpha vs AlphaBeta). Only when the current note IS a folder note (its
// file sits in a folder named after it) — flat notes keep every citation (a sibling resource/wiki
// page citing this one is a real cited-by). Computed from the baked source path so the literal is
// regex-free (paren-safe); a path-less render keeps every citation.
function dataviewCitedByExcludeOwnSubtree(sourcePath: string | undefined): string | undefined {
  if (sourcePath === undefined) return undefined;
  const folder = parentFolder(sourcePath);
  if (!folder) return undefined;
  const base = sourcePath.slice(sourcePath.lastIndexOf("/") + 1).replace(/\.md$/i, "");
  const enclosingName = folder.slice(folder.lastIndexOf("/") + 1);
  if (enclosingName !== base) return undefined;
  return `!startswith(file.path, ${jsString(`${folder}/`)})`;
}

function dataviewNoteTypeLabel(t: ReturnType<typeof localePack>): string {
  return `choice(type = "project", "${t.labels.project}", choice(type = "area", "${t.labels.area}", choice(type = "resource", "${t.labels.typeResource}", choice(type = "spark", "${t.labels.typeSpark}", choice(type = "digest", "${t.labels.typeDigest}", choice(type = "permanent", "${t.labels.typePermanent}", choice(type = "llm-wiki", "${t.labels.llmWiki}", type)))))))`;
}

function dataviewCitedByName(): string {
  const roots = [
    PARA_ZK_PATHS.projectsFolder, PARA_ZK_PATHS.areasFolder, PARA_ZK_PATHS.resourcesFolder,
    PARA_ZK_PATHS.sparkFolder, PARA_ZK_PATHS.digestFolder, PARA_ZK_PATHS.permanentFolder,
    PARA_ZK_PATHS.wikiFolder, PARA_ZK_PATHS.journalFolder, PARA_ZK_PATHS.retrosFolder
  ];
  const alt = roots.map((r) => escapeRegExp(`${r}/`)).join("|");
  const pattern = `^(${alt})|\\.md$`;
  return `link(file.path, regexreplace(file.path, ${JSON.stringify(pattern)}, ""))`;
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
  "cited-by",
  "spark-distill"
] as const;

export type DataviewViewKey = typeof DATAVIEW_VIEW_KEYS[number];
type DataviewViewRenderContext = {
  t: TemplateLocalePack;
  sourcePath?: string;
};
type DataviewViewRenderer = (context: DataviewViewRenderContext) => string[];

const DATAVIEW_VIEW_RENDERERS: Record<DataviewViewKey, DataviewViewRenderer> = {
  "project-subnotes": ({ t, sourcePath }) => dataviewChildDocs(t, sourcePath),
  "project-retros": ({ t, sourcePath }) => dataviewProjectRetros(t, sourcePath),
  "area-projects": ({ t, sourcePath }) => dataviewAreaProjects(t, sourcePath),
  "area-subareas": ({ t, sourcePath }) => dataviewChildAreas(t, sourcePath),
  "area-subnotes": ({ t, sourcePath }) => dataviewChildDocs(t, sourcePath),
  "area-retros": ({ t, sourcePath }) => dataviewAreaRetros(t, sourcePath),
  "cited-by": ({ t, sourcePath }) => dataviewCitedBy(t, sourcePath),
  "spark-distill": ({ t }) => dataviewDistilledInto(t)
};

/**
 * Returns the fenced Dataview block for a named view, so notes can embed a
 * compact `para-zk-view` token instead of the full query. The query (and its
 * localized column labels) stays in code; the renderer expands it at view time.
 */
export function dataviewViewBlock(key: string, settings: ParaZkSettings, sourcePath?: string): string | undefined {
  const renderer = dataviewViewRenderer(key);
  if (!renderer) return undefined;
  const t = localePack(settings.locale);
  return renderer({ t, sourcePath }).join("\n");
}

function dataviewViewRenderer(key: string): DataviewViewRenderer | undefined {
  return Object.prototype.hasOwnProperty.call(DATAVIEW_VIEW_RENDERERS, key)
    ? DATAVIEW_VIEW_RENDERERS[key as DataviewViewKey]
    : undefined;
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
    `- ${PARA_ZK_PATHS.projectsFolder}: ${t.labels.folderProjects}`,
    `- ${PARA_ZK_PATHS.areasFolder}: ${t.labels.folderAreas}`,
    `- ${PARA_ZK_PATHS.resourcesFolder}: ${t.labels.folderResources}`,
    `- ${PARA_ZK_PATHS.retrosFolder}: ${t.labels.folderRetros}`,
    `- ${PARA_ZK_PATHS.archivesFolder}: ${t.labels.folderArchives}`,
    `- ${PARA_ZK_PATHS.sparkFolder}: ${t.labels.folderSpark}`,
    `- ${PARA_ZK_PATHS.digestFolder}: ${t.labels.folderDigest}`,
    `- ${PARA_ZK_PATHS.permanentFolder}: ${t.labels.folderPermanent}`,
    `- ${PARA_ZK_PATHS.journalFolder}: ${t.labels.folderJournal}`,
    `- ${PARA_ZK_PATHS.dashboardFolder}: ${t.labels.folderDashboard}`,
    `- ${PARA_ZK_PATHS.tasksFolder}: ${t.labels.tasks}`,
    `- ${PARA_ZK_PATHS.managedTemplatesFolder}: ${t.labels.folderManagedTemplates}`,
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
    ...renderDashboardBody(kind, t),
    ""
  ].join("\n");
}

function renderDashboardBody(
  kind: "home" | "projects" | "areas" | "resources" | "zk" | "tasks" | "review",
  t: ReturnType<typeof localePack>
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
        ...dashboardDueProjects(t, 15),
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
        ...dashboardRecentCoreNotes(t, 10),
        "",
        "---",
        `## ${t.labels.independentResources}`,
        ...dashboardOrphanResources(t, 10),
        "",
        "---",
        `## ${t.labels.staleSpark}`,
        ...dashboardStaleSpark(t, 10),
        "",
        `## ${t.labels.draftCandidates}`,
        ...dashboardDraftPermanent(t, 10)
      ];
    case "projects":
      return [
        `## ${t.labels.summary}`,
        ...dashboardSummaryBlock("projects"),
        "",
        "---",
        `## ${t.labels.dueSoon7}`,
        ...dashboardDueProjects(t, 50),
        "",
        "---",
        `## ${t.labels.dueSoon30}`,
        ...dashboardDueProjects30(t),
        "",
        "---",
        `## ${t.labels.recentUpdates}`,
        ...dashboardRecentProjects(t),
        "",
        "---",
        `## ${t.labels.area}`,
        ...dashboardAreaProjectCounts(t)
      ];
    case "areas":
      return [
        `## ${t.labels.summary}`,
        ...dashboardSummaryBlock("areas"),
        "",
        "---",
        `## ${t.labels.dashboardProjects}`,
        ...dashboardAreaProjectCounts(t),
        "",
        "---",
        `## ${t.labels.recentUpdates}`,
        ...dashboardAreaRecentProject(t)
      ];
    case "resources":
      return [
        `## ${t.labels.summary}`,
        ...dashboardSummaryBlock("resources"),
        "",
        "---",
        `## ${t.labels.active}`,
        ...dashboardResourcesInUse(t),
        "",
        "---",
        `## ${t.labels.unreferenced}`,
        ...dashboardResourcesFree(t),
        "",
        "---",
        `## ${t.labels.independentResources}`,
        ...dashboardOrphanResources(t, 50),
        "",
        "---",
        `## ${t.labels.dashboardZk}`,
        ...dashboardResourcesZkReferenced(t)
      ];
    case "zk":
      return [
        `## ${t.labels.summary}`,
        ...dashboardSummaryBlock("zk"),
        "",
        "---",
        `## ${t.labels.staleSpark}`,
        ...dashboardStaleSpark(t, 50),
        "",
        "---",
        `## ${t.labels.draftCandidates}`,
        ...dashboardDraftPermanent(t, 50),
        "",
        "---",
        `## ${t.labels.recentlyCreated}`,
        ...dashboardRecentDigest(t)
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
        ...dashboardThisWeekResources(t),
        "",
        "---",
        `## ${t.labels.createdThisWeek}: Spark`,
        ...dashboardThisWeekSpark(t),
        "",
        "---",
        `## ${t.labels.draftCandidates}`,
        ...dashboardDraftPermanent(t, 50),
        "",
        "---",
        `## ${t.labels.independentResources}`,
        ...dashboardOrphanResources(t, 50)
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

function dataviewNotArchived(): string {
  const archivePrefix = folderPrefix(PARA_ZK_PATHS.archivesFolder);
  return archivePrefix ? `!startswith(file.path, ${jsString(archivePrefix)})` : "true";
}

function dataviewJsNotArchived(pageName = "p"): string {
  const archivePrefix = folderPrefix(PARA_ZK_PATHS.archivesFolder);
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

function zkSourceFolders(): string[] {
  return minimalFolders([
    PARA_ZK_PATHS.zkFolder,
    PARA_ZK_PATHS.sparkFolder,
    PARA_ZK_PATHS.digestFolder,
    PARA_ZK_PATHS.permanentFolder
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

function dashboardDueProjects(t: ReturnType<typeof localePack>, limit: number): string[] {
  return fenced("dataview", [
    `TABLE WITHOUT ID file.link AS "${t.labels.project}", priority AS "${t.labels.priority}", due_date AS "${t.labels.dueDate}"`,
    `FROM ${dataviewSource(PARA_ZK_PATHS.projectsFolder)}`,
    `WHERE type = "project" AND ${dataviewNotArchived()} AND due_date AND date(due_date) <= date(today) + dur(7 days)`,
    "SORT due_date ASC",
    `LIMIT ${limit}`
  ]);
}

function dashboardDueProjects30(t: ReturnType<typeof localePack>): string[] {
  return dataviewJs([
    "const days = (n) => 1000 * 60 * 60 * 24 * n;",
    "const today = new Date(); today.setHours(0,0,0,0);",
    `const projects = pages(${dataviewJsSource(PARA_ZK_PATHS.projectsFolder)}).filter(p => p.type === 'project' && ${dataviewJsNotArchived()} && p.due_date);`,
    "const rows = projects.filter(p => { const diff = dayOf(p.due_date) - today.getTime(); return diff > days(7) && diff <= days(30); })",
    "  .sort((a,b) => dayOf(a.due_date) - dayOf(b.due_date))",
    "  .map(p => [p.file.link, p.priority ?? '', p.due_date]);",
    `dv.table([${jsString(t.labels.project)}, ${jsString(t.labels.priority)}, ${jsString(t.labels.dueDate)}], rows);`
  ]);
}

function dashboardRecentCoreNotes(t: ReturnType<typeof localePack>, limit: number): string[] {
  const coreTypeClause = ["project", "area", "resource", ...ZK_KIND_CODES]
    .map((type) => `type = "${type}"`)
    .join(" OR ");
  return fenced("dataview", [
    `TABLE WITHOUT ID file.link AS "${t.labels.references}", ${dataviewNoteTypeLabel(t)} AS "${t.labels.noteType}", file.mtime AS "${t.labels.updated}"`,
    `FROM ${dataviewSources([
      PARA_ZK_PATHS.projectsFolder,
      PARA_ZK_PATHS.areasFolder,
      PARA_ZK_PATHS.resourcesFolder,
      ...zkSourceFolders()
    ])}`,
    `WHERE (${coreTypeClause}) AND ${dataviewNotArchived()}`,
    "SORT file.mtime DESC",
    `LIMIT ${limit}`
  ]);
}

function dashboardRecentProjects(t: ReturnType<typeof localePack>): string[] {
  return fenced("dataview", [
    `TABLE WITHOUT ID file.link AS "${t.labels.project}", file.mtime AS "${t.labels.updated}", due_date AS "${t.labels.dueDate}", priority AS "${t.labels.priority}"`,
    `FROM ${dataviewSource(PARA_ZK_PATHS.projectsFolder)}`,
    `WHERE type = "project" AND ${dataviewNotArchived()}`,
    "SORT file.mtime DESC",
    "LIMIT 10"
  ]);
}

function dashboardAreaProjectCounts(t: ReturnType<typeof localePack>): string[] {
  return dataviewJs([
    `const areas = pages(${dataviewJsSource(PARA_ZK_PATHS.areasFolder)}).filter(p => p.type === 'area');`,
    `const projects = pages(${dataviewJsSource(PARA_ZK_PATHS.projectsFolder)}).filter(p => p.type === 'project' && ${dataviewJsNotArchived()});`,
    "const rows = areas.map(a => {",
    "  const count = projects.filter(p => asArray(p.areas).some(x => sameLink(x, a))).length;",
    "  return [a.file.link, count];",
    "}).sort((a,b) => b[1] - a[1]);",
    `dv.table([${jsString(t.labels.area)}, ${jsString(t.labels.dashboardProjects)}], rows);`
  ]);
}

function dashboardAreaRecentProject(t: ReturnType<typeof localePack>): string[] {
  return dataviewJs([
    `const areas = pages(${dataviewJsSource(PARA_ZK_PATHS.areasFolder)}).filter(p => p.type === 'area');`,
    `const projects = pages(${dataviewJsSource(PARA_ZK_PATHS.projectsFolder)}).filter(p => p.type === 'project' && ${dataviewJsNotArchived()}).sort((a,b) => timeOf(b.file.mtime) - timeOf(a.file.mtime));`,
    "const rows = [];",
    "for (const area of areas) {",
    "  const matches = projects.filter(p => asArray(p.areas).some(x => sameLink(x, area)));",
    "  if (matches.length) rows.push([area.file.link, matches[0].file.link, matches[0].file.mtime]);",
    "}",
    "rows.sort((a,b) => timeOf(b[2]) - timeOf(a[2]));",
    `dv.table([${jsString(t.labels.area)}, ${jsString(t.labels.project)}, ${jsString(t.labels.updated)}], rows);`
  ]);
}

function dashboardResourcesInUse(t: ReturnType<typeof localePack>): string[] {
  return resourceBacklinkTable(
    t,
    `asArray(r.file.inlinks).some(l => ${pathStartsWithAnyExpression("l.path", [
      PARA_ZK_PATHS.projectsFolder,
      PARA_ZK_PATHS.areasFolder
    ])})`
  );
}

function dashboardResourcesFree(t: ReturnType<typeof localePack>): string[] {
  return resourceBacklinkTable(
    t,
    `!asArray(r.file.inlinks).some(l => ${pathStartsWithAnyExpression("l.path", [
      PARA_ZK_PATHS.projectsFolder,
      PARA_ZK_PATHS.areasFolder
    ])})`
  );
}

function dashboardResourcesZkReferenced(t: ReturnType<typeof localePack>): string[] {
  return resourceBacklinkTable(
    t,
    `asArray(r.file.inlinks).some(l => ${pathStartsWithAnyExpression("l.path", zkSourceFolders())})`
  );
}

function dashboardOrphanResources(t: ReturnType<typeof localePack>, limit: number): string[] {
  return dataviewJs([
    `const rows = pages(${dataviewJsSource(PARA_ZK_PATHS.resourcesFolder)})`,
    "  .filter(r => asArray(r.file.inlinks).length === 0)",
    "  .sort((a,b) => timeOf(b.file.ctime) - timeOf(a.file.ctime))",
    `  .slice(0, ${limit})`,
    "  .map(r => [r.file.link, r.file.ctime]);",
    `dv.table([${jsString(t.labels.references)}, ${jsString(t.labels.created)}], rows);`
  ]);
}

function resourceBacklinkTable(
  t: ReturnType<typeof localePack>,
  filterExpression: string
): string[] {
  return dataviewJs([
    `const rows = pages(${dataviewJsSource(PARA_ZK_PATHS.resourcesFolder)})`,
    `  .filter(r => ${filterExpression})`,
    "  .sort((a,b) => timeOf(b.file.mtime) - timeOf(a.file.mtime))",
    "  .map(r => [r.file.link, asArray(r.file.inlinks).length, r.file.mtime, r.file.ctime]);",
    `dv.table([${jsString(t.labels.references)}, ${jsString(t.labels.backlinks)}, ${jsString(t.labels.updated)}, ${jsString(t.labels.created)}], rows);`
  ]);
}

function dashboardStaleSpark(t: ReturnType<typeof localePack>, limit: number): string[] {
  return dataviewJs([
    "const days = (n) => 1000 * 60 * 60 * 24 * n;",
    "const now = Date.now();",
    `const rows = pages(${dataviewJsSource(PARA_ZK_PATHS.sparkFolder)})`,
    "  .filter(f => f.processed !== true)",
    "  .filter(f => now - timeOf(f.file.ctime) >= days(7))",
    "  .sort((a,b) => timeOf(a.file.ctime) - timeOf(b.file.ctime))",
    `  .slice(0, ${limit})`,
    "  .map(f => [f.file.link, f.file.ctime]);",
    `dv.table(['Spark', ${jsString(t.labels.created)}], rows);`
  ]);
}

function dashboardDraftPermanent(t: ReturnType<typeof localePack>, limit: number): string[] {
  return dataviewJs([
    "const days = (n) => 1000 * 60 * 60 * 24 * n;",
    "const now = Date.now();",
    `const rows = pages(${dataviewJsSource(PARA_ZK_PATHS.permanentFolder)})`,
    "  .filter(p => p.maturity === 'draft' && now - timeOf(p.file.mtime) >= days(14))",
    "  .sort((a,b) => timeOf(a.file.mtime) - timeOf(b.file.mtime))",
    `  .slice(0, ${limit})`,
    "  .map(p => [p.file.link, p.file.mtime]);",
    `dv.table(['Permanent', ${jsString(t.labels.updated)}], rows);`
  ]);
}

function dashboardRecentDigest(t: ReturnType<typeof localePack>): string[] {
  return fenced("dataview", [
    `TABLE WITHOUT ID file.link AS "Digest", file.ctime AS "${t.labels.created}", file.mtime AS "${t.labels.updated}"`,
    `FROM ${dataviewSource(PARA_ZK_PATHS.digestFolder)}`,
    "SORT file.ctime DESC",
    "LIMIT 10"
  ]);
}

function dashboardThisWeekResources(t: ReturnType<typeof localePack>): string[] {
  return dataviewJs([
    "const startOfWeek = (() => { const d = new Date(); const day = (d.getDay() + 6) % 7; d.setHours(0,0,0,0); d.setDate(d.getDate() - day); return d; })();",
    `const rows = pages(${dataviewJsSource(PARA_ZK_PATHS.resourcesFolder)})`,
    "  .filter(p => timeOf(p.file.ctime) >= startOfWeek.getTime())",
    "  .sort((a,b) => timeOf(b.file.ctime) - timeOf(a.file.ctime))",
    "  .map(p => [p.file.link, p.file.ctime]);",
    `dv.table([${jsString(t.labels.references)}, ${jsString(t.labels.created)}], rows);`
  ]);
}

function dashboardThisWeekSpark(t: ReturnType<typeof localePack>): string[] {
  return dataviewJs([
    "const startOfWeek = (() => { const d = new Date(); const day = (d.getDay() + 6) % 7; d.setHours(0,0,0,0); d.setDate(d.getDate() - day); return d; })();",
    `const rows = pages(${dataviewJsSource(PARA_ZK_PATHS.sparkFolder)})`,
    "  .filter(p => p.processed !== true)",
    "  .filter(p => timeOf(p.file.ctime) >= startOfWeek.getTime())",
    "  .sort((a,b) => timeOf(b.file.ctime) - timeOf(a.file.ctime))",
    "  .map(p => [p.file.link, p.file.ctime]);",
    `dv.table(['Spark', ${jsString(t.labels.created)}], rows);`
  ]);
}
