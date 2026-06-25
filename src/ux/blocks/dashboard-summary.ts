import { MarkdownRenderChild, TFile, type App } from "obsidian";
import { localePack } from "../../i18n";
import { PARA_ZK_PATHS } from "../../layout";
import type { ParaZkPluginContext } from "../../plugin-interface";
import type { ParaZkSettings } from "../../types";
import { frontmatterLinks } from "../../vault/frontmatter";
import { normalizeVaultPath } from "../../vault/paths";
import { parseCodeBlockKeyValues } from "../code-block-args";

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

const DASHBOARD_SUMMARY_RERENDER_DELAY_MS = 120;

export function registerDashboardSummaryRenderers(plugin: ParaZkPluginContext): void {
  plugin.registerMarkdownCodeBlockProcessor("para-zk-dashboard-summary", (source, el, ctx) => {
    ctx.addChild(new DashboardSummaryRenderChild(plugin, source, el));
  });
}

// The cards aggregate the whole vault, so a dashboard open in another tab went stale until
// reopened. A count moves only when a file under a counted root (the PARA folders, ZK, and
// LLM-Wiki — counts plus reverse links from those into resources) is created / removed / moved,
// or its frontmatter (type / processed / maturity / links) changes. Edits elsewhere cannot move
// a card, so they are filtered out to avoid needless flicker — notably toggling a dashboard task
// writes its tasks-folder shard, which used to re-render the cards. Refresh is debounced so a
// burst costs one scan; `metadataCache "changed"` is the post-parse signal for cache-read
// counts, and `renderDashboardSummary` is synchronous so no generation guard is needed.
// Mirrors the reference / retro-summary renderers' subscription.
class DashboardSummaryRenderChild extends MarkdownRenderChild {
  private readonly plugin: ParaZkPluginContext;
  private readonly source: string;
  private renderTimer: number | undefined;

  constructor(
    plugin: ParaZkPluginContext,
    source: string,
    containerEl: HTMLElement
  ) {
    super(containerEl);
    this.plugin = plugin;
    this.source = source;
  }

  onload(): void {
    renderDashboardSummary(this.plugin, this.source, this.containerEl);
    this.registerEvent(this.plugin.app.vault.on("create", (file) => this.onChange(file)));
    this.registerEvent(this.plugin.app.vault.on("delete", (file) => this.onChange(file)));
    this.registerEvent(this.plugin.app.vault.on("rename", (file, oldPath) => this.onChange(file, oldPath)));
    this.registerEvent(this.plugin.app.metadataCache.on("changed", (file) => this.onChange(file)));
  }

  onunload(): void {
    if (this.renderTimer !== undefined) window.clearTimeout(this.renderTimer);
    this.renderTimer = undefined;
  }

  private onChange(file: unknown, oldPath?: string): void {
    if (!(file instanceof TFile)) return;
    if (!this.affectsSummary(file.path) && !this.affectsSummary(oldPath)) return;
    this.scheduleRender();
  }

  // A change feeds a count only under a counted root; anything else — task shards above all —
  // never moves a card, so it must not trigger a re-render.
  private affectsSummary(path: string | undefined): boolean {
    if (!path) return false;
    const normalized = normalizeVaultPath(path);
    return [
      PARA_ZK_PATHS.projectsFolder,
      PARA_ZK_PATHS.areasFolder,
      PARA_ZK_PATHS.resourcesFolder,
      PARA_ZK_PATHS.sparkFolder,
      PARA_ZK_PATHS.digestFolder,
      PARA_ZK_PATHS.permanentFolder,
      PARA_ZK_PATHS.wikiFolder,
      PARA_ZK_PATHS.zkFolder
    ].some((folder) => {
      const root = normalizeVaultPath(folder);
      return normalized === root || normalized.startsWith(`${root}/`);
    });
  }

