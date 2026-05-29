import type { Locale, ParaZkSettings } from "./types";
import { localePack } from "./i18n";

export type ManagedArtifact = {
  path: string;
  content: string;
};

export const TEMPLATE_NAMES = [
  "project",
  "area",
  "resource",
  "journal",
  "retro",
  "subnote",
  "zk_fleeting",
  "zk_literature",
  "zk_permanent"
] as const;

export type TemplateName = typeof TEMPLATE_NAMES[number];

export function managedArtifacts(settings: ParaZkSettings): ManagedArtifact[] {
  const t = localePack(settings.locale);
  const templates = TEMPLATE_NAMES.map((name) => ({
    path: `${settings.paths.managedTemplatesFolder}/template_${name}.md`,
    content: renderTemplate(name, settings.locale)
  }));

  return [
    ...templates,
    {
      path: "README.md",
      content: renderGuide(settings.locale)
    },
    {
      path: `${settings.paths.dashboardFolder}/HomePage.md`,
      content: renderDashboard("home", settings.locale)
    },
    {
      path: `${settings.paths.dashboardFolder}/Projects.md`,
      content: renderDashboard("projects", settings.locale)
    },
    {
      path: `${settings.paths.dashboardFolder}/Areas.md`,
      content: renderDashboard("areas", settings.locale)
    },
    {
      path: `${settings.paths.dashboardFolder}/Resources.md`,
      content: renderDashboard("resources", settings.locale)
    },
    {
      path: `${settings.paths.dashboardFolder}/ZK.md`,
      content: renderDashboard("zk", settings.locale)
    },
    {
      path: `${settings.paths.dashboardFolder}/Tasks.md`,
      content: renderDashboard("tasks", settings.locale)
    },
    {
      path: `${settings.paths.dashboardFolder}/Review.md`,
      content: renderDashboard("review", settings.locale)
    },
    {
      path: `${settings.paths.managedTemplatesFolder}/README.md`,
      content: [
        managedFrontmatter("template_index"),
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

export function renderTemplate(name: TemplateName, locale: Locale): string {
  const t = localePack(locale);
  const tags = t.tags;
  const nowPlaceholder = "{{created}}";
  const slugPlaceholder = "{{slug}}";

  switch (name) {
    case "project":
      return [
        managedFrontmatter("template_project", [
          "type: project",
          "areas:",
          "status: {{status}}",
          "priority: {{priority}}",
          "start_date:",
          "due_date:",
          "done_date:",
          "tags:",
          `  - ${tags.project}/${slugPlaceholder}`,
          `created: ${nowPlaceholder}`,
          "updated:"
        ]),
        propsTable([
          [t.labels.area, "{{areas}}", t.labels.dueDate, "{{due_date}}"],
          [t.labels.status, "{{status}}", t.labels.startDate, "{{start_date}}"],
          [t.labels.priority, "{{priority}}", t.labels.doneDate, "{{done_date}}"]
        ]),
        `# ${t.labels.summary}`,
        "",
        "{{cursor}}",
        "",
        `# ${t.labels.goals}`,
        "",
        `| ${t.labels.content} | ${t.labels.successCriteria} |`,
        "| --- | --- |",
        "| | |",
        "",
        "---",
        `# ${t.labels.tasks}`,
        "",
        "- [ ] ",
        "",
        "---",
        `# ${t.labels.subnotes} ${paraZkInlineAction("create-subnote", t.labels.createSubnote)}`,
        "",
        ...dataviewProjectChildDocs(),
        "",
        "---",
        `# ${t.labels.retros} ${paraZkInlineAction("create-retro", t.labels.createRetro)}`,
        "",
        ...dataviewProjectRetros(),
        "",
        "---",
        `## ${t.labels.references} ${paraZkInlineAction("create-resource", t.labels.createResource)}`,
        "",
        ""
      ].join("\n");
    case "area":
      return [
        managedFrontmatter("template_area", [
          "type: area",
          "tags:",
          `  - ${tags.area}/${slugPlaceholder}`,
          `created: ${nowPlaceholder}`,
          "updated:",
          "parent:"
        ]),
        `# ${t.labels.overview}`,
        "",
        "{{cursor}}",
        "",
        `# ${t.labels.dashboardProjects}`,
        "",
        ...dataviewAreaProjects(t),
        "",
        "---",
        `# ${t.labels.tasks}`,
        "",
        ...tasksArea(tags.area, slugPlaceholder, t.subnoteTypes[1]),
        "",
        "---",
        `# ${t.labels.subareas} ${paraZkInlineAction("create-subarea", t.labels.createSubarea)}`,
        "",
        ...dataviewChildAreas(t),
        "",
        "---",
        `# ${t.labels.subnotes} ${paraZkInlineAction("create-subnote", t.labels.createSubnote)}`,
        "",
        ...dataviewChildDocs(t),
        "",
        "---",
        `# ${t.labels.retros} ${paraZkInlineAction("create-retro", t.labels.createRetro)}`,
        "",
        ...dataviewAreaRetros(t),
        "",
        "---",
        `## ${t.labels.references} ${paraZkInlineAction("create-resource", t.labels.createResource)}`,
        "",
        ""
      ].join("\n");
    case "resource":
      return [
        managedFrontmatter("template_resource", [
          "type: resource",
          "tags:",
          `  - ${tags.resource}/${slugPlaceholder}`,
          `created: ${nowPlaceholder}`,
          "updated:"
        ]),
        propsTable([[t.labels.created, "{{created}}", t.labels.updated, "{{updated}}"]]),
        `# ${t.labels.overview}`,
        "",
        "{{cursor}}",
        "",
        "---",
        `# ${t.labels.body}`,
        "",
        "",
        "---",
        `## ${t.labels.promoteToZk} ${paraZkInlineAction("promote-resource", t.labels.promoteToZk)}`,
        "",
        ...dataviewResourceZkLinks(),
        "",
        "---",
        `## ${t.labels.references} ${paraZkInlineAction("create-resource", t.labels.createResource)}`,
        "",
        ""
      ].join("\n");
    case "journal":
      return [
        managedFrontmatter("template_journal", [
          "type: journal",
          "date: {{date}}",
          "energy: {{energy}}",
          "tags:",
          `  - ${tags.journal}`,
          `created: ${nowPlaceholder}`,
          "updated:"
        ]),
        propsTable([[t.labels.date, "{{date}}", t.labels.energy, "{{energy}}"]]),
        `# ${t.labels.focus}`,
        "- [ ] {{cursor}}",
        "",
        `# ${t.labels.quickMemo}`,
        "",
        "",
        `# ${t.labels.timeline}`,
        "- 09:00 ",
        "- 14:30 ",
        "",
        `# ${t.labels.todayTasks}`,
        "- [ ] ",
        "",
        "---",
        `# ${t.labels.shortReview}`,
        `- ${t.labels.whatWentWell}:`,
        `- ${t.labels.improvements}:`,
        "",
        "---",
        `## ${t.labels.links}`,
        ""
      ].join("\n");
    case "retro":
      return [
        managedFrontmatter("template_retro", [
          "type: retro",
          "project: {{project_frontmatter}}",
          "date: {{date}}",
          "week_iso: {{week_iso}}",
          "week_start: {{week_start}}",
          "week_end: {{week_end}}",
          "areas:{{areas_frontmatter}}",
          "tags:",
          `  - ${tags.retro}`,
          `created: ${nowPlaceholder}`,
          "updated:"
        ]),
        propsTable([
          [t.labels.project, "{{project}}", t.labels.period, "{{week_start}} ~ {{week_end}}"],
          [t.labels.area, "{{areas}}", t.labels.week, "{{week_iso}}"]
        ]),
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
        `# ${t.labels.nextActions}`,
        "- [ ] ",
        "",
        "---",
        `# ${t.labels.retroSummary}`,
        "> ###### ",
        "",
        "---",
        `### ${t.labels.links}`,
        "",
        `#### ${t.labels.output}`,
        "",
        `#### ${t.labels.references}`,
        "",
        `#### ${t.labels.other}`,
        ""
      ].join("\n");
    case "subnote":
      return [
        managedFrontmatter("template_subnote", [
          "type: doc",
          "subnote_type: {{subnote_type}}",
          "parent:",
          `created: ${nowPlaceholder}`,
          "updated:"
        ]),
        propsTable([
          [t.labels.created, "{{created}}", t.labels.updated, "{{updated}}"],
          [t.labels.kind, "{{subnote_type}}", "", ""]
        ]),
        "",
        "{{cursor}}",
        ""
      ].join("\n");
    case "zk_fleeting":
      return [
        managedFrontmatter("template_zk_fleeting", [
          "type: zk_fleeting",
          "tags:",
          `  - ${tags.knowledge}/${slugPlaceholder}`,
          `created: ${nowPlaceholder}`,
          "updated:",
          "processed: false"
        ]),
        propsTable([[t.labels.created, "{{created}}", t.labels.updated, "{{updated}}"]]),
        `# ${t.labels.thoughtSummary}`,
        "",
        "{{cursor}}",
        "",
        `# ${t.labels.memo}`,
        "",
        "- ",
        "",
        "---",
        `## ${t.labels.promote} ${paraZkInlineAction("promote-fleeting", t.labels.promote)}`,
        "",
        "---",
        `## ${t.labels.optionalNextActions}`,
        `- [ ] ${t.labels.refineFleetingAction}`,
        `- [ ] ${t.labels.connectReferencesAction}`,
        "",
        "---",
        `## ${t.labels.references}`,
        ""
      ].join("\n");
    case "zk_literature":
      return [
        managedFrontmatter("template_zk_literature", [
          "type: zk_literature",
          "tags:",
          `  - ${tags.knowledge}/${slugPlaceholder}`,
          "sourceTitle:",
          "authors:",
          "published:",
          "url:",
          `created: ${nowPlaceholder}`,
          "updated:"
        ]),
        propsTable([
          [t.labels.created, "{{created}}", t.labels.updated, "{{updated}}"],
          [t.labels.source, "{{sourceTitle}}", t.labels.authors, "{{authors}}"],
          [t.labels.published, "{{published}}", t.labels.url, "{{url}}"]
        ]),
        `## ${t.labels.highlightBlock}`,
        "> [!quote]",
        `> ${t.labels.quotePlaceholder}`,
        "> ",
        `> - ${t.labels.source}: `,
        `> - ${t.labels.pageTimestamp}: `,
        `> - ${t.labels.note}: `,
        "",
        `# ${t.labels.summary}`,
        "",
        "{{cursor}}",
        "",
        `# ${t.labels.insight}`,
        "",
        "",
        `# ${t.labels.evidence}`,
        "",
        "> ",
        "",
        "---",
        `## ${t.labels.references}`,
        ""
      ].join("\n");
    case "zk_permanent":
      return [
        managedFrontmatter("template_zk_permanent", [
          "type: zk_permanent",
          "tags:",
          `  - ${tags.knowledge}/${slugPlaceholder}`,
          "maturity: {{maturity}}",
          "aliases:",
          `created: ${nowPlaceholder}`,
          "updated:"
        ]),
        propsTable([
          [t.labels.created, "{{created}}", t.labels.updated, "{{updated}}"],
          [t.labels.status, "{{maturity}}", t.labels.aliases, "{{aliases}}"]
        ]),
        `# ${t.labels.oneSentenceSummary}`,
        "",
        "{{cursor}}",
        "",
        `# ${t.labels.body}`,
        "",
        "",
        `## ${t.labels.limitations}`,
        "- ",
        "",
        `## ${t.labels.relatedQuestions}`,
        "- ",
        "",
        "---",
        `## ${t.labels.references}`,
        ""
      ].join("\n");
  }
}

function managedFrontmatter(kind: string, extra: string[] = []): string {
  return [
    "---",
    "para_zk_managed: true",
    `para_zk_kind: ${kind}`,
    ...extra,
    "---"
  ].join("\n");
}

function propsTable(rows: Array<[string, string, string, string]>): string {
  return [
    "> [!props-table|w1]",
    "> |||||",
    "> | --- | --- | --- | --- |",
    ...rows.map(([a, b, c, d]) => `> | ${a} | ${b} | ${c} | ${d} |`),
    ""
  ].join("\n");
}

function paraZkInlineAction(command: string, label: string): string {
  return `\`PZK[${command}|${label}]\``;
}

function fenced(language: string, lines: string[]): string[] {
  return [
    `\`\`\`${language}`,
    ...lines,
    "```"
  ];
}

function dataviewProjectChildDocs(): string[] {
  return fenced("dataview", [
    "LIST FROM \"\"",
    "WHERE parent = this.file.link AND type = \"doc\"",
    "SORT file.name ASC"
  ]);
}

function dataviewProjectRetros(): string[] {
  return fenced("dataview", [
    "LIST FROM \"PARA/Retros\"",
    "WHERE project = this.file.link",
    "SORT date DESC",
    "LIMIT 10"
  ]);
}

function dataviewAreaProjects(t: ReturnType<typeof localePack>): string[] {
  return fenced("dataview", [
    `TABLE status AS "${t.labels.status}", priority AS "${t.labels.priority}"`,
    "FROM \"PARA/Projects\"",
    "WHERE contains(areas, this.file.link)",
    "SORT due_date ASC, priority DESC"
  ]);
}

function tasksArea(areaTag: string, slugPlaceholder: string, checklistValue: string): string[] {
  return fenced("tasks", [
    "not done",
    `tags include #${areaTag}/${slugPlaceholder}`,
    "path does not include \"Templates\"",
    "path does not include \".trash\"",
    `filter by function task.file.property('subnote_type') !== '${escapeSingleQuoted(checklistValue)}'`,
    "sort by due date"
  ]);
}

function dataviewChildAreas(t: ReturnType<typeof localePack>): string[] {
  return fenced("dataview", [
    `TABLE WITHOUT ID file.link AS "${t.labels.area}", file.mtime AS "${t.labels.updated}"`,
    "FROM \"PARA/Areas\"",
    "WHERE parent = this.file.link AND type = \"area\"",
    "SORT file.name ASC"
  ]);
}

function dataviewChildDocs(t: ReturnType<typeof localePack>): string[] {
  return fenced("dataview", [
    `TABLE WITHOUT ID file.link AS "${t.labels.subnotes}", file.mtime AS "${t.labels.updated}"`,
    "FROM \"\"",
    "WHERE parent = this.file.link AND type = \"doc\"",
    "SORT file.name ASC"
  ]);
}

function dataviewAreaRetros(t: ReturnType<typeof localePack>): string[] {
  return fenced("dataview", [
    `TABLE WITHOUT ID file.link AS "${t.labels.retros}", file.mtime AS "${t.labels.updated}"`,
    "FROM \"PARA/Retros\"",
    "WHERE contains(areas, this.file.link)",
    "SORT date DESC",
    "LIMIT 10"
  ]);
}

function dataviewResourceZkLinks(): string[] {
  return fenced("dataview", [
    "LIST FROM \"ZK\"",
    "WHERE contains(file.outlinks, this.file.link)",
    "SORT file.mtime DESC"
  ]);
}

function escapeSingleQuoted(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function renderGuide(locale: Locale): string {
  const t = localePack(locale);
  const tags = t.tags;
  const lines = [
    "# PARA-ZK Vault Guide",
    "",
    t.labels.guideIntro,
    "",
    `## ${t.labels.folderLayout}`,
    `- PARA/Projects: ${t.labels.folderProjects}`,
    `- PARA/Areas: ${t.labels.folderAreas}`,
    `- PARA/Resources: ${t.labels.folderResources}`,
    `- PARA/Retros: ${t.labels.folderRetros}`,
    `- PARA/Archives: ${t.labels.folderArchives}`,
    `- ZK/Fleeting: ${t.labels.folderFleeting}`,
    `- ZK/Literature: ${t.labels.folderLiterature}`,
    `- ZK/Permanent: ${t.labels.folderPermanent}`,
    `- Journal: ${t.labels.folderJournal}`,
    `- Dashboard: ${t.labels.folderDashboard}`,
    `- Templates/para-zk: ${t.labels.folderManagedTemplates}`,
    "",
    `## ${t.labels.tagNamespaces}`,
    `- ${tags.project}/...`,
    `- ${tags.area}/...`,
    `- ${tags.resource}/...`,
    `- ${tags.knowledge}/...`,
    `- ${tags.journal}`,
    `- ${tags.retro}`,
    "",
    `## ${t.labels.rules}`,
    `- ${t.labels.ruleWorkflow}`,
    `- ${t.labels.ruleFrontmatter}`,
    `- ${t.labels.ruleVisibleLocale}`
  ];

  return [
    managedFrontmatter("guide", [
      "type: guide"
    ]),
    ...lines,
    ""
  ].join("\n");
}

function renderDashboard(
  kind: "home" | "projects" | "areas" | "resources" | "zk" | "tasks" | "review",
  locale: Locale
): string {
  const t = localePack(locale);
  const tags = t.tags;
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
    managedFrontmatter(`dashboard_${kind}`, [
      "type: dashboard",
      `title: ${titleByKind[kind]}`
    ]),
    `# ${titleByKind[kind]}`,
    "",
    ...renderDashboardBody(kind, t, tags.area),
    ""
  ].join("\n");
}

function renderDashboardBody(
  kind: "home" | "projects" | "areas" | "resources" | "zk" | "tasks" | "review",
  t: ReturnType<typeof localePack>,
  areaTag: string
): string[] {
  switch (kind) {
    case "home":
      return [
        `## ${t.labels.createNew}`,
        `${paraZkInlineAction("create-project", t.labels.createProjectCommandName)} ${paraZkInlineAction("create-area", t.labels.createAreaCommandName)} ${paraZkInlineAction("create-resource", t.labels.createResourceCommandName)} ${paraZkInlineAction("create-zk", t.labels.createZkCommandName)} ${paraZkInlineAction("capture-journal", t.labels.captureJournalCommandName)}`,
        "",
        `## ${t.labels.openDashboards}`,
        `[[Dashboard/Projects|${t.labels.dashboardProjects}]] · [[Dashboard/Areas|${t.labels.dashboardAreas}]] · [[Dashboard/Resources|${t.labels.dashboardResources}]] · [[Dashboard/ZK|${t.labels.dashboardZk}]] · [[Dashboard/Tasks|${t.labels.dashboardTasks}]] · [[Dashboard/Review|${t.labels.dashboardReview}]]`,
        "",
        `## ${t.labels.summary}`,
        ...dashboardHomeSummary(t),
        "",
        "---",
        `## ${t.labels.dueSoon7}`,
        ...dashboardDueProjects(t, 15),
        "",
        "---",
        `## ${t.labels.todayTasks}`,
        ...tasksDueToday(t.subnoteTypes[1]),
        "",
        "---",
        `## ${t.labels.upcoming7}`,
        ...tasksDueSoon(t.subnoteTypes[1], 10),
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
        `## ${t.labels.staleFleeting}`,
        ...dashboardStaleFleeting(t, 10),
        "",
        `## ${t.labels.draftCandidates}`,
        ...dashboardDraftPermanent(t, 10)
      ];
    case "projects":
      return [
        `## ${t.labels.summary}`,
        ...dashboardProjectsSummary(t),
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
        ...dashboardAreasSummary(t),
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
        ...dashboardResourcesSummary(t),
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
        ...dashboardZkSummary(t),
        "",
        "---",
        `## ${t.labels.staleFleeting}`,
        ...dashboardStaleFleeting(t, 50),
        "",
        "---",
        `## ${t.labels.draftCandidates}`,
        ...dashboardDraftPermanent(t, 50),
        "",
        "---",
        `## ${t.labels.recentlyCreated}`,
        ...dashboardRecentLiterature(t)
      ];
    case "tasks":
      return [
        `## ${t.labels.today}`,
        ...tasksDueToday(t.subnoteTypes[1]),
        "",
        "---",
        `## ${t.labels.upcoming7}`,
        ...tasksDueSoon(t.subnoteTypes[1], 0),
        "",
        "---",
        `## ${t.labels.upcoming30}`,
        ...tasksDueMedium(t.subnoteTypes[1]),
        "",
        "---",
        `## ${t.labels.area}`,
        ...tasksAreaAll(areaTag, t.subnoteTypes[1]),
        "",
        "---",
        `## ${t.labels.project}`,
        ...tasksProjects(t.subnoteTypes[1]),
        "",
        "---",
        `## ${t.labels.journal}`,
        ...tasksJournal(t.subnoteTypes[1]),
        "",
        "---",
        `## ${t.labels.completedRecent}`,
        ...tasksDone(t.subnoteTypes[1])
      ];
    case "review":
      return [
        `## ${t.labels.summary}`,
        ...dashboardReviewSummary(t),
        "",
        "---",
        `## ${t.labels.createdThisWeek}: ${t.labels.references}`,
        ...dashboardThisWeekResources(t),
        "",
        "---",
        `## ${t.labels.createdThisWeek}: Fleeting`,
        ...dashboardThisWeekFleeting(t),
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

function dashboardCardsScript(cards: string[]): string[] {
  return dataviewJs([
    "const root = dv.container.createDiv({ cls: 'mtr-cards' });",
    "const card = (emoji, label, value, sub = '') => {",
    "  const c = root.createDiv({ cls: 'mtr-card' });",
    "  c.createDiv({ cls: 'mtr-label', text: `${emoji} ${label}` });",
    "  c.createDiv({ cls: 'mtr-value', text: String(value) });",
    "  if (sub) c.createDiv({ cls: 'mtr-sub', text: sub });",
    "};",
    ...cards
  ]);
}

function dashboardHomeSummary(t: ReturnType<typeof localePack>): string[] {
  return dashboardCardsScript([
    "const projects = pages('\"PARA/Projects\"').filter(p => p.type === 'project' && !p.file.path.includes('/Archives/'));",
    "const areas = pages('\"PARA/Areas\"').filter(p => p.type === 'area');",
    "const resources = pages('\"PARA/Resources\"').filter(p => p.type === 'resource');",
    "const fleeting = pages('\"ZK/Fleeting\"').filter(p => !p.file.path.includes('/Archives/'));",
    "const literature = pages('\"ZK/Literature\"');",
    "const permanent = pages('\"ZK/Permanent\"');",
    `card('📦', ${jsString(t.labels.project)}, projects.length);`,
    `card('🧱', ${jsString(t.labels.area)}, areas.length);`,
    `card('📚', ${jsString(t.labels.references)}, resources.length);`,
    "card('🌟', 'Fleeting', fleeting.length);",
    "card('📚', 'Literature', literature.length);",
    "card('🧠', 'Permanent', permanent.length);"
  ]);
}

function dashboardProjectsSummary(t: ReturnType<typeof localePack>): string[] {
  return dashboardCardsScript([
    "const days = (n) => 1000 * 60 * 60 * 24 * n;",
    "const today = new Date(); today.setHours(0,0,0,0);",
    "const all = pages('\"PARA/Projects\"').filter(p => p.type === 'project');",
    "const active = all.filter(p => !p.file.path.includes('/Archives/'));",
    "const withDue = active.filter(p => !!p.due_date);",
    "const dueToday = withDue.filter(p => dayOf(p.due_date) === today.getTime());",
    "const overdue = withDue.filter(p => dayOf(p.due_date) < today.getTime());",
    "const soon7 = withDue.filter(p => { const diff = dayOf(p.due_date) - today.getTime(); return diff >= 0 && diff <= days(7); });",
    "const soon30 = withDue.filter(p => { const diff = dayOf(p.due_date) - today.getTime(); return diff > days(7) && diff <= days(30); });",
    `card('📦', ${jsString(t.labels.total)}, all.length);`,
    `card('🟣', ${jsString(t.labels.active)}, active.length);`,
    `card('📅', ${jsString(t.labels.dueToday)}, dueToday.length);`,
    `card('⏰', ${jsString(t.labels.overdue)}, overdue.length);`,
    `card('🗓️', ${jsString(t.labels.dueSoon7)}, soon7.length);`,
    `card('📆', ${jsString(t.labels.dueSoon30)}, soon30.length);`
  ]);
}

function dashboardAreasSummary(t: ReturnType<typeof localePack>): string[] {
  return dashboardCardsScript([
    "const areas = pages('\"PARA/Areas\"').filter(p => p.type === 'area');",
    "const projects = pages('\"PARA/Projects\"').filter(p => p.type === 'project' && !p.file.path.includes('/Archives/'));",
    "const linkedAreas = areas.filter(a => projects.some(p => asArray(p.areas).some(x => sameLink(x, a))));",
    `card('📦', ${jsString(t.labels.total)}, areas.length);`,
    `card('🔗', ${jsString(t.labels.dashboardProjects)}, linkedAreas.length);`
  ]);
}

function dashboardResourcesSummary(t: ReturnType<typeof localePack>): string[] {
  return dashboardCardsScript([
    "const days = (n) => 1000 * 60 * 60 * 24 * n;",
    "const now = Date.now();",
    "const resources = pages('\"PARA/Resources\"').filter(p => p.type === 'resource');",
    "const inUse = resources.filter(r => asArray(r.file.inlinks).some(l => l.path.startsWith('PARA/Projects/') || l.path.startsWith('PARA/Areas/')));",
    "const free = resources.filter(r => !asArray(r.file.inlinks).some(l => l.path.startsWith('PARA/Projects/') || l.path.startsWith('PARA/Areas/')));",
    "const orphan = resources.filter(r => asArray(r.file.inlinks).length === 0);",
    "const zkReferenced = resources.filter(r => asArray(r.file.inlinks).some(l => l.path.startsWith('ZK/')));",
    "const staleFree = free.filter(r => timeOf(r.file.mtime) < now - days(30));",
    `card('📦', ${jsString(t.labels.total)}, resources.length);`,
    `card('🔗', ${jsString(t.labels.active)}, inUse.length);`,
    `card('🟦', ${jsString(t.labels.unreferenced)}, free.length);`,
    `card('🧩', ${jsString(t.labels.independentResources)}, orphan.length);`,
    `card('🕰️', ${jsString(t.labels.draftCandidates)}, staleFree.length);`,
    `card('🧭', ${jsString(t.labels.dashboardZk)}, zkReferenced.length);`
  ]);
}

function dashboardZkSummary(t: ReturnType<typeof localePack>): string[] {
  return dashboardCardsScript([
    "const days = (n) => 1000 * 60 * 60 * 24 * n;",
    "const now = Date.now();",
    "const fleeting = pages('\"ZK/Fleeting\"').filter(p => !p.file.path.includes('/Archives/'));",
    "const literature = pages('\"ZK/Literature\"');",
    "const permanent = pages('\"ZK/Permanent\"');",
    "const stale = fleeting.filter(f => now - timeOf(f.file.ctime) >= days(7));",
    `const draftLabel = ${jsString(t.maturity.draft)};`,
    `const refinedLabel = ${jsString(t.maturity.refined)};`,
    `const evergreenLabel = ${jsString(t.maturity.evergreen)};`,
    "const draft = permanent.filter(p => p.maturity === draftLabel);",
    "const refined = permanent.filter(p => p.maturity === refinedLabel);",
    "const evergreen = permanent.filter(p => p.maturity === evergreenLabel);",
    `card('🌟', 'Fleeting', fleeting.length, ${jsString(t.labels.staleFleeting)} + ' ' + stale.length);`,
    "card('📚', 'Literature', literature.length);",
    "card('🧠', 'Permanent', permanent.length);",
    "card('📝', draftLabel, draft.length);",
    "card('✨', refinedLabel, refined.length);",
    "card('🍃', evergreenLabel, evergreen.length);"
  ]);
}

function dashboardReviewSummary(t: ReturnType<typeof localePack>): string[] {
  return dashboardCardsScript([
    "const startOfWeek = (() => { const d = new Date(); const day = (d.getDay() + 6) % 7; d.setHours(0,0,0,0); d.setDate(d.getDate() - day); return d; })();",
    "const since = startOfWeek.getTime();",
    "const resources = pages('\"PARA/Resources\"');",
    "const fleeting = pages('\"ZK/Fleeting\"').filter(p => !p.file.path.includes('/Archives/'));",
    "const literature = pages('\"ZK/Literature\"');",
    "const permanent = pages('\"ZK/Permanent\"');",
    "const created = (items) => items.filter(p => timeOf(p.file.ctime) >= since).length;",
    "const updated = (items) => items.filter(p => timeOf(p.file.mtime) >= since).length;",
    `card('📄', ${jsString(t.labels.createdThisWeek)}, created(resources));`,
    `card('✏️', ${jsString(t.labels.updatedThisWeek)}, updated(resources));`,
    "card('🌟', 'Fleeting', created(fleeting));",
    "card('📚', 'Literature', created(literature));",
    "card('🧠', 'Permanent', created(permanent));"
  ]);
}

function dashboardDueProjects(t: ReturnType<typeof localePack>, limit: number): string[] {
  return fenced("dataview", [
    `TABLE WITHOUT ID file.link AS "${t.labels.project}", priority AS "${t.labels.priority}", due_date AS "${t.labels.dueDate}"`,
    "FROM \"PARA/Projects\"",
    "WHERE type = \"project\" AND !contains(file.path, \"/Archives/\") AND due_date AND date(due_date) <= date(today) + dur(7 days)",
    "SORT due_date ASC",
    `LIMIT ${limit}`
  ]);
}

function dashboardDueProjects30(t: ReturnType<typeof localePack>): string[] {
  return dataviewJs([
    "const days = (n) => 1000 * 60 * 60 * 24 * n;",
    "const today = new Date(); today.setHours(0,0,0,0);",
    "const projects = pages('\"PARA/Projects\"').filter(p => p.type === 'project' && !p.file.path.includes('/Archives/') && p.due_date);",
    "const rows = projects.filter(p => { const diff = dayOf(p.due_date) - today.getTime(); return diff > days(7) && diff <= days(30); })",
    "  .sort((a,b) => dayOf(a.due_date) - dayOf(b.due_date))",
    "  .map(p => [p.file.link, p.priority ?? '', p.due_date]);",
    `dv.table([${jsString(t.labels.project)}, ${jsString(t.labels.priority)}, ${jsString(t.labels.dueDate)}], rows);`
  ]);
}

function dashboardRecentCoreNotes(t: ReturnType<typeof localePack>, limit: number): string[] {
  return fenced("dataview", [
    `TABLE WITHOUT ID file.link AS "${t.labels.links}", type AS "${t.labels.kind}", file.mtime AS "${t.labels.updated}"`,
    "FROM \"PARA/Projects\" OR \"PARA/Areas\" OR \"PARA/Resources\" OR \"ZK\"",
    "WHERE (type = \"project\" OR type = \"area\" OR type = \"resource\" OR startswith(type, \"zk_\")) AND !contains(file.path, \"/Archives/\")",
    "SORT file.mtime DESC",
    `LIMIT ${limit}`
  ]);
}

function dashboardRecentProjects(t: ReturnType<typeof localePack>): string[] {
  return fenced("dataview", [
    `TABLE WITHOUT ID file.link AS "${t.labels.project}", file.mtime AS "${t.labels.updated}", due_date AS "${t.labels.dueDate}", priority AS "${t.labels.priority}"`,
    "FROM \"PARA/Projects\"",
    "WHERE type = \"project\" AND !contains(file.path, \"/Archives/\")",
    "SORT file.mtime DESC",
    "LIMIT 10"
  ]);
}

function dashboardAreaProjectCounts(t: ReturnType<typeof localePack>): string[] {
  return dataviewJs([
    "const areas = pages('\"PARA/Areas\"').filter(p => p.type === 'area');",
    "const projects = pages('\"PARA/Projects\"').filter(p => p.type === 'project' && !p.file.path.includes('/Archives/'));",
    "const rows = areas.map(a => {",
    "  const count = projects.filter(p => asArray(p.areas).some(x => sameLink(x, a))).length;",
    "  return [a.file.link, count];",
    "}).sort((a,b) => b[1] - a[1]);",
    `dv.table([${jsString(t.labels.area)}, ${jsString(t.labels.dashboardProjects)}], rows);`
  ]);
}

function dashboardAreaRecentProject(t: ReturnType<typeof localePack>): string[] {
  return dataviewJs([
    "const areas = pages('\"PARA/Areas\"').filter(p => p.type === 'area');",
    "const projects = pages('\"PARA/Projects\"').filter(p => p.type === 'project' && !p.file.path.includes('/Archives/')).sort((a,b) => timeOf(b.file.mtime) - timeOf(a.file.mtime));",
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
  return resourceBacklinkTable(t, "asArray(r.file.inlinks).some(l => l.path.startsWith('PARA/Projects/') || l.path.startsWith('PARA/Areas/'))");
}

function dashboardResourcesFree(t: ReturnType<typeof localePack>): string[] {
  return resourceBacklinkTable(t, "!asArray(r.file.inlinks).some(l => l.path.startsWith('PARA/Projects/') || l.path.startsWith('PARA/Areas/'))");
}

function dashboardResourcesZkReferenced(t: ReturnType<typeof localePack>): string[] {
  return resourceBacklinkTable(t, "asArray(r.file.inlinks).some(l => l.path.startsWith('ZK/'))");
}

function dashboardOrphanResources(t: ReturnType<typeof localePack>, limit: number): string[] {
  return dataviewJs([
    "const rows = pages('\"PARA/Resources\"')",
    "  .filter(r => asArray(r.file.inlinks).length === 0)",
    "  .sort((a,b) => timeOf(b.file.ctime) - timeOf(a.file.ctime))",
    `  .slice(0, ${limit})`,
    "  .map(r => [r.file.link, r.file.ctime]);",
    `dv.table([${jsString(t.labels.references)}, ${jsString(t.labels.created)}], rows);`
  ]);
}

function resourceBacklinkTable(t: ReturnType<typeof localePack>, filterExpression: string): string[] {
  return dataviewJs([
    "const rows = pages('\"PARA/Resources\"')",
    `  .filter(r => ${filterExpression})`,
    "  .sort((a,b) => timeOf(b.file.mtime) - timeOf(a.file.mtime))",
    "  .map(r => [r.file.link, asArray(r.file.inlinks).length, r.file.mtime, r.file.ctime]);",
    `dv.table([${jsString(t.labels.references)}, ${jsString(t.labels.backlinks)}, ${jsString(t.labels.updated)}, ${jsString(t.labels.created)}], rows);`
  ]);
}

function dashboardStaleFleeting(t: ReturnType<typeof localePack>, limit: number): string[] {
  return dataviewJs([
    "const days = (n) => 1000 * 60 * 60 * 24 * n;",
    "const now = Date.now();",
    "const rows = pages('\"ZK/Fleeting\"')",
    "  .filter(f => !f.file.path.includes('/Archives/'))",
    "  .filter(f => now - timeOf(f.file.ctime) >= days(7))",
    "  .sort((a,b) => timeOf(a.file.ctime) - timeOf(b.file.ctime))",
    `  .slice(0, ${limit})`,
    "  .map(f => [f.file.link, f.file.ctime]);",
    `dv.table(['Fleeting', ${jsString(t.labels.created)}], rows);`
  ]);
}

function dashboardDraftPermanent(t: ReturnType<typeof localePack>, limit: number): string[] {
  return dataviewJs([
    "const days = (n) => 1000 * 60 * 60 * 24 * n;",
    "const now = Date.now();",
    `const draftLabel = ${jsString(t.maturity.draft)};`,
    "const rows = pages('\"ZK/Permanent\"')",
    "  .filter(p => p.maturity === draftLabel && now - timeOf(p.file.mtime) >= days(14))",
    "  .sort((a,b) => timeOf(a.file.mtime) - timeOf(b.file.mtime))",
    `  .slice(0, ${limit})`,
    "  .map(p => [p.file.link, p.file.mtime]);",
    `dv.table(['Permanent', ${jsString(t.labels.updated)}], rows);`
  ]);
}

function dashboardRecentLiterature(t: ReturnType<typeof localePack>): string[] {
  return fenced("dataview", [
    `TABLE WITHOUT ID file.link AS "Literature", file.ctime AS "${t.labels.created}", file.mtime AS "${t.labels.updated}"`,
    "FROM \"ZK/Literature\"",
    "SORT file.ctime DESC",
    "LIMIT 10"
  ]);
}

function dashboardThisWeekResources(t: ReturnType<typeof localePack>): string[] {
  return dataviewJs([
    "const startOfWeek = (() => { const d = new Date(); const day = (d.getDay() + 6) % 7; d.setHours(0,0,0,0); d.setDate(d.getDate() - day); return d; })();",
    "const rows = pages('\"PARA/Resources\"')",
    "  .filter(p => timeOf(p.file.ctime) >= startOfWeek.getTime())",
    "  .sort((a,b) => timeOf(b.file.ctime) - timeOf(a.file.ctime))",
    "  .map(p => [p.file.link, p.file.ctime]);",
    `dv.table([${jsString(t.labels.references)}, ${jsString(t.labels.created)}], rows);`
  ]);
}

function dashboardThisWeekFleeting(t: ReturnType<typeof localePack>): string[] {
  return dataviewJs([
    "const startOfWeek = (() => { const d = new Date(); const day = (d.getDay() + 6) % 7; d.setHours(0,0,0,0); d.setDate(d.getDate() - day); return d; })();",
    "const rows = pages('\"ZK/Fleeting\"')",
    "  .filter(p => !p.file.path.includes('/Archives/'))",
    "  .filter(p => timeOf(p.file.ctime) >= startOfWeek.getTime())",
    "  .sort((a,b) => timeOf(b.file.ctime) - timeOf(a.file.ctime))",
    "  .map(p => [p.file.link, p.file.ctime]);",
    `dv.table(['Fleeting', ${jsString(t.labels.created)}], rows);`
  ]);
}

function tasksDueToday(checklistValue: string): string[] {
  return fenced("tasks", [
    "not done",
    "due today",
    "path does not include \"Templates\"",
    "path does not include \".trash\"",
    `filter by function task.file.property('subnote_type') !== '${escapeSingleQuoted(checklistValue)}'`,
    "hide backlinks",
    "sort by priority",
    "sort by due date"
  ]);
}

function tasksDueSoon(checklistValue: string, limit: number): string[] {
  return fenced("tasks", [
    "not done",
    "(due on or after tomorrow) AND (due on or before in 7 days)",
    "path does not include \"Templates\"",
    "path does not include \".trash\"",
    `filter by function task.file.property('subnote_type') !== '${escapeSingleQuoted(checklistValue)}'`,
    "hide backlinks",
    ...(limit > 0 ? [`limit ${limit}`] : []),
    "sort by priority",
    "sort by due date"
  ]);
}

function tasksDueMedium(checklistValue: string): string[] {
  return fenced("tasks", [
    "not done",
    "(due on or after in 8 days) AND (due on or before in 30 days)",
    "path does not include \"Templates\"",
    "path does not include \".trash\"",
    `filter by function task.file.property('subnote_type') !== '${escapeSingleQuoted(checklistValue)}'`,
    "sort by priority",
    "sort by due date"
  ]);
}

function tasksAreaAll(areaTag: string, checklistValue: string): string[] {
  return fenced("tasks", [
    "not done",
    `tags include #${areaTag}`,
    "path does not include \"Templates\"",
    "path does not include \".trash\"",
    `filter by function task.file.property('subnote_type') !== '${escapeSingleQuoted(checklistValue)}'`,
    "group by tags",
    "sort by due date"
  ]);
}

function tasksProjects(checklistValue: string): string[] {
  return fenced("tasks", [
    "not done",
    "path includes \"PARA/Projects\"",
    "path does not include \"/Archives/\"",
    "path does not include \"Templates\"",
    "path does not include \".trash\"",
    `filter by function task.file.property('subnote_type') !== '${escapeSingleQuoted(checklistValue)}'`,
    "group by backlink",
    "sort by due date"
  ]);
}

function tasksJournal(checklistValue: string): string[] {
  return fenced("tasks", [
    "not done",
    "path includes \"Journal\"",
    "path does not include \".trash\"",
    `filter by function task.file.property('subnote_type') !== '${escapeSingleQuoted(checklistValue)}'`,
    "hide backlinks",
    "group by path",
    "sort by due date"
  ]);
}

function tasksDone(checklistValue: string): string[] {
  return fenced("tasks", [
    "done",
    "path does not include \"Templates\"",
    "path does not include \".trash\"",
    `filter by function task.file.property('subnote_type') !== '${escapeSingleQuoted(checklistValue)}'`,
    "hide backlinks",
    "sort by done reverse",
    "limit 50"
  ]);
}
