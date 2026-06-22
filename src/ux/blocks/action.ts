import { Notice } from "obsidian";
import { localePack } from "../../i18n";
import type { ParaZkPluginContext } from "../../plugin-interface";
import { runGuiWorkflow } from "../actions/workflows";
import { renderShellAction } from "./shell";

export type ActionBlockAction = {
  command: string;
  icon: string;
  label: string;
};

export function renderActionButtons(
  plugin: ParaZkPluginContext,
  actionsEl: HTMLElement,
  actions: readonly ActionBlockAction[],
  sourcePath: string | undefined
): void {
  for (const action of actions) {
    renderShellAction(actionsEl, {
      label: action.label,
      icon: action.icon,
      cta: true,
      onClick: async (_button, component) => {
        if (!action.command) {
          new Notice(localePack(plugin.settings.locale).messages.buttonMissingCommand);
          return;
        }

        component.setDisabled(true);
        try {
          await runGuiWorkflow(plugin, action.command, sourcePath);
        } finally {
          component.setDisabled(false);
        }
      }
    });
  }
}
