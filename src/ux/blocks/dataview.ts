import {
  MarkdownRenderChild,
  MarkdownRenderer,
  TFile,
  type MarkdownPostProcessorContext
} from "obsidian";
import type { ParaZkPluginContext } from "../../plugin-interface";
import { DATAVIEW_VIEW_KEYS, dataviewViewBlock, type DataviewViewKey } from "../../templates";
import {
  renderBlockNotice,
  renderBlockShell
} from "./shell";
import { parseCodeBlockKeyValues } from "../code-block-args";

type DataviewViewArgs = {
  key: string;
  title?: string;
};

type DataviewRenderOptions = {
  onlyIfUnsettled?: boolean;
};

const DATAVIEW_INITIAL_RERENDER_DELAYS_MS = [1600, 3600] as const;
const DATAVIEW_CHANGE_RERENDER_DELAYS_MS = [300, 3200] as const;

// Renders a compact `para-zk-view` block by expanding its view key into a
// managed Dataview query. The source path is passed so the query's `this.file`
// resolves to the host note.
export function registerDataviewViewRenderers(plugin: ParaZkPluginContext): void {
  plugin.registerMarkdownCodeBlockProcessor("para-zk-view", (source, el, ctx) => {
    ctx.addChild(new DataviewViewRenderChild(plugin, el, readViewArgs(source), ctx.sourcePath));
  });
}

class DataviewViewRenderChild extends MarkdownRenderChild {
  private readonly renderTimers = new Set<number>();
  private renderGeneration = 0;
  private unloaded = true;
  private currentSourcePath: string | undefined;

  constructor(
    private readonly plugin: ParaZkPluginContext,
    containerEl: HTMLElement,
    private readonly args: DataviewViewArgs,
    sourcePath: MarkdownPostProcessorContext["sourcePath"]
  ) {
    super(containerEl);
    this.currentSourcePath = sourcePath;
  }

  onload(): void {
    this.unloaded = false;
    this.renderNow();
    for (const delay of DATAVIEW_INITIAL_RERENDER_DELAYS_MS) {
      this.scheduleRender(delay, { onlyIfUnsettled: true });
    }
    this.registerEvent(this.plugin.app.vault.on("modify", (file) => this.onVaultFile(file)));
    this.registerEvent(this.plugin.app.vault.on("create", (file) => this.onVaultFile(file)));
    this.registerEvent(this.plugin.app.vault.on("delete", (file) => this.onVaultFile(file)));
    this.registerEvent(this.plugin.app.vault.on("rename", (file, oldPath) => this.onVaultFile(file, oldPath)));
  }

  onunload(): void {
    this.unloaded = true;
    this.renderGeneration += 1;
    for (const timer of this.renderTimers) window.clearTimeout(timer);
    this.renderTimers.clear();
  }

  private onVaultFile(file: unknown, oldPath?: string): void {
    if (!(file instanceof TFile)) return;
    const renamedCurrentSource = oldPath !== undefined && oldPath === this.currentSourcePath;
    if (renamedCurrentSource) this.currentSourcePath = file.path;
    if (!renamedCurrentSource && file.extension !== "md") return;
    for (const delay of DATAVIEW_CHANGE_RERENDER_DELAYS_MS) this.scheduleRender(delay);
  }

  private scheduleRender(delayMs: number, options: DataviewRenderOptions = {}): void {
    const timer = window.setTimeout(() => {
      this.renderTimers.delete(timer);
      if (options.onlyIfUnsettled && hasSettledDataviewRender(this.containerEl)) return;
      this.renderNow();
    }, delayMs);
    this.renderTimers.add(timer);
  }

  private renderNow(): void {
    if (this.unloaded) return;
    const generation = ++this.renderGeneration;
    void renderDataviewView(
      this.plugin,
      this.args,
      this.containerEl,
      this.currentSourcePath,
      this,
      () => this.isCurrentRender(generation)
    )
      .catch((error: unknown) => {
        if (this.isCurrentRender(generation)) renderDataviewViewError(this.containerEl, error);
      });
  }

  private isCurrentRender(generation: number): boolean {
    return !this.unloaded && this.renderGeneration === generation;
  }
}

async function renderDataviewView(
  plugin: ParaZkPluginContext,
  args: DataviewViewArgs,
  el: HTMLElement,
  sourcePath: string | undefined,
  child: MarkdownRenderChild,
  isCurrent: () => boolean
): Promise<void> {
  if (!isCurrent()) return;
  const key = args.key;

  el.empty();
  if (!isDataviewViewKey(key)) {
    renderBlockNotice(el, viewBlockKind(key), `Unknown PARA-ZK view: ${key || "(empty)"}`);
    return Promise.resolve();
  }

  const block = dataviewViewBlock(key, plugin.settings, sourcePath);
  if (!block) {
    renderBlockNotice(el, viewBlockKind(key), `Unknown PARA-ZK view: ${key || "(empty)"}`);
    return Promise.resolve();
  }

  const body = renderDataviewViewShell(el, key, args.title);
  await MarkdownRenderer.render(plugin.app, block, body, sourcePath ?? "", child);
  if (!isCurrent()) return;
}

function readViewArgs(source: string): DataviewViewArgs {
  const raw = parseCodeBlockKeyValues(source);
  return {
    key: raw.key?.trim() ?? "",
    title: raw.title?.trim() || undefined
  };
}

function renderDataviewViewError(el: HTMLElement, error: unknown): void {
  renderBlockNotice(el, "view", error instanceof Error ? error.message : String(error));
}

function renderDataviewViewShell(
  el: HTMLElement,
  rawKey: string,
  title?: string
): HTMLElement {
  const titleText = title?.trim();
  return renderBlockShell(el, {
    kind: viewBlockKind(rawKey),
    title: titleText
  }).body;
}

function hasSettledDataviewRender(el: HTMLElement): boolean {
  const dataview = el.querySelector<HTMLElement>(".block-language-dataview");
  if (!dataview) return false;

  const text = dataview.textContent?.trim() ?? "";
  if (!text || text === "Loading...") return false;

  const loadingError = dataview.querySelector<HTMLElement>(".dataview-error")
    ?.textContent
    ?.trim();
  return loadingError !== "Loading...";
}

function isDataviewViewKey(key: string): key is DataviewViewKey {
  return DATAVIEW_VIEW_KEYS.includes(key as DataviewViewKey);
}

function viewClassName(key: string): string {
  return key.toLocaleLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}

function viewBlockKind(key: string): string {
  const className = key ? viewClassName(key) : "";
  return className ? `view-${className}` : "view";
}
