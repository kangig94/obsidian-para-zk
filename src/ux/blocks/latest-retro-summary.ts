import {
  MarkdownRenderChild,
  TFile,
  parseYaml
} from "obsidian";
import { localePack, type LocalePack } from "../../i18n";
import { PARA_ZK_PATHS } from "../../layout";
import type { ParaZkPluginContext } from "../../plugin-interface";
import { isRecord } from "../../records";
import { normalizeVaultPath } from "../../vault/paths";

type RetroSummary = {
  file: TFile;
  text: string;
  time: number;
};

const RERENDER_DELAY_MS = 120;

export function registerLatestRetroSummaryRenderers(plugin: ParaZkPluginContext): void {
  plugin.registerMarkdownCodeBlockProcessor("para-zk-latest-retro-summary", (_source, el, ctx) => {
    ctx.addChild(new LatestRetroSummaryRenderChild(plugin, el, ctx.sourcePath));
  });
}

class LatestRetroSummaryRenderChild extends MarkdownRenderChild {
  private renderTimer: number | undefined;
  private renderGeneration = 0;
  private unloaded = true;
  private currentSourcePath: string | undefined;

  constructor(
    private readonly plugin: ParaZkPluginContext,
    containerEl: HTMLElement,
    sourcePath: string | undefined
  ) {
    super(containerEl);
    this.currentSourcePath = sourcePath;
  }

  onload(): void {
    this.unloaded = false;
    this.renderNow();
    this.registerEvent(this.plugin.app.vault.on("modify", (file) => this.onVaultFile(file)));
    this.registerEvent(this.plugin.app.vault.on("create", (file) => this.onVaultFile(file)));
    this.registerEvent(this.plugin.app.vault.on("delete", (file) => this.onVaultFile(file)));
    this.registerEvent(this.plugin.app.vault.on("rename", (file, oldPath) => this.onVaultFile(file, oldPath)));
  }

  onunload(): void {
    this.unloaded = true;
    this.renderGeneration += 1;
    if (this.renderTimer !== undefined) window.clearTimeout(this.renderTimer);
    this.renderTimer = undefined;
  }

  private onVaultFile(file: unknown, oldPath?: string): void {
    if (!(file instanceof TFile)) return;
    if (oldPath !== undefined && oldPath === this.currentSourcePath) this.currentSourcePath = file.path;
    if (
      file.path !== this.currentSourcePath
      && !isInRetrosFolder(this.plugin, file)
      && !isInRetrosFolderPath(this.plugin, oldPath)
    ) return;
    this.scheduleRender();
  }

  private scheduleRender(): void {
    if (this.renderTimer !== undefined) window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = undefined;
      this.renderNow();
    }, RERENDER_DELAY_MS);
  }

  private renderNow(): void {
    if (this.unloaded) return;
    const generation = ++this.renderGeneration;
    void renderLatestRetroSummary(
      this.plugin,
      this.containerEl,
      this.currentSourcePath,
      () => this.isCurrentRender(generation)
    )
      .catch((error: unknown) => {
        if (this.isCurrentRender(generation)) renderLatestRetroSummaryError(this.containerEl, error);
      });
  }

  private isCurrentRender(generation: number): boolean {
    return !this.unloaded && this.renderGeneration === generation;
  }
}

async function renderLatestRetroSummary(
  plugin: ParaZkPluginContext,
  el: HTMLElement,
  sourcePath: string | undefined,
  isCurrent: () => boolean
): Promise<void> {
  if (!isCurrent()) return;
  el.empty();
  el.addClass("para-zk-latest-retro-summary");

  const labels = localePack(plugin.settings.locale);
  if (!sourcePath) {
    if (!isCurrent()) return;
    renderLatestRetroSummaryShell(el, labels, latestRetroSummaryEmpty(labels));
    return;
  }

  const sourceFile = plugin.app.vault.getFileByPath(sourcePath);
  if (!(sourceFile instanceof TFile)) {
    if (!isCurrent()) return;
    renderLatestRetroSummaryShell(el, labels, latestRetroSummaryEmpty(labels));
    return;
  }

  const summary = await latestRetroSummary(plugin, sourceFile);
  if (!isCurrent()) return;
  renderLatestRetroSummaryShell(el, labels, summary?.text || latestRetroSummaryEmpty(labels), summary?.file);
}

function renderLatestRetroSummaryShell(
  el: HTMLElement,
  labels: LocalePack,
  text: string,
  file?: TFile
): void {
  const title = el.createDiv({ cls: "para-zk-latest-retro-summary-title", text: latestRetroSummaryTitle(labels) });
  if (file) title.setAttr("title", file.path);
  el.createDiv({
    cls: file ? "para-zk-latest-retro-summary-body" : "para-zk-latest-retro-summary-body is-empty",
    text
  });
}

async function latestRetroSummary(plugin: ParaZkPluginContext, sourceFile: TFile): Promise<RetroSummary | undefined> {
  const headingCandidates = retroSummaryHeadingCandidates();
  const matches: RetroSummary[] = [];

  for (const file of plugin.app.vault.getMarkdownFiles()) {
    if (!isInRetrosFolder(plugin, file)) continue;

    const content = await plugin.app.vault.read(file);
    const frontmatter = frontmatterFromContent(content);
    if (String(frontmatter.type ?? "").toLowerCase() !== "retro") continue;
    if (!retroProjectMatches(frontmatter, sourceFile)) continue;

    const text = readSection(content, headingCandidates);
    if (!text) continue;

    matches.push({
      file,
      text,
      time: retroSortTime(file, frontmatter)
    });
  }

  return matches.sort((left, right) => right.time - left.time || right.file.path.localeCompare(left.file.path))[0];
}

