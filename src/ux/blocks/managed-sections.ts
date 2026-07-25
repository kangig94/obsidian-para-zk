import {
  MarkdownRenderChild,
  TFile
} from "obsidian";
import type { ParaZkPluginContext } from "../../plugin-interface";
import {
  managedUiBlocksForType,
  type ManagedUiRenderAction,
  type ManagedUiRenderBlock
} from "../../templates";
import { normalizeFrontmatterType } from "../../vault/sections";
import { renderActionButtons } from "./action";
import { DataviewViewRenderChild } from "./dataview";
import { ReferenceBlockRenderChild } from "./references";
import { applyBlockKind, renderBlockNotice } from "./shell";
import { TaskBlockRenderChild } from "./tasks";

type RenderableManagedBlock = Exclude<ManagedUiRenderBlock, { kind: "action" }>;

type ManagedBlockSpec = {
  key: string;
  block: RenderableManagedBlock;
  actions: ManagedUiRenderAction[];
};

type ManagedBlockEntry = {
  key: string;
  separatorEl: HTMLElement;
  blockEl: HTMLElement;
  child: MarkdownRenderChild;
};

export class ManagedPanelController {
  private readonly plugin: ParaZkPluginContext;
  private readonly el: HTMLElement;
  private readonly child: MarkdownRenderChild;
  private entries = new Map<string, ManagedBlockEntry>();
  private sourcePath: string | undefined;

  constructor(plugin: ParaZkPluginContext, el: HTMLElement, child: MarkdownRenderChild) {
    this.plugin = plugin;
    this.el = el;
    this.child = child;
  }

  update(sourcePath: string | undefined, typeHint: string | undefined): void {
    this.sourcePath = sourcePath;
    const type = typeHint ?? cachedManagedType(this.plugin, sourcePath);
    const blocks = type ? managedUiBlocksForType(type, this.plugin.settings) : undefined;

    this.el.removeClass("para-zk-hidden");
    if (!type || !blocks) {
      this.disposeEntries();
      renderBlockNotice(this.el, "managed", `No PARA-ZK managed UI for type: ${type || "(unknown)"}`);
      return;
    }

    applyBlockKind(this.el, `managed-${type}`);
    this.reconcile(managedBlockSpecs(blocks, sourcePath));
  }

  dispose(): void {
    this.disposeEntries();
  }

  private reconcile(specs: ManagedBlockSpec[]): void {
    if (this.entries.size === 0) this.el.empty();

    const nextEntries = new Map<string, ManagedBlockEntry>();
    const createdEntries: ManagedBlockEntry[] = [];
    try {
      for (const spec of specs) {
        const existing = this.entries.get(spec.key);
        const entry = existing ?? this.createEntry(spec);
        if (!existing) createdEntries.push(entry);
        nextEntries.set(spec.key, entry);
        this.el.appendChild(entry.separatorEl);
        this.el.appendChild(entry.blockEl);
        if (!existing) this.child.addChild(entry.child);
      }

      for (const [key, entry] of this.entries) {
        if (nextEntries.has(key)) continue;
        this.disposeEntry(entry);
      }
      this.entries = nextEntries;
    } catch (error) {
      for (const entry of createdEntries) {
        if (!this.entries.has(entry.key)) this.disposeEntry(entry);
      }
      throw error;
    }
  }

  private createEntry(spec: ManagedBlockSpec): ManagedBlockEntry {
    const separatorEl = this.el.createEl("hr");
    const blockEl = this.el.createDiv({ cls: `block-language-para-zk-${spec.block.kind}` });
    try {
      const child = createManagedBlockChild(
        this.plugin,
        blockEl,
        spec.block,
        this.sourcePath,
        spec.actions
      );
      return { key: spec.key, separatorEl, blockEl, child };
    } catch (error) {
      separatorEl.remove();
      blockEl.remove();
      throw error;
    }
  }

  private disposeEntries(): void {
    for (const entry of this.entries.values()) this.disposeEntry(entry);
    this.entries.clear();
  }

  private disposeEntry(entry: ManagedBlockEntry): void {
    try {
      this.child.removeChild(entry.child);
    } catch {
      entry.child.unload();
    }
    entry.separatorEl.remove();
    entry.blockEl.remove();
  }
}

function cachedManagedType(plugin: ParaZkPluginContext, sourcePath: string | undefined): string | undefined {
  if (!sourcePath) return undefined;
  const file = plugin.app.vault.getFileByPath(sourcePath);
  if (!(file instanceof TFile)) return undefined;
  return normalizeFrontmatterType(plugin.app.metadataCache.getFileCache(file)?.frontmatter?.type);
}

function managedBlockSpecs(
  blocks: readonly ManagedUiRenderBlock[],
  sourcePath: string | undefined
): ManagedBlockSpec[] {
  const specs: ManagedBlockSpec[] = [];
  let pendingActions: ManagedUiRenderAction[] = [];
  for (const block of blocks) {
    if (block.kind === "action") {
      pendingActions = [...pendingActions, ...block.actions];
      continue;
    }

    specs.push({
      key: managedBlockKey(block, pendingActions, sourcePath),
      block,
      actions: pendingActions
    });
    pendingActions = [];
  }
  return specs;
}

function createManagedBlockChild(
  plugin: ParaZkPluginContext,
  el: HTMLElement,
  block: RenderableManagedBlock,
  sourcePath: string | undefined,
  actions: readonly ManagedUiRenderAction[]
): MarkdownRenderChild {
  switch (block.kind) {
    case "tasks":
      return new TaskBlockRenderChild(
        plugin,
        { root: "current", title: block.title },
        el,
        { sourcePath: sourcePath ?? "" }
      );
    case "view":
      return new DataviewViewRenderChild(
        plugin,
        el,
        { key: block.key, title: block.title },
        sourcePath,
        actions.length > 0 ? (actionsEl) => renderActionButtons(plugin, actionsEl, actions, sourcePath) : undefined
      );
    case "references":
      return new ReferenceBlockRenderChild(
        plugin,
        { root: "current", title: block.title },
        el,
        { sourcePath: sourcePath ?? "" }
      );
  }
}

function managedBlockKey(
  block: RenderableManagedBlock,
  actions: readonly ManagedUiRenderAction[],
  sourcePath: string | undefined
): string {
  const actionKey = actions.map((action) => ({
    command: action.command,
    label: action.label,
    icon: action.icon
  }));
  if (block.kind === "view") {
    return JSON.stringify({ sourcePath, kind: block.kind, key: block.key, title: block.title, actions: actionKey });
  }
  return JSON.stringify({ sourcePath, kind: block.kind, title: block.title, actions: actionKey });
}
