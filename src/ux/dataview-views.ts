import {
  MarkdownRenderChild,
  MarkdownRenderer,
  TFile,
  type MarkdownPostProcessorContext
} from "obsidian";
import { localePack } from "../i18n";
import type { ParaZkPluginContext } from "../plugin-interface";
import { DATAVIEW_VIEW_KEYS, dataviewViewBlock, type DataviewViewKey } from "../templates";
import { parseCodeBlockKeyValues } from "./code-block-args";
import { createWorkflowButton } from "./workflow-buttons";

type DataviewViewArgs = {
  key: string;
  title?: string;
};

type DataviewViewAction = {
  command: string;
  label: string;
  icon: string;
};

type DataviewViewToolbar = {
  actions: DataviewViewAction[];
};

const DATAVIEW_INITIAL_RERENDER_DELAYS_MS = [1600, 3600] as const;
const DATAVIEW_CHANGE_RERENDER_DELAYS_MS = [300, 3200] as const;

// Renders a compact `para-zk-view` block by expanding its view key into a
// managed Dataview query and optional PARA-ZK workflow toolbar. ctx.sourcePath
// is passed so the query's `this.file` resolves to the host note.
export function registerDataviewViewRenderers(plugin: ParaZkPluginContext): void {
  plugin.registerMarkdownCodeBlockProcessor("para-zk-view", (source, el, ctx) => {
    ctx.addChild(new DataviewViewRenderChild(plugin, el, readViewArgs(source), ctx.sourcePath));
  });
}

class DataviewViewRenderChild extends MarkdownRenderChild {
  private readonly renderTimers = new Set<number>();
  private renderGeneration = 0;
  private unloaded = true;

  constructor(
    private readonly plugin: ParaZkPluginContext,
    containerEl: HTMLElement,
    private readonly args: DataviewViewArgs,
    private readonly sourcePath: MarkdownPostProcessorContext["sourcePath"]
  ) {
    super(containerEl);
  }

  onload(): void {
    this.unloaded = false;
    this.renderNow();
    for (const delay of DATAVIEW_INITIAL_RERENDER_DELAYS_MS) this.scheduleRender(delay);
    this.registerEvent(this.plugin.app.vault.on("modify", (file) => this.onVaultFile(file)));
    this.registerEvent(this.plugin.app.vault.on("create", (file) => this.onVaultFile(file)));
    this.registerEvent(this.plugin.app.vault.on("delete", (file) => this.onVaultFile(file)));
    this.registerEvent(this.plugin.app.vault.on("rename", (file) => this.onVaultFile(file)));
  }

  onunload(): void {
    this.unloaded = true;
    this.renderGeneration += 1;
    for (const timer of this.renderTimers) window.clearTimeout(timer);
    this.renderTimers.clear();
  }

  private onVaultFile(file: unknown): void {
    if (!(file instanceof TFile) || file.extension !== "md") return;
    for (const delay of DATAVIEW_CHANGE_RERENDER_DELAYS_MS) this.scheduleRender(delay);
  }

  private scheduleRender(delayMs: number): void {
    const timer = window.setTimeout(() => {
      this.renderTimers.delete(timer);
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
      this.sourcePath,
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
  sourcePath: MarkdownPostProcessorContext["sourcePath"],
  child: MarkdownRenderChild,
  isCurrent: () => boolean
): Promise<void> {
  if (!isCurrent()) return;
  const key = args.key;
  const block = dataviewViewBlock(key, plugin.settings, sourcePath);

  el.empty();
  el.addClass("para-zk-view");
  if (key) el.addClass(`para-zk-view-${viewClassName(key)}`);
  if (!block) {
    el.createDiv({ cls: "para-zk-props-muted", text: `Unknown PARA-ZK view: ${key || "(empty)"}` });
    return Promise.resolve();
  }

  const viewKey = readDataviewViewKey(key);
  if (viewKey || args.title) renderDataviewViewToolbar(plugin, el, viewKey, sourcePath, args.title);

  const body = el.createDiv({ cls: "para-zk-view-body" });
  await MarkdownRenderer.render(plugin.app, block, body, sourcePath, child);
  if (!isCurrent()) return;
}

function readViewArgs(source: string): DataviewViewArgs {
  const raw = parseCodeBlockKeyValues(source);
  const key = raw.key?.trim() || raw.view?.trim() || legacyViewKey(source);
  return {
    key,
    title: raw.title?.trim() || undefined
  };
}

function legacyViewKey(source: string): string {
  return source.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
}

function renderDataviewViewError(el: HTMLElement, error: unknown): void {
  el.empty();
  el.addClass("para-zk-view");
  el.createDiv({
    cls: "para-zk-props-muted",
    text: error instanceof Error ? error.message : String(error)
  });
}

function renderDataviewViewToolbar(
  plugin: ParaZkPluginContext,
  el: HTMLElement,
  key: DataviewViewKey | undefined,
  sourcePath: string,
  title?: string
): void {
  const toolbar = key ? dataviewViewToolbar(plugin, key) : undefined;
  const actions = toolbar?.actions ?? [];
  const titleText = title?.trim();
  if (!titleText && actions.length === 0) return;

  const toolbarEl = el.createDiv({ cls: "para-zk-view-toolbar" });
  if (titleText) toolbarEl.createDiv({ cls: "para-zk-view-toolbar-heading", text: titleText });
  const controls = toolbarEl.createDiv({ cls: "para-zk-view-toolbar-controls" });

  for (const action of actions) {
    const button = createWorkflowButton(plugin, action.label, action.command, sourcePath, { icon: action.icon });
    button.addClass("para-zk-view-toolbar-button", "para-zk-view-action");
    button.setAttr("aria-label", action.label);
    controls.appendChild(button);
  }
}

function dataviewViewToolbar(plugin: ParaZkPluginContext, key: DataviewViewKey): DataviewViewToolbar | undefined {
  const labels = localePack(plugin.settings.locale).labels;
  switch (key) {
    case "project-subnotes":
    case "area-subnotes":
      return actionToolbar("create-subnote", labels.createSubnote, "file-plus");
    case "project-retros":
    case "area-retros":
      return actionToolbar("create-retro", labels.createRetro, "calendar-plus");
    case "area-subareas":
      return actionToolbar("create-subarea", labels.createSubarea, "folder-plus");
    case "resource-cited-by":
      return actionToolbar("create-from-resource", labels.createZkButton, "arrow-up-right");
    case "spark-distill":
      return {
        actions: [
          { command: "discard-spark", label: labels.discardButton, icon: "trash-2" },
          { command: "distill-spark", label: labels.distillButton, icon: "arrow-up-right" }
        ]
      };
    case "source-cited-by":
      return actionToolbar("create-from-source", labels.createPermanentButton, "arrow-up-right");
    case "permanent-cited-by":
    case "area-projects":
      return undefined;
  }
}

function actionToolbar(command: string, actionLabel: string, icon: string): DataviewViewToolbar {
  return {
    actions: [
      {
        command,
        label: actionLabel,
        icon
      }
    ]
  };
}

function readDataviewViewKey(key: string): DataviewViewKey | undefined {
  return DATAVIEW_VIEW_KEYS.includes(key as DataviewViewKey) ? key as DataviewViewKey : undefined;
}

function viewClassName(key: string): string {
  return key.toLocaleLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}
