import {
  MarkdownRenderChild,
  MarkdownRenderer,
  TFile
} from "obsidian";
import type { ParaZkPluginContext } from "../../plugin-interface";
import { managedUiBlockForType } from "../../templates";
import { normalizeFrontmatterType, readFrontmatterTypeFromContent } from "../../vault/sections";
import { applyBlockKind, renderBlockNotice } from "./shell";

const MANAGED_PANEL_BUFFER_SETTLE_TIMEOUT_MS = 1000;
const INLINE_ACTION_BLOCK_SELECTOR = ":scope > .para-zk-block--action";
const INLINE_ACTION_TARGET_SELECTOR = ".para-zk-block:not(.para-zk-block--action)";
const BLOCK_ACTIONS_CLASS = "para-zk-block__actions";
const BLOCK_ACTIONS_SELECTOR = `.${BLOCK_ACTIONS_CLASS}`;
const BLOCK_TOOLBAR_SELECTOR = ":scope > .para-zk-block__toolbar";

export async function renderManagedPanel(
  plugin: ParaZkPluginContext,
  el: HTMLElement,
  sourcePath: string | undefined,
  child: MarkdownRenderChild
): Promise<void> {
  const type = await resolveManagedType(plugin, sourcePath);
  const block = type ? managedUiBlockForType(type, plugin.settings) : undefined;
  const expectedViewCount = countManagedDataviewViews(block);
  const buffer = createManagedPanelBuffer(el);

  try {
    if (!type) {
      renderBlockNotice(buffer, "managed", `No PARA-ZK managed UI for type: ${type || "(unknown)"}`);
      replaceManagedPanel(el, buffer);
      return;
    }

    applyBlockKind(buffer, `managed-${type}`);
    if (block) {
      await MarkdownRenderer.render(plugin.app, block, buffer, sourcePath ?? "", child);
      await waitForManagedPanelSettled(buffer, expectedViewCount);
      inlineManagedActionBlocks(buffer);
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

function createManagedPanelBuffer(el: HTMLElement): HTMLElement {
  const buffer = el.ownerDocument.createElement("div");
  buffer.addClass("para-zk-managed-buffer");
  buffer.style.position = "absolute";
  buffer.style.left = "-100000px";
  buffer.style.top = "0";
  buffer.style.width = `${Math.max(1, Math.round(el.getBoundingClientRect().width))}px`;
  buffer.style.pointerEvents = "none";
  buffer.style.opacity = "0";
  buffer.setAttribute("aria-hidden", "true");
  el.after(buffer);
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

function inlineManagedActionBlocks(el: HTMLElement): void {
  for (const actionBlock of Array.from(el.querySelectorAll<HTMLElement>(INLINE_ACTION_BLOCK_SELECTOR))) {
    const targetBlock = nextInlineActionTarget(actionBlock);
    if (!targetBlock || !moveActionButtonsIntoToolbar(actionBlock, targetBlock)) continue;
    removeInlineActionGap(actionBlock, targetBlock);
    actionBlock.remove();
  }
}

function nextInlineActionTarget(actionBlock: HTMLElement): HTMLElement | undefined {
  for (let node = actionBlock.nextSibling; node; node = node.nextSibling) {
    if (isManagedBlockSeparatorNode(node)) continue;
    if (node instanceof HTMLElement && node.matches(INLINE_ACTION_TARGET_SELECTOR)) return node;
    return undefined;
  }
  return undefined;
}

function moveActionButtonsIntoToolbar(actionBlock: HTMLElement, targetBlock: HTMLElement): boolean {
  const sourceActions = actionBlock.querySelector<HTMLElement>(BLOCK_ACTIONS_SELECTOR);
  const targetToolbar = targetBlock.querySelector<HTMLElement>(BLOCK_TOOLBAR_SELECTOR);
  if (!sourceActions || !targetToolbar || !sourceActions.hasChildNodes()) return false;

  let targetActions = targetToolbar.querySelector<HTMLElement>(`:scope > ${BLOCK_ACTIONS_SELECTOR}`);
  if (!targetActions) {
    targetActions = targetToolbar.ownerDocument.createElement("div");
    targetActions.addClass(BLOCK_ACTIONS_CLASS);
    targetToolbar.appendChild(targetActions);
  }

  while (sourceActions.firstChild) targetActions.appendChild(sourceActions.firstChild);
  return true;
}

function removeInlineActionGap(left: HTMLElement, right: HTMLElement): void {
  for (let node = left.nextSibling; node && node !== right;) {
    const next = node.nextSibling;
    if (isManagedBlockSeparatorNode(node)) node.remove();
    node = next;
  }
}

function isManagedBlockSeparatorNode(node: ChildNode): boolean {
  return (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim())
    || (node instanceof HTMLElement && node.tagName === "HR");
}

function countManagedDataviewViews(block: string | undefined): number {
  if (!block) return 0;
  return Array.from(block.matchAll(/```para-zk-view\b/g)).length;
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
