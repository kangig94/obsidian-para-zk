import { localePack } from "../i18n";
import type { ParaZkPluginContext } from "../plugin-interface";
import { RIBBON_ACTIONS } from "./locale-labels";
import { runGuiWorkflow } from "./workflow-commands";

export function registerRibbonActions(plugin: ParaZkPluginContext): void {
  const labels = localePack(plugin.settings.locale).labels;

  for (const [index, action] of RIBBON_ACTIONS.entries()) {
    const button = plugin.addRibbonIcon(action.icon, action.label(labels), () => {
      void runGuiWorkflow(plugin, action.command);
    });
    button.addClass("para-zk-ribbon-action", `para-zk-ribbon-action-${action.id}`);
    button.style.setProperty("--para-zk-ribbon-color", action.color);
    if (action.lightColor) {
      button.style.setProperty("--para-zk-ribbon-color-light", action.lightColor);
    }
    button.style.setProperty("--para-zk-ribbon-order", String(100 + index));
  }
}