  private scheduleRender(): void {
    if (this.renderTimer !== undefined) window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = undefined;
      renderDashboardSummary(this.plugin, this.source, this.containerEl);
    }, DASHBOARD_SUMMARY_RERENDER_DELAY_MS);
  }
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
        card("🌟", "Spark", groups.spark.length),
        card("📚", "Digest", groups.digest.length),
        card("🧠", "Permanent", groups.permanent.length),
        card("📖", t.labels.llmWiki, groups.wiki.length)
      ];
    case "projects": {
      const today = startOfToday();
      const withDue = groups.projects.filter((record) => hasDate(record.frontmatter.due_date));
      const active = groups.projects.filter((record) => readText(record.frontmatter.status) !== "done").length;
      return [
        card("📦", t.labels.total, groups.projects.length),
        card("🟣", t.labels.active, active),
        card("📅", t.labels.dueToday, withDue.filter((record) => dateDay(record.frontmatter.due_date) === today).length),
        card("⏰", t.labels.overdue, withDue.filter((record) => dateDay(record.frontmatter.due_date) < today).length),
        card("🗓️", t.labels.dueSoon7, withDue.filter((record) => dueWithin(record, 0, 7)).length),
        card("📆", t.labels.dueSoon30, withDue.filter((record) => dueWithin(record, 8, 30)).length)
      ];
    }
    case "areas": {
      const linkedAreaTargets = projectAreaLinkTargets(groups.projects);
      const linkedAreas = groups.areas.filter((area) => linkTargetsIncludeFile(linkedAreaTargets, area.file));
      return [
        card("📦", t.labels.total, groups.areas.length),
        card("🔗", t.labels.dashboardProjects, linkedAreas.length)
      ];
    }
    case "resources": {
      const reverseLinks = reverseLinkIndex(plugin.app);
      const projectSourcePrefix = `${normalizeVaultPath(PARA_ZK_PATHS.projectsFolder)}/`;
      const areaSourcePrefix = `${normalizeVaultPath(PARA_ZK_PATHS.areasFolder)}/`;
      const zkSourcePrefix = `${normalizeVaultPath(PARA_ZK_PATHS.zkFolder)}/`;
      const inUse = groups.resources.filter((resource) => {
        const inlinks = reverseLinks.get(resource.file.path) ?? [];
        return inlinks.some((path) => path.startsWith(projectSourcePrefix) || path.startsWith(areaSourcePrefix));
      });
      const inUseSet = new Set(inUse);
      const free = groups.resources.filter((resource) => !inUseSet.has(resource));
      const orphan = groups.resources.filter((resource) => (reverseLinks.get(resource.file.path) ?? []).length === 0);
      const zkReferenced = groups.resources.filter((resource) => (reverseLinks.get(resource.file.path) ?? []).some((path) => {
        return path.startsWith(zkSourcePrefix);
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
      const stale = groups.spark.filter((record) => record.file.stat.ctime <= Date.now() - days(7));
      return [
        card("🌟", "Spark", groups.spark.length, `${t.labels.staleSpark} ${stale.length}`),
        card("📚", "Digest", groups.digest.length),
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
        card("🌟", "Spark", groups.spark.filter((record) => record.file.stat.ctime >= weekStart).length),
        card("📚", "Digest", groups.digest.filter((record) => record.file.stat.ctime >= weekStart).length),
        card("🧠", "Permanent", groups.permanent.filter((record) => record.file.stat.ctime >= weekStart).length)
      ];
    }
  }
}

function dashboardRecordGroups(records: FileRecord[], settings: ParaZkSettings): {
  projects: FileRecord[];
  areas: FileRecord[];
  resources: FileRecord[];
  spark: FileRecord[];
  digest: FileRecord[];
  permanent: FileRecord[];
  wiki: FileRecord[];
} {
  return {
    projects: records.filter((record) => record.frontmatter.type === "project" && isInFolder(record.file, PARA_ZK_PATHS.projectsFolder)),
    areas: records.filter((record) => record.frontmatter.type === "area" && isInFolder(record.file, PARA_ZK_PATHS.areasFolder)),
    resources: records.filter((record) => record.frontmatter.type === "resource" && isInFolder(record.file, PARA_ZK_PATHS.resourcesFolder)),
    spark: records.filter((record) => isInFolder(record.file, PARA_ZK_PATHS.sparkFolder) && record.frontmatter.processed !== true),
    digest: records.filter((record) => isInFolder(record.file, PARA_ZK_PATHS.digestFolder)),
    permanent: records.filter((record) => isInFolder(record.file, PARA_ZK_PATHS.permanentFolder)),
    wiki: records.filter((record) => record.frontmatter.type === "llm-wiki" && isInFolder(record.file, PARA_ZK_PATHS.wikiFolder))
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

function projectAreaLinkTargets(projects: FileRecord[]): Set<string> {
  const targets = new Set<string>();
  for (const project of projects) {
    for (const link of frontmatterLinks(project.frontmatter.areas)) {
      targets.add(wikiTarget(link));
    }
  }
  return targets;
}

function linkTargetsIncludeFile(targets: Set<string>, file: TFile): boolean {
  return targets.has(file.path)
    || targets.has(file.basename)
    || targets.has(file.path.replace(/\.md$/i, ""));
}

function wikiTarget(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^\[\[(.*?)(?:\|.*?)?\]\]$/);
  return normalizeVaultPath((match?.[1] ?? trimmed).replace(/\.md$/i, ""));
}

function reverseLinkIndex(app: App): Map<string, string[]> {
  const resolvedLinks = (app.metadataCache as unknown as {
    resolvedLinks?: Record<string, Record<string, number | undefined> | undefined>;
  }).resolvedLinks;
  const index = new Map<string, string[]>();
  if (!resolvedLinks) return index;

  for (const [source, targets] of Object.entries(resolvedLinks)) {
    if (!targets) continue;
    for (const [targetPath, count] of Object.entries(targets)) {
      if (!count) continue;
      const inlinks = index.get(targetPath);
      if (inlinks) {
        inlinks.push(source);
      } else {
        index.set(targetPath, [source]);
      }
    }
  }
  return index;
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

  if (hasToMillis(value)) {
    return dateDay(value.toMillis());
  }

  const text = readText(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return Number.NaN;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
}

function hasToMillis(value: unknown): value is { toMillis: () => unknown } {
  const candidate = value as { toMillis?: unknown } | null;
  return typeof candidate?.toMillis === "function";
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
