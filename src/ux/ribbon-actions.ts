import { localePack } from "../i18n";
import type { ParaZkPluginContext } from "../plugin-interface";
import { RIBBON_ACTIONS } from "./locale-labels";
import { runGuiWorkflow } from "./workflow-commands";

const RIBBON_ACTION_CLASS = "para-zk-ribbon-action";

export function registerRibbonActions(plugin: ParaZkPluginContext): void {
  renderRibbonActions(plugin);
}

// Re-applies the ribbon actions to the current setting; called by the settings toggle.
export function refreshRibbonActions(plugin: ParaZkPluginContext): void {
  renderRibbonActions(plugin);
}

function renderRibbonActions(plugin: ParaZkPluginContext): void {
  removeRibbonActions();
  if (!plugin.settings.showRibbon) return;

  const labels = localePack(plugin.settings.locale).labels;
  for (const [index, action] of RIBBON_ACTIONS.entries()) {
    const button = plugin.addRibbonIcon(action.icon, action.label(labels), () => {
      void runGuiWorkflow(plugin, action.command);
    });
    button.addClass(RIBBON_ACTION_CLASS, `para-zk-ribbon-action-${action.id}`);
    button.style.setProperty("--para-zk-ribbon-color", action.color);
    if (action.lightColor) {
      button.style.setProperty("--para-zk-ribbon-color-light", action.lightColor);
    }
    button.style.setProperty("--para-zk-ribbon-order", String(100 + index));
  }
}

function removeRibbonActions(): void {
  for (const button of document.querySelectorAll(`.${RIBBON_ACTION_CLASS}`)) {
    button.remove();
  }
}
