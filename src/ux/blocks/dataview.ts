import {
  MarkdownRenderChild,
  MarkdownRenderer,
  TFile
} from "obsidian";
import type { ParaZkPluginContext } from "../../plugin-interface";
import { DATAVIEW_VIEW_KEYS, dataviewViewBlock, type DataviewViewKey } from "../../templates";
import {
  renderBlockNotice,
  renderBlockShell
} from "./shell";

export type DataviewViewArgs = {
  key: string;
  title?: string;
};

type DataviewViewActionRenderer = (actions: HTMLElement) => void;

type DataviewRenderOptions = {
  bufferInitial?: boolean;
  preserveCurrent?: boolean;
};

type DataviewRenderExpectation = {
  headers: string[];
};

const DATAVIEW_CHANGE_RERENDER_DELAY_MS = 300;
const DATAVIEW_BUFFER_SETTLE_TIMEOUT_MS = 2500;
const DATAVIEW_INITIAL_BUFFER_SETTLE_TIMEOUT_MS = 700;

export class DataviewViewRenderChild extends MarkdownRenderChild {
  private readonly plugin: ParaZkPluginContext;
  private readonly args: DataviewViewArgs;
  private readonly renderActions?: DataviewViewActionRenderer;
  private renderTimer: number | undefined;
  private renderGeneration = 0;
  private unloaded = true;
  private currentSourcePath: string | undefined;

  constructor(
    plugin: ParaZkPluginContext,
    containerEl: HTMLElement,
    args: DataviewViewArgs,
    sourcePath: string | undefined,
    renderActions?: DataviewViewActionRenderer
  ) {
    super(containerEl);
    this.plugin = plugin;
    this.args = args;
    this.currentSourcePath = sourcePath;
    this.renderActions = renderActions;
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
      this.renderActions,
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
  renderActions?: DataviewViewActionRenderer,
  options: DataviewRenderOptions = {}
): Promise<void> {
  if (!isCurrent()) return;
  if (options.preserveCurrent && hasSettledDataviewRender(el)) {
    await renderDataviewViewBuffered(plugin, args, el, sourcePath, child, isCurrent, renderActions, {
      replaceUnsettled: false,
      timeoutMs: DATAVIEW_BUFFER_SETTLE_TIMEOUT_MS
    });
    return;
  }
  if (options.bufferInitial) {
    await renderDataviewViewBuffered(plugin, args, el, sourcePath, child, isCurrent, renderActions, {
      replaceUnsettled: true,
      timeoutMs: DATAVIEW_INITIAL_BUFFER_SETTLE_TIMEOUT_MS
    });
    return;
  }

  await renderDataviewViewInto(plugin, args, el, sourcePath, child, renderActions);
  if (!isCurrent()) return;
}

async function renderDataviewViewBuffered(
  plugin: ParaZkPluginContext,
  args: DataviewViewArgs,
  el: HTMLElement,
  sourcePath: string | undefined,
  child: MarkdownRenderChild,
  isCurrent: () => boolean,
  renderActions: DataviewViewActionRenderer | undefined,
  options: { replaceUnsettled: boolean; timeoutMs: number }
): Promise<void> {
  const buffer = el.ownerDocument.createElement("div");
  buffer.addClass("para-zk-view-buffer");
  buffer.setCssProps({
    "--para-zk-buffer-width": `${Math.max(1, Math.round(el.getBoundingClientRect().width))}px`
  });
  buffer.setAttribute("aria-hidden", "true");
  el.after(buffer);

  try {
    const expectation = await renderDataviewViewInto(plugin, args, buffer, sourcePath, child, renderActions);
    await waitForSettledDataviewRender(buffer, isCurrent, options.timeoutMs, expectation);
    if (!isCurrent()) return;
    if (!hasSettledDataviewRender(buffer, expectation) && !options.replaceUnsettled) return;
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
  child: MarkdownRenderChild,
  renderActions?: DataviewViewActionRenderer
): Promise<DataviewRenderExpectation | undefined> {
  const key = args.key;

  el.empty();
  if (!isDataviewViewKey(key)) {
    renderBlockNotice(el, viewBlockKind(key), `Unknown PARA-ZK view: ${key || "(empty)"}`);
    return undefined;
  }

  const block = dataviewViewBlock(key, plugin.settings, sourcePath);
  if (!block) {
    renderBlockNotice(el, viewBlockKind(key), `Unknown PARA-ZK view: ${key || "(empty)"}`);
    return undefined;
  }

  const body = renderDataviewViewShell(el, key, args.title, renderActions);
  await MarkdownRenderer.render(plugin.app, block, body, sourcePath ?? "", child);
  return dataviewRenderExpectation(block);
}

function renderDataviewViewError(el: HTMLElement, error: unknown): void {
  renderBlockNotice(el, "view", error instanceof Error ? error.message : String(error));
}

function renderDataviewViewShell(
  el: HTMLElement,
  rawKey: string,
  title?: string,
  renderActions?: DataviewViewActionRenderer
): HTMLElement {
  const titleText = title?.trim();
  return renderBlockShell(el, {
    kind: viewBlockKind(rawKey),
    title: titleText,
    renderActions
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
  timeoutMs: number,
  expectation?: DataviewRenderExpectation
): Promise<void> {
  if (hasSettledDataviewRender(el, expectation) || !isCurrent()) return Promise.resolve();

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      observer.disconnect();
      resolve();
    }, timeoutMs);
    const observer = new MutationObserver(() => {
      if (!isCurrent() || hasSettledDataviewRender(el, expectation)) {
        window.clearTimeout(timer);
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(el, { childList: true, subtree: true });
  });
}

function hasSettledDataviewRender(el: HTMLElement, expectation?: DataviewRenderExpectation): boolean {
  const dataview = el.querySelector<HTMLElement>(".block-language-dataview");
  if (!dataview) return false;

  const text = dataview.textContent?.trim() ?? "";
  if (!text || text === "Loading...") return false;

  const loadingError = dataview.querySelector<HTMLElement>(".dataview-error")
    ?.textContent
    ?.trim();
  if (loadingError) return loadingError !== "Loading...";

  return hasExpectedDataviewHeaders(dataview, expectation);
}

function dataviewRenderExpectation(block: string): DataviewRenderExpectation {
  return {
    headers: extractDataviewHeaders(block)
  };
}

function extractDataviewHeaders(block: string): string[] {
  const tableLine = block
    .split("\n")
    .find((line) => /^\s*TABLE\b/i.test(line));
  if (!tableLine) return [];
  return Array.from(
    tableLine.matchAll(/\bAS\s+"((?:\\"|[^"])*)"/g),
    (match) => normalizeDataviewHeader(match[1].replace(/\\"/g, "\""))
  );
}

function hasExpectedDataviewHeaders(dataview: HTMLElement, expectation?: DataviewRenderExpectation): boolean {
  if (!expectation?.headers.length) return true;

  const actualHeaders = Array.from(dataview.querySelectorAll<HTMLElement>("th"))
    .map((header) => normalizeDataviewHeaderText(header))
    .filter((header) => header.length > 0);
  return expectation.headers.every((header) => actualHeaders.includes(header));
}

function normalizeDataviewHeaderText(header: HTMLElement): string {
  const clone = header.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".dataview.small-text").forEach((count) => count.remove());
  return normalizeDataviewHeader(clone.textContent ?? "");
}

function normalizeDataviewHeader(value: string): string {
  return value.replace(/\s+/g, " ").trim();
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
