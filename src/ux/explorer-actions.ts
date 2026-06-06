import { Notice, setIcon } from "obsidian";
import { localePack } from "../i18n";
import type { ParaZkPluginContext } from "../plugin-interface";
import { isRecord } from "../records";

const EMPTY_TRASH_COMMAND_ID = "obsidian-trash-explorer:empty-trash";
const EMPTY_TRASH_CLASS = "para-zk-explorer-action-empty-trash";

export function registerExplorerActions(plugin: ParaZkPluginContext): void {
  // The button is injected into the core file-explorer DOM, which outlives this plugin
  // instance — registerDomEvent removes the click listener on unload but not the element,
  // so a reload would leave a dead (listener-less) button that the add-guard then refuses
  // to replace. Clear any such orphan on load, and remove our buttons on unload.
  removeEmptyTrashButtons();
  plugin.register(removeEmptyTrashButtons);

  const render = () => renderEmptyTrashAction(plugin);
  plugin.app.workspace.onLayoutReady(render);
  plugin.registerEvent(plugin.app.workspace.on("layout-change", render));
}

// Re-applies the empty-trash action to the current setting; called by the settings toggle.
export function refreshExplorerActions(plugin: ParaZkPluginContext): void {
  renderEmptyTrashAction(plugin);
}

function renderEmptyTrashAction(plugin: ParaZkPluginContext): void {
  if (!plugin.settings.showEmptyTrashAction) {
    removeEmptyTrashButtons();
    return;
  }
  for (const leaf of plugin.app.workspace.getLeavesOfType("file-explorer")) {
    const container = readNavButtonsContainer(leaf.view);
    if (!container || container.querySelector(`.${EMPTY_TRASH_CLASS}`)) continue;
    addEmptyTrashButton(plugin, container);
  }
}

function removeEmptyTrashButtons(): void {
  for (const button of document.querySelectorAll(`.${EMPTY_TRASH_CLASS}`)) {
    button.remove();
  }
}

export function refreshExplorerActionLabels(plugin: ParaZkPluginContext): void {
  const label = localePack(plugin.settings.locale).labels.emptyTrash;
  for (const button of document.querySelectorAll<HTMLElement>(`.${EMPTY_TRASH_CLASS}`)) {
    button.setAttribute("aria-label", label);
  }
}

function addEmptyTrashButton(plugin: ParaZkPluginContext, container: HTMLElement): void {
  const button = container.createDiv({
    cls: `clickable-icon nav-action-button para-zk-explorer-action ${EMPTY_TRASH_CLASS}`,
    attr: {
      "aria-label": localePack(plugin.settings.locale).labels.emptyTrash
    }
  });
  setIcon(button, "trash");

  plugin.registerDomEvent(button, "click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!executeCommand(plugin, EMPTY_TRASH_COMMAND_ID)) {
      new Notice("Could not empty trash. Ensure Trash Explorer is enabled (run para-zk:setup installDeps=true).");
    }
  });
}

function readNavButtonsContainer(view: unknown): HTMLElement | undefined {
  if (!isRecord(view)) return undefined;

  const headerDom = view.headerDom;
  if (isRecord(headerDom) && headerDom.navButtonsEl instanceof HTMLElement) {
    return headerDom.navButtonsEl;
  }

  const containerEl = view.containerEl;
  if (!(containerEl instanceof HTMLElement)) return undefined;
  return containerEl.querySelector<HTMLElement>(".nav-buttons-container") ?? undefined;
}

function executeCommand(plugin: ParaZkPluginContext, id: string): boolean {
  const manager = (plugin.app as unknown as { commands?: unknown }).commands;
  if (!isRecord(manager) || !isRecord(manager.commands)) return false;
  if (!manager.commands[id]) return false;

  const executeCommandById = manager.executeCommandById;
  if (typeof executeCommandById !== "function") return false;
  // Respect the return value — Obsidian returns false when the command was found but did
  // not run, which the caller previously swallowed (always returning true), so a failed
  // empty-trash click did nothing AND showed no message.
  return executeCommandById.call(manager, id) !== false;
}