function isInRetrosFolder(plugin: ParaZkPluginContext, file: TFile): boolean {
  return isInRetrosFolderPath(plugin, file.path);
}

function isInRetrosFolderPath(plugin: ParaZkPluginContext, path: string | undefined): boolean {
  if (!path) return false;
  const retroFolder = normalizeVaultPath(PARA_ZK_PATHS.retrosFolder);
  const normalized = normalizeVaultPath(path);
  return normalized === retroFolder || normalized.startsWith(`${retroFolder}/`);
}

function retroProjectMatches(frontmatter: Record<string, unknown>, sourceFile: TFile): boolean {
  const targets = linkTargets(frontmatter.project);
  if (targets.length === 0) return false;

  const sourceTargets = sourceFileTargets(sourceFile);
  return targets.some((target) => sourceTargets.has(target));
}

function retroSortTime(file: TFile, frontmatter: Record<string, unknown>): number {
  const date = dateTime(frontmatter.date);
  return Number.isFinite(date) ? date : file.stat.ctime;
}

function sourceFileTargets(file: TFile): Set<string> {
  return new Set([
    normalizeVaultPath(file.path),
    normalizeVaultPath(file.path.replace(/\.md$/i, "")),
    normalizeVaultPath(file.basename)
  ]);
}

function linkTargets(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(linkTargets);
  if (typeof value === "string") return targetCandidates(value);
  if (isRecord(value) && typeof value.path === "string") return targetCandidates(value.path);
  return [];
}

function targetCandidates(value: string): string[] {
  const target = wikiTarget(value) ?? markdownLinkTarget(value) ?? value;
  const normalized = normalizeVaultPath(stripSubpath(target));
  if (!normalized) return [];
  return [
    normalized,
    normalizeVaultPath(normalized.replace(/\.md$/i, "")),
    normalizeVaultPath(normalized.split("/").pop()?.replace(/\.md$/i, "") ?? "")
  ].filter(Boolean);
}

function wikiTarget(value: string): string | undefined {
  return value.trim().match(/^\[\[(.*?)(?:\|.*?)?\]\]$/)?.[1];
}

function markdownLinkTarget(value: string): string | undefined {
  return value.trim().match(/^\[.*?\]\((.*?)\)$/)?.[1];
}

function stripSubpath(value: string): string {
  const hashIndex = value.indexOf("#");
  return hashIndex === -1 ? value : value.slice(0, hashIndex);
}

function readSection(content: string, headings: string[]): string {
  const body = stripYamlFrontmatter(content);
  for (const heading of headings) {
    const section = readSectionByHeading(body, heading);
    if (section) return section;
  }
  return "";
}

function readSectionByHeading(content: string, heading: string): string | undefined {
  const headerRe = new RegExp(`^\\s*(?<hashes>#{1,6})\\s+${escapeRegExp(heading).replace(/\s+/g, "\\s+")}(?=\\s|$).*?$`, "im");
  const match = content.match(headerRe);
  if (!match) return undefined;

  const level = match.groups?.hashes.length ?? 6;
  const headerEnd = (match.index ?? 0) + match[0].length;
  const sectionStart = content.charAt(headerEnd) === "\n" ? headerEnd + 1 : headerEnd;
  const after = content.slice(sectionStart);
  const nextBoundary = after.search(new RegExp(`^\\s*#{1,${level}}\\s+|^\\s*(?:-{3,}|\\*{3,}|_{3,})\\s*$`, "m"));
  const sectionEnd = nextBoundary === -1 ? content.length : sectionStart + nextBoundary;
  return trimMarkdownBlock(content.slice(sectionStart, sectionEnd));
}

function retroSummaryHeadingCandidates(): string[] {
  return uniqueStrings([
    localePack("en").labels.retroSummary,
    localePack("ko").labels.retroSummary
  ]);
}

function latestRetroSummaryTitle(labels: LocalePack): string {
  return labels.locale === "ko" ? "최근 회고 요약" : "Latest retro summary";
}

function latestRetroSummaryEmpty(labels: LocalePack): string {
  return labels.locale === "ko" ? "아직 회고 요약이 없습니다." : "No retro summary yet.";
}

function dateTime(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) return new Date(value).getTime();
  if (isRecord(value) && typeof value.toMillis === "function") return Number(value.toMillis());
  return Number.NaN;
}

function stripYamlFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? content.slice(match[0].length) : content;
}

function frontmatterFromContent(content: string): Record<string, unknown> {
  const match = content.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return {};

  try {
    const parsed = parseYaml(match[1]);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function trimMarkdownBlock(value: string): string {
  return value
    .replace(/^(?:[ \t]*\n)+/, "")
    .replace(/(?:\n[ \t]*)+$/, "");
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderLatestRetroSummaryError(el: HTMLElement, error: unknown): void {
  el.empty();
  el.addClass("para-zk-latest-retro-summary", "is-error");
  el.createDiv({
    cls: "para-zk-latest-retro-summary-body is-empty",
    text: error instanceof Error ? error.message : String(error)
  });
}
