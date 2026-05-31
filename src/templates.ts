import type { Locale, ParaZkSettings } from "./types";
import { localePack } from "./i18n";
import type { PropsViewType } from "./props/schema";

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
        frontmatter([
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
        paraZkPropsBlock("project"),
        `# ${t.labels.summary}`,
        ...latestRetroSummaryTip(t),
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
        `## ${t.labels.references} ${referenceActions(t)}`,
        "",
        ""
      ].join("\n");
    case "area":
      return [
        frontmatter([
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
        ...tasksArea(t, tags.area, slugPlaceholder),
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
        `## ${t.labels.references} ${referenceActions(t)}`,
        "",
        ""
      ].join("\n");
    case "resource":
      return [
        frontmatter([
          "type: resource",
          "tags:",
          `  - ${tags.resource}/${slugPlaceholder}`,
          `created: ${nowPlaceholder}`,
          "updated:"
        ]),
        paraZkPropsBlock("resource"),
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
        `## ${t.labels.references} ${referenceActions(t)}`,
        "",
        ""
      ].join("\n");
    case "journal":
      return [
        frontmatter([
          "type: journal",
          "date: {{date}}",
          "energy: {{energy}}",
          "tags:",
          `  - ${tags.journal}`,
          `created: ${nowPlaceholder}`,
          "updated:"
        ]),
        paraZkPropsBlock("journal"),
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
        `# ${t.labels.tasks}`,
        "- [ ] ",
        "",
        "---",
        `# ${t.labels.shortReview}`,
        `- ${t.labels.whatWentWell}:`,
        `- ${t.labels.improvements}:`,
        "",
        "---",
        `## ${t.labels.references}`,
        ""
      ].join("\n");
    case "retro":
      return [
        frontmatter([
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
        `# ${t.labels.tasks}`,
        "- [ ] ",
        "",
        "---",
        `# ${t.labels.retroSummary}`,
        `> ###### ${retroSummaryPlaceholder(t.locale)}`,
        "",
        "---",
        `## ${t.labels.references}`,
        ""
      ].join("\n");
    case "subnote":
      return [
        frontmatter([
          "type: doc",
          "subnote_type: {{subnote_type}}",
          "parent:",
          `created: ${nowPlaceholder}`,
          "updated:"
        ]),
        paraZkPropsBlock("subnote"),
        "",
        "{{cursor}}",
        ""
      ].join("\n");
    case "zk_fleeting":
      return [
        frontmatter([
          "type: zk_fleeting",
          "tags:",
          `  - ${tags.knowledge}/${slugPlaceholder}`,
          `created: ${nowPlaceholder}`,
          "updated:",
          "processed: false"
        ]),
        paraZkPropsBlock("zk_fleeting"),
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
        `## ${t.labels.tasks}`,
        `- [ ] ${t.labels.refineFleetingAction}`,
        `- [ ] ${t.labels.connectReferencesAction}`,
        "",
        "---",
        `## ${t.labels.references}`,
        ""
      ].join("\n");
    case "zk_literature":
      return [
        frontmatter([
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
        paraZkPropsBlock("zk_literature"),
        `## ${t.labels.highlightBlock}`,
        `> [!quote] ${quoteExampleTitle(t.locale)}`,
        `> ${t.labels.quotePlaceholder}`,
        "> ",
        `> - ${t.labels.source}: `,
        `> - ${t.labels.pageTimestamp}: `,
        `> - ${t.labels.note}: ${noteContextHint(t.locale)}`,
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
        frontmatter([
          "type: zk_permanent",
          "tags:",
          `  - ${tags.knowledge}/${slugPlaceholder}`,
          "maturity: {{maturity}}",
          "aliases:",
          `created: ${nowPlaceholder}`,
          "updated:"
        ]),
        paraZkPropsBlock("zk_permanent"),
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

function paraZkInlineAction(command: string, label: string): string {
  return `\`PZK[${command}|${label}]\``;
}

function referenceActions(t: ReturnType<typeof localePack>): string {
  return [
    paraZkInlineAction("add-reference", t.labels.addReference),
    paraZkInlineAction("create-resource", t.labels.createResource)
  ].join(" ");
}

function latestRetroSummaryTip(t: ReturnType<typeof localePack>): string[] {
  return [
    `> [!tip] ${latestRetroSummaryTitle(t.locale)}`,
    "> ```dataview",
    "> TABLE WITHOUT ID rows[0] AS \"Latest\"",
    "> FROM \"PARA/Retros\"",
    "> WHERE project = this.file.link",
    "> SORT date DESC",
    `> FLATTEN choice(rows[0].file.frontmatter[${jsString(t.labels.retroSummary)}], rows[0].file.frontmatter["summary"], "") AS latest`,
    "> WHERE latest != \"\"",
    "> LIMIT 1",
    "> ```"
  ];
}

function fenced(language: string, lines: string[]): string[] {
  return [
    `\`\`\`${language}`,
    ...lines,
    "```"
  ];
}

function tabbedTasks(openLines: string[], doneLines: string[], locale: Locale): string[] {
  return [
    "````tabs",
    `tab: ${openTabLabel(locale)}`,
    ...fenced("tasks", openLines),
    `tab: ${doneTabLabel(locale)}`,
    ...fenced("tasks", doneLines),
    "````"
  ];
}

function openTabLabel(locale: Locale): string {
  return locale === "ko" ? "미완" : "Open";
}

function doneTabLabel(locale: Locale): string {
  return locale === "ko" ? "완료" : "Done";
}

function latestRetroSummaryTitle(locale: Locale): string {
  return locale === "ko" ? "최근 회고 요약" : "Latest retro summary";
}

function quoteExampleTitle(locale: Locale): string {
  return locale === "ko" ? "하이라이트 예시" : "Highlight example";
}

function noteContextHint(locale: Locale): string {
  return locale === "ko" ? "(나의 생각/맥락)" : "(my thought/context)";
}

function retroSummaryPlaceholder(locale: Locale): string {
  return locale === "ko" ? "(다음 주에 바로 도움이 될 핵심 한 줄)" : "(one line that helps next week)";
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

function tasksArea(t: ReturnType<typeof localePack>, areaTag: string, slugPlaceholder: string): string[] {
  const base = [
    `tags include #${areaTag}/${slugPlaceholder}`,
    "path does not include \"Templates\"",
    "path does not include \".trash\"",
    "sort by due date"
  ];
  return tabbedTasks([
    "not done",
    ...base
  ], [
    "done",
    ...base
  ], t.locale);
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
    frontmatter([
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
    frontmatter([
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
        ...fenced("para-zk-dashboard-actions", []),
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
        ...tasksDueToday(),
        "",
        "---",
        `## ${t.labels.upcoming7}`,
        ...tasksDueSoon(10),
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
        ...tasksDueToday(),
        "",
        "---",
        `## ${t.labels.upcoming7}`,
        ...tasksDueSoon(0),
        "",
        "---",
        `## ${t.labels.upcoming30}`,
        ...tasksDueMedium(),
        "",
        "---",
        `## ${t.labels.area}`,
        ...tasksAreaAll(areaTag),
        "",
        "---",
        `## ${t.labels.project}`,
        ...tasksProjects(),
        "",
        "---",
        `## ${t.labels.journal}`,
        ...tasksJournal(),
        "",
        "---",
        `## ${t.labels.completedRecent}`,
        ...tasksDone()
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

function dashboardHomeSummary(_t: ReturnType<typeof localePack>): string[] {
  return dashboardSummaryBlock("home");
}

function dashboardProjectsSummary(_t: ReturnType<typeof localePack>): string[] {
  return dashboardSummaryBlock("projects");
}

function dashboardAreasSummary(_t: ReturnType<typeof localePack>): string[] {
  return dashboardSummaryBlock("areas");
}

function dashboardResourcesSummary(_t: ReturnType<typeof localePack>): string[] {
  return dashboardSummaryBlock("resources");
}

function dashboardZkSummary(_t: ReturnType<typeof localePack>): string[] {
  return dashboardSummaryBlock("zk");
}

function dashboardReviewSummary(_t: ReturnType<typeof localePack>): string[] {
  return dashboardSummaryBlock("review");
}

function dashboardSummaryBlock(type: "home" | "projects" | "areas" | "resources" | "zk" | "review"): string[] {
  return fenced("para-zk-dashboard-summary", [`type: ${type}`]);
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
    `TABLE WITHOUT ID file.link AS "${t.labels.references}", type AS "${t.labels.kind}", file.mtime AS "${t.labels.updated}"`,
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
    "  .filter(f => f.processed !== true)",
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
    "const rows = pages('\"ZK/Permanent\"')",
    "  .filter(p => p.maturity === 'draft' && now - timeOf(p.file.mtime) >= days(14))",
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
    "  .filter(p => p.processed !== true)",
    "  .filter(p => timeOf(p.file.ctime) >= startOfWeek.getTime())",
    "  .sort((a,b) => timeOf(b.file.ctime) - timeOf(a.file.ctime))",
    "  .map(p => [p.file.link, p.file.ctime]);",
    `dv.table(['Fleeting', ${jsString(t.labels.created)}], rows);`
  ]);
}

function tasksDueToday(): string[] {
  return fenced("tasks", [
    "not done",
    "due today",
    "path does not include \"Templates\"",
    "path does not include \".trash\"",
    "hide backlinks",
    "sort by priority",
    "sort by due date"
  ]);
}

function tasksDueSoon(limit: number): string[] {
  return fenced("tasks", [
    "not done",
    "(due on or after tomorrow) AND (due on or before in 7 days)",
    "path does not include \"Templates\"",
    "path does not include \".trash\"",
    "hide backlinks",
    ...(limit > 0 ? [`limit ${limit}`] : []),
    "sort by priority",
    "sort by due date"
  ]);
}

function tasksDueMedium(): string[] {
  return fenced("tasks", [
    "not done",
    "(due on or after in 8 days) AND (due on or before in 30 days)",
    "path does not include \"Templates\"",
    "path does not include \".trash\"",
    "sort by priority",
    "sort by due date"
  ]);
}

function tasksAreaAll(areaTag: string): string[] {
  return fenced("tasks", [
    "not done",
    `tags include #${areaTag}`,
    "path does not include \"Templates\"",
    "path does not include \".trash\"",
    "group by tags",
    "sort by due date"
  ]);
}

function tasksProjects(): string[] {
  return fenced("tasks", [
    "not done",
    "path includes \"PARA/Projects\"",
    "path does not include \"/Archives/\"",
    "path does not include \"Templates\"",
    "path does not include \".trash\"",
    "group by backlink",
    "sort by due date"
  ]);
}

function tasksJournal(): string[] {
  return fenced("tasks", [
    "not done",
    "path includes \"Journal\"",
    "path does not include \".trash\"",
    "hide backlinks",
    "group by path",
    "sort by due date"
  ]);
}

function tasksDone(): string[] {
  return fenced("tasks", [
    "done",
    "path does not include \"Templates\"",
    "path does not include \".trash\"",
    "hide backlinks",
    "sort by done reverse",
    "limit 50"
  ]);
}
