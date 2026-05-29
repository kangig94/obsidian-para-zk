import { TFile, type App } from "obsidian";
import { localePack } from "../i18n";
import type { ParaZkPluginContext } from "../plugin-interface";
import type { ParaZkSettings } from "../types";
import { frontmatterLinks } from "../vault/frontmatter";
import { normalizeVaultPath } from "../vault/paths";

type DashboardSummaryType = "home" | "projects" | "areas" | "resources" | "zk" | "review";

type SummaryCard = {
  emoji: string;
  label: string;
  value: number;
  sub?: string;
};

type FileRecord = {
  file: TFile;
  frontmatter: Record<string, unknown>;
};

export function registerDashboardSummaryRenderers(plugin: ParaZkPluginContext): void {
  plugin.registerMarkdownCodeBlockProcessor("para-zk-dashboard-summary", (source, el) => {
    renderDashboardSummary(plugin, source, el);
  });
}

function renderDashboardSummary(plugin: ParaZkPluginContext, source: string, el: HTMLElement): void {
  const args = parseCodeBlockKeyValues(source);
  const type = parseSummaryType(args.type);

  el.empty();
  el.addClass("para-zk-summary-cards", "mtr-cards");

  if (!type) {
    el.createDiv({ cls: "para-zk-summary-muted", text: "PARA-ZK dashboard summary type is missing or unsupported." });
    return;
  }

  for (const card of summaryCards(plugin, type)) {
    renderSummaryCard(el, card);
  }
}

function renderSummaryCard(container: HTMLElement, card: SummaryCard): void {
  const cardEl = container.createDiv({ cls: "para-zk-summary-card mtr-card" });
  cardEl.createDiv({ cls: "para-zk-summary-label mtr-label", text: `${card.emoji} ${card.label}` });
  cardEl.createDiv({ cls: "para-zk-summary-value mtr-value", text: String(card.value) });
  if (card.sub) cardEl.createDiv({ cls: "para-zk-summary-sub mtr-sub", text: card.sub });
}

function summaryCards(plugin: ParaZkPluginContext, type: DashboardSummaryType): SummaryCard[] {
  const t = localePack(plugin.settings.locale);
  const records = vaultRecords(plugin.app);
  const groups = dashboardRecordGroups(records, plugin.settings);

  switch (type) {
    case "home":
      return [
        card("📦", t.labels.project, groups.projects.length),
        card("🧱", t.labels.area, groups.areas.length),
        card("📚", t.labels.references, groups.resources.length),
        card("🌟", "Fleeting", groups.fleeting.length),
        card("📚", "Literature", groups.literature.length),
        card("🧠", "Permanent", groups.permanent.length)
      ];
    case "projects": {
      const today = startOfToday();
      const withDue = groups.projects.filter((record) => hasDate(record.frontmatter.due_date));
      return [
        card("📦", t.labels.total, groups.projects.length),
        card("🟣", t.labels.active, groups.projects.length),
        card("📅", t.labels.dueToday, withDue.filter((record) => dateDay(record.frontmatter.due_date) === today).length),
        card("⏰", t.labels.overdue, withDue.filter((record) => dateDay(record.frontmatter.due_date) < today).length),
        card("🗓️", t.labels.dueSoon7, withDue.filter((record) => dueWithin(record, 0, 7)).length),
        card("📆", t.labels.dueSoon30, withDue.filter((record) => dueWithin(record, 8, 30)).length)
      ];
    }
    case "areas": {
      const linkedAreas = groups.areas.filter((area) => groups.projects.some((project) => projectLinksToArea(project, area)));
      return [
        card("📦", t.labels.total, groups.areas.length),
        card("🔗", t.labels.dashboardProjects, linkedAreas.length)
      ];
    }
    case "resources": {
      const inUse = groups.resources.filter((resource) => {
        const inlinks = inlinkPaths(plugin.app, resource.file);
        return inlinks.some((path) => path.startsWith(`${normalizeVaultPath(plugin.settings.paths.projectsFolder)}/`)
          || path.startsWith(`${normalizeVaultPath(plugin.settings.paths.areasFolder)}/`));
      });
      const free = groups.resources.filter((resource) => !inUse.includes(resource));
      const orphan = groups.resources.filter((resource) => inlinkPaths(plugin.app, resource.file).length === 0);
      const zkReferenced = groups.resources.filter((resource) => inlinkPaths(plugin.app, resource.file).some((path) => {
        return path.startsWith(`${normalizeVaultPath(plugin.settings.paths.zkFolder)}/`);
      }));
      const staleFree = free.filter((resource) => resource.file.stat.mtime < Date.now() - days(30));
      return [
        card("📦", t.labels.total, groups.resources.length),
        card("🔗", t.labels.active, inUse.length),
        card("🟦", t.labels.unreferenced, free.length),
        card("🧩", t.labels.independentResources, orphan.length),
        card("🕰️", t.labels.draftCandidates, staleFree.length),
        card("🧭", t.labels.dashboardZk, zkReferenced.length)
      ];
    }
    case "zk": {
      const stale = groups.fleeting.filter((record) => record.file.stat.ctime <= Date.now() - days(7));
      return [
        card("🌟", "Fleeting", groups.fleeting.length, `${t.labels.staleFleeting} ${stale.length}`),
        card("📚", "Literature", groups.literature.length),
        card("🧠", "Permanent", groups.permanent.length),
        card("📝", t.maturity.draft, groups.permanent.filter((record) => record.frontmatter.maturity === "draft").length),
        card("✨", t.maturity.refined, groups.permanent.filter((record) => record.frontmatter.maturity === "refined").length),
        card("🍃", t.maturity.evergreen, groups.permanent.filter((record) => record.frontmatter.maturity === "evergreen").length)
      ];
    }
    case "review": {
      const weekStart = startOfWeek();
      return [
        card("📄", t.labels.createdThisWeek, groups.resources.filter((record) => record.file.stat.ctime >= weekStart).length),
        card("✏️", t.labels.updatedThisWeek, groups.resources.filter((record) => record.file.stat.mtime >= weekStart).length),
        card("🌟", "Fleeting", groups.fleeting.filter((record) => record.file.stat.ctime >= weekStart).length),
        card("📚", "Literature", groups.literature.filter((record) => record.file.stat.ctime >= weekStart).length),
        card("🧠", "Permanent", groups.permanent.filter((record) => record.file.stat.ctime >= weekStart).length)
      ];
    }
  }
}

