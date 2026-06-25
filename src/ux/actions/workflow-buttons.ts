import { ButtonComponent, Notice } from "obsidian";
import { localePack } from "../../i18n";
import type { ParaZkPluginContext } from "../../plugin-interface";
import { runGuiWorkflow } from "./workflows";

type WorkflowButtonOptions = {
  icon?: string;
};

export function createWorkflowButton(
  plugin: ParaZkPluginContext,
  label: string,
  command: string | undefined,
  sourcePath?: string,
  options: WorkflowButtonOptions = {}
): HTMLButtonElement {
  const host = activeDocument.createElement("span");
  const component = new ButtonComponent(host);
  const button = component.buttonEl;
  button.addClass("para-zk-command-button", "mod-cta");
  if (options.icon) component.setIcon(options.icon);
  component
    .setButtonText(label)
    .setTooltip(label)
    .setCta();

  component.onClick(async () => {
    if (!command) {
      new Notice(localePack(plugin.settings.locale).messages.buttonMissingCommand);
      return;
    }

    component.setDisabled(true);
    try {
      await runGuiWorkflow(plugin, command, sourcePath);
    } finally {
      component.setDisabled(false);
    }
  });

  return button;
}
