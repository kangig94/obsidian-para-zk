import { Notice } from "obsidian";
import { localePack } from "../../i18n";
import type { ParaZkPluginContext } from "../../plugin-interface";
import { runGuiWorkflow } from "../actions/workflows";
import {
  renderBlockShell,
  renderShellAction
} from "./shell";

type ActionBlockAction = {
  command: string;
  icon: string;
  label: string;
};

export function registerActionBlockRenderers(plugin: ParaZkPluginContext): void {
  plugin.registerMarkdownCodeBlockProcessor("para-zk-action", (source, el, ctx) => {
    renderActionBlock(plugin, source, el, ctx.sourcePath);
  });
}

function renderActionBlock(
  plugin: ParaZkPluginContext,
  source: string,
  el: HTMLElement,
  sourcePath: string | undefined
): void {
  const actions = readActionBlockActions(source);
  el.empty();
  renderBlockShell(el, {
    kind: "action",
    renderActions: actions.length > 0 ? (controls) => {
      for (const action of actions) {
        renderShellAction(controls, {
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
    } : undefined
  });
}

export function readActionBlockActions(source: string): ActionBlockAction[] {
  const actions: ActionBlockAction[] = [];
  for (const line of source.split(/\r?\n/)) {
    // `command|icon|label` — only the first two `|` are separators, so a label may itself
    // contain `|`. Lines without a non-empty command (blank or malformed) are skipped.
    const match = line.trim().match(/^([^|]+)\|([^|]*)\|(.*)$/);
    if (!match) continue;
    const command = match[1].trim();
    if (!command) continue;
    actions.push({ command, icon: match[2].trim(), label: match[3].trim() });
  }
  return actions;
}