function dashboardRecordGroups(records: FileRecord[], settings: ParaZkSettings): {
  projects: FileRecord[];
  areas: FileRecord[];
  resources: FileRecord[];
  fleeting: FileRecord[];
  literature: FileRecord[];
  permanent: FileRecord[];
} {
  return {
    projects: records.filter((record) => record.frontmatter.type === "project" && isInFolder(record.file, settings.paths.projectsFolder)),
    areas: records.filter((record) => record.frontmatter.type === "area" && isInFolder(record.file, settings.paths.areasFolder)),
    resources: records.filter((record) => record.frontmatter.type === "resource" && isInFolder(record.file, settings.paths.resourcesFolder)),
    fleeting: records.filter((record) => isInFolder(record.file, settings.paths.fleetingFolder) && !isInFolder(record.file, settings.paths.fleetingArchiveFolder)),
    literature: records.filter((record) => isInFolder(record.file, settings.paths.literatureFolder)),
    permanent: records.filter((record) => isInFolder(record.file, settings.paths.permanentFolder))
  };
}

function vaultRecords(app: App): FileRecord[] {
  return app.vault.getMarkdownFiles().map((file) => ({
    file,
    frontmatter: (app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Record<string, unknown>
  }));
}

function card(emoji: string, label: string, value: number, sub?: string): SummaryCard {
  return { emoji, label, value, sub };
}

function isInFolder(file: TFile, folder: string): boolean {
  const normalized = normalizeVaultPath(folder);
  return file.path === normalized || file.path.startsWith(`${normalized}/`);
}

function projectLinksToArea(project: FileRecord, area: FileRecord): boolean {
  return frontmatterLinks(project.frontmatter.areas).some((link) => linkMatchesFile(link, area.file));
}

function linkMatchesFile(value: string, file: TFile): boolean {
  const target = wikiTarget(value);
  return target === file.path
    || target === file.basename
    || target === file.path.replace(/\.md$/i, "");
}

function wikiTarget(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^\[\[(.*?)(?:\|.*?)?\]\]$/);
  return normalizeVaultPath((match?.[1] ?? trimmed).replace(/\.md$/i, ""));
}

function inlinkPaths(app: App, file: TFile): string[] {
  const resolvedLinks = (app.metadataCache as unknown as {
    resolvedLinks?: Record<string, Record<string, number | undefined> | undefined>;
  }).resolvedLinks;
  if (!resolvedLinks) return [];

  return Object.entries(resolvedLinks)
    .filter(([, targets]) => Boolean(targets?.[file.path]))
    .map(([source]) => source);
}

function dueWithin(record: FileRecord, minDays: number, maxDays: number): boolean {
  const due = dateDay(record.frontmatter.due_date);
  const today = startOfToday();
  return due >= today + days(minDays) && due <= today + days(maxDays);
}

function hasDate(value: unknown): boolean {
  return !Number.isNaN(dateDay(value));
}

function dateDay(value: unknown): number {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  if (typeof value === "object" && value !== null && "toMillis" in value && typeof value.toMillis === "function") {
    return dateDay(value.toMillis());
  }

  const text = readText(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return Number.NaN;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
}

function startOfToday(): number {
  const date = new Date();
  return date.setHours(0, 0, 0, 0);
}

function startOfWeek(): number {
  const date = new Date();
  const day = (date.getDay() + 6) % 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day);
  return date.getTime();
}

function days(value: number): number {
  return value * 24 * 60 * 60 * 1000;
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseSummaryType(value: string | undefined): DashboardSummaryType | undefined {
  const token = value?.trim();
  if (
    token === "home"
    || token === "projects"
    || token === "areas"
    || token === "resources"
    || token === "zk"
    || token === "review"
  ) return token;
  return undefined;
}

function parseCodeBlockKeyValues(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/);
    if (match) result[match[1]] = match[2];
  }
  return result;
}
