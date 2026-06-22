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
  bufferInitial?: boolean;
  preserveCurrent?: boolean;
};

const DATAVIEW_CHANGE_RERENDER_DELAY_MS = 300;
const DATAVIEW_BUFFER_SETTLE_TIMEOUT_MS = 2500;
const DATAVIEW_INITIAL_BUFFER_SETTLE_TIMEOUT_MS = 700;

// Renders a compact `para-zk-view` block by expanding its view key into a
// managed Dataview query. The source path is passed so the query's `this.file`
// resolves to the host note.
export function registerDataviewViewRenderers(plugin: ParaZkPluginContext): void {
  plugin.registerMarkdownCodeBlockProcessor("para-zk-view", (source, el, ctx) => {
    ctx.addChild(new DataviewViewRenderChild(plugin, el, readViewArgs(source), ctx.sourcePath));
  });
}

class DataviewViewRenderChild extends MarkdownRenderChild {
  private renderTimer: number | undefined;
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
    this.renderNow({ bufferInitial: true });
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
    const renamedCurrentSource = oldPath !== undefined && oldPath === this.currentSourcePath;
    if (renamedCurrentSource) this.currentSourcePath = file.path;
    if (!renamedCurrentSource && file.extension !== "md") return;
    this.scheduleRender();
  }

  private scheduleRender(): void {
    if (this.renderTimer !== undefined) window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = undefined;
      this.renderNow({ preserveCurrent: true });
    }, DATAVIEW_CHANGE_RERENDER_DELAY_MS);
  }

  private renderNow(options: DataviewRenderOptions = {}): void {
    if (this.unloaded) return;
    const generation = ++this.renderGeneration;
    void renderDataviewView(
      this.plugin,
      this.args,
      this.containerEl,
      this.currentSourcePath,
      this,
      () => this.isCurrentRender(generation),
      options
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
  isCurrent: () => boolean,
  options: DataviewRenderOptions = {}
): Promise<void> {
  if (!isCurrent()) return;
  if (options.preserveCurrent && hasSettledDataviewRender(el)) {
    await renderDataviewViewBuffered(plugin, args, el, sourcePath, child, isCurrent, {
      replaceUnsettled: false,
      timeoutMs: DATAVIEW_BUFFER_SETTLE_TIMEOUT_MS
    });
    return;
  }
  if (options.bufferInitial) {
    await renderDataviewViewBuffered(plugin, args, el, sourcePath, child, isCurrent, {
      replaceUnsettled: true,
      timeoutMs: DATAVIEW_INITIAL_BUFFER_SETTLE_TIMEOUT_MS
    });
    return;
  }

  await renderDataviewViewInto(plugin, args, el, sourcePath, child);
  if (!isCurrent()) return;
}

async function renderDataviewViewBuffered(
  plugin: ParaZkPluginContext,
  args: DataviewViewArgs,
  el: HTMLElement,
  sourcePath: string | undefined,
  child: MarkdownRenderChild,
  isCurrent: () => boolean,
  options: { replaceUnsettled: boolean; timeoutMs: number }
): Promise<void> {
  const buffer = el.ownerDocument.createElement("div");
  buffer.addClass("para-zk-view-buffer");
  buffer.style.position = "absolute";
  buffer.style.left = "-100000px";
  buffer.style.top = "0";
  buffer.style.width = `${Math.max(1, Math.round(el.getBoundingClientRect().width))}px`;
  buffer.style.pointerEvents = "none";
  buffer.style.opacity = "0";
  buffer.setAttribute("aria-hidden", "true");
  el.after(buffer);

  try {
    await renderDataviewViewInto(plugin, args, buffer, sourcePath, child);
    await waitForSettledDataviewRender(buffer, isCurrent, options.timeoutMs);
    if (!isCurrent()) return;
    if (!hasSettledDataviewRender(buffer) && !options.replaceUnsettled) return;
    replaceDataviewView(el, buffer);
  } finally {
    buffer.remove();
  }
}

async function renderDataviewViewInto(
  plugin: ParaZkPluginContext,
  args: DataviewViewArgs,
  el: HTMLElement,
  sourcePath: string | undefined,
  child: MarkdownRenderChild
): Promise<void> {
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

function replaceDataviewView(el: HTMLElement, rendered: HTMLElement): void {
  for (const className of Array.from(el.classList)) {
    if (className === "para-zk-block" || className.startsWith("para-zk-block--")) {
      el.removeClass(className);
    }
  }
  for (const className of Array.from(rendered.classList)) {
    if (className === "para-zk-block" || className.startsWith("para-zk-block--")) {
      el.addClass(className);
    }
  }
  el.replaceChildren(...Array.from(rendered.childNodes));
}

function waitForSettledDataviewRender(
  el: HTMLElement,
  isCurrent: () => boolean,
  timeoutMs: number
): Promise<void> {
  if (hasSettledDataviewRender(el) || !isCurrent()) return Promise.resolve();

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      observer.disconnect();
      resolve();
    }, timeoutMs);
    const observer = new MutationObserver(() => {
      if (!isCurrent() || hasSettledDataviewRender(el)) {
        window.clearTimeout(timer);
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(el, { childList: true, subtree: true });
  });
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
