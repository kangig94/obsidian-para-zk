import {
  MarkdownRenderChild,
  MarkdownRenderer,
  TFile,
  type MarkdownPostProcessorContext
} from "obsidian";
import { localePack } from "../i18n";
import type { ParaZkPluginContext } from "../plugin-interface";
import { DATAVIEW_VIEW_KEYS, dataviewViewBlock, type DataviewViewKey } from "../templates";
import { createWorkflowButton } from "./workflow-buttons";

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
    ctx.addChild(new DataviewViewRenderChild(plugin, el, readViewKey(source), ctx.sourcePath));
  });
}

class DataviewViewRenderChild extends MarkdownRenderChild {
  private readonly renderTimers = new Set<number>();
  private unloaded = true;

  constructor(
    private readonly plugin: ParaZkPluginContext,
    containerEl: HTMLElement,
    private readonly key: string,
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
    void renderDataviewView(this.plugin, this.key, this.containerEl, this.sourcePath, this)
      .catch((error: unknown) => {
        if (!this.unloaded) renderDataviewViewError(this.containerEl, error);
      });
  }
}

function renderDataviewView(
  plugin: ParaZkPluginContext,
  key: string,
  el: HTMLElement,
  sourcePath: MarkdownPostProcessorContext["sourcePath"],
  child: MarkdownRenderChild
): Promise<void> {
  const block = dataviewViewBlock(key, plugin.settings, sourcePath);

  el.empty();
  el.addClass("para-zk-view");
  if (key) el.addClass(`para-zk-view-${viewClassName(key)}`);
  if (!block) {
    el.createDiv({ cls: "para-zk-props-muted", text: `Unknown PARA-ZK view: ${key || "(empty)"}` });
    return Promise.resolve();
  }

  const viewKey = readDataviewViewKey(key);
  if (viewKey) renderDataviewViewToolbar(plugin, el, viewKey, sourcePath);

  const body = el.createDiv({ cls: "para-zk-view-body" });
  return MarkdownRenderer.render(plugin.app, block, body, sourcePath, child);
}

function readViewKey(source: string): string {
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
  key: DataviewViewKey,
  sourcePath: string
): void {
  const toolbar = dataviewViewToolbar(plugin, key);
  if (!toolbar || toolbar.actions.length === 0) return;

  const toolbarEl = el.createDiv({ cls: "para-zk-view-toolbar" });
  const controls = toolbarEl.createDiv({ cls: "para-zk-view-toolbar-controls" });

  for (const action of toolbar.actions) {
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
      return actionToolbar("create-subnote", labels.createSubnote, "file-plus");
    case "project-retros":
      return actionToolbar("create-retro", labels.createRetro, "calendar-plus");
    case "area-subareas":
      return actionToolbar("create-subarea", labels.createSubarea, "folder-plus");
    case "area-subnotes":
      return actionToolbar("create-subnote", labels.createSubnote, "file-plus");
    case "area-retros":
      return actionToolbar("create-retro", labels.createRetro, "calendar-plus");
    case "resource-zk-links":
      return actionToolbar("promote-resource", labels.promoteToZk, "arrow-up-right");
    case "fleeting-promotion":
      return actionToolbar("promote-fleeting", labels.promote, "arrow-up-right");
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
