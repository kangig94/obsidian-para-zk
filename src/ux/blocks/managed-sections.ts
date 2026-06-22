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
import { normalizeFrontmatterType, readFrontmatterTypeFromContent } from "../../vault/sections";
import { renderActionButtons } from "./action";
import { DataviewViewRenderChild } from "./dataview";
import { ReferenceBlockRenderChild } from "./references";
import { applyBlockKind, renderBlockNotice } from "./shell";
import { TaskBlockRenderChild } from "./tasks";

const MANAGED_PANEL_BUFFER_SETTLE_TIMEOUT_MS = 1000;

export async function renderManagedPanel(
  plugin: ParaZkPluginContext,
  el: HTMLElement,
  sourcePath: string | undefined,
  child: MarkdownRenderChild
): Promise<void> {
  const type = await resolveManagedType(plugin, sourcePath);
  const blocks = type ? managedUiBlocksForType(type, plugin.settings) : undefined;
  const expectedViewCount = countManagedDataviewViews(blocks);
  const buffer = createManagedPanelBuffer(el);

  resetManagedRenderChild(child);

  try {
    if (!type) {
      renderBlockNotice(buffer, "managed", `No PARA-ZK managed UI for type: ${type || "(unknown)"}`);
      replaceManagedPanel(el, buffer);
      return;
    }

    applyBlockKind(buffer, `managed-${type}`);
    if (blocks) {
      renderManagedBlocks(plugin, buffer, blocks, sourcePath, child);
      await waitForManagedPanelSettled(buffer, expectedViewCount);
    }

    replaceManagedPanel(el, buffer);
  } finally {
    buffer.remove();
  }
}

async function resolveManagedType(
  plugin: ParaZkPluginContext,
  sourcePath: string | undefined
): Promise<string | undefined> {
  if (!sourcePath) return undefined;
  const file = plugin.app.vault.getFileByPath(sourcePath);
  if (!(file instanceof TFile)) return undefined;

  try {
    const freshType = readFrontmatterTypeFromContent(await plugin.app.vault.read(file));
    if (freshType) return freshType;
  } catch {
    // Fall through to the cache only if the fresh file read cannot provide a type.
  }

  return normalizeFrontmatterType(plugin.app.metadataCache.getFileCache(file)?.frontmatter?.type);
}

function resetManagedRenderChild(child: MarkdownRenderChild): void {
  child.unload();
  child.load();
}

function renderManagedBlocks(
  plugin: ParaZkPluginContext,
  el: HTMLElement,
  blocks: readonly ManagedUiRenderBlock[],
  sourcePath: string | undefined,
  child: MarkdownRenderChild
): void {
  let pendingActions: ManagedUiRenderAction[] = [];
  for (const block of blocks) {
    if (block.kind === "action") {
      pendingActions = [...pendingActions, ...block.actions];
      continue;
    }

    appendManagedBlockSeparator(el);
    const blockEl = appendManagedBlockContainer(el, block);
    renderManagedBlock(plugin, blockEl, block, sourcePath, child, pendingActions);
    pendingActions = [];
  }
}

function renderManagedBlock(
  plugin: ParaZkPluginContext,
  el: HTMLElement,
  block: Exclude<ManagedUiRenderBlock, { kind: "action" }>,
  sourcePath: string | undefined,
  child: MarkdownRenderChild,
  actions: readonly ManagedUiRenderAction[]
): void {
  switch (block.kind) {
    case "tasks":
      child.addChild(new TaskBlockRenderChild(
        plugin,
        { root: "current", title: block.title },
        el,
        { sourcePath: sourcePath ?? "" }
      ));
      return;
    case "view":
      child.addChild(new DataviewViewRenderChild(
        plugin,
        el,
        { key: block.key, title: block.title },
        sourcePath,
        actions.length > 0 ? (actionsEl) => renderActionButtons(plugin, actionsEl, actions, sourcePath) : undefined
      ));
      return;
    case "references":
      child.addChild(new ReferenceBlockRenderChild(
        plugin,
        { root: "current", title: block.title },
        el,
        { sourcePath: sourcePath ?? "" }
      ));
      return;
  }
}

function appendManagedBlockSeparator(el: HTMLElement): void {
  el.appendChild(el.ownerDocument.createElement("hr"));
}

function appendManagedBlockContainer(
  el: HTMLElement,
  block: Exclude<ManagedUiRenderBlock, { kind: "action" }>
): HTMLElement {
  const blockEl = el.ownerDocument.createElement("div");
  blockEl.addClass(`block-language-para-zk-${block.kind}`);
  el.appendChild(blockEl);
  return blockEl;
}

function createManagedPanelBuffer(el: HTMLElement): HTMLElement {
  const buffer = el.ownerDocument.createElement("div");
  buffer.addClass("para-zk-managed-buffer");
  buffer.style.position = "absolute";
  buffer.style.left = "-100000px";
  buffer.style.top = "0";
  buffer.style.width = `${Math.max(1, Math.round(el.getBoundingClientRect().width))}px`;
  buffer.style.pointerEvents = "none";
  buffer.style.opacity = "0";
  buffer.contentEditable = "false";
  buffer.setAttribute("contenteditable", "false");
  buffer.setAttribute("aria-hidden", "true");
  const parent = el.ownerDocument.body ?? el.parentElement;
  if (parent) parent.appendChild(buffer);
  else el.after(buffer);
  return buffer;
}

function replaceManagedPanel(el: HTMLElement, rendered: HTMLElement): void {
  el.style.removeProperty("display");
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

function countManagedDataviewViews(blocks: readonly ManagedUiRenderBlock[] | undefined): number {
  return blocks?.filter((block) => block.kind === "view").length ?? 0;
}

function waitForManagedPanelSettled(el: HTMLElement, expectedViewCount: number): Promise<void> {
  if (hasSettledManagedPanel(el, expectedViewCount)) return Promise.resolve();

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      observer.disconnect();
      resolve();
    }, MANAGED_PANEL_BUFFER_SETTLE_TIMEOUT_MS);
    const observer = new MutationObserver(() => {
      if (hasSettledManagedPanel(el, expectedViewCount)) {
        window.clearTimeout(timer);
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(el, { childList: true, subtree: true, characterData: true });
  });
}

function hasSettledManagedPanel(el: HTMLElement, expectedViewCount: number): boolean {
  if (expectedViewCount <= 0) return true;

  const views = Array.from(el.querySelectorAll<HTMLElement>(".block-language-para-zk-view"));
  return views.length >= expectedViewCount && views.every(hasSettledNestedDataviewView);
}

function hasSettledNestedDataviewView(view: HTMLElement): boolean {
  const dataview = view.querySelector<HTMLElement>(".block-language-dataview");
  if (!dataview) return false;

  const text = dataview.textContent?.trim() ?? "";
  if (!text || text === "Loading...") return false;

  const loadingError = dataview.querySelector<HTMLElement>(".dataview-error")
    ?.textContent
    ?.trim();
  return loadingError !== "Loading...";
}
