import { TFile, type TAbstractFile } from "obsidian";
import type { ParaZkPluginContext } from "../../plugin-interface";
import { workflowContext } from "../../vault/host";
import { applyManagedTemplate } from "../../workflows/auto-template";

export function registerAutoTemplate(plugin: ParaZkPluginContext): void {
  plugin.app.workspace.onLayoutReady(() => {
    plugin.registerEvent(plugin.app.vault.on("create", (file) => handleCreatedFile(plugin, file)));
  });
}

async function handleCreatedFile(plugin: ParaZkPluginContext, file: TAbstractFile): Promise<void> {
  try {
    if (!(file instanceof TFile)) return;
    if (!/\.md$/i.test(file.path)) return;

    await applyManagedTemplate(workflowContext(plugin), file);
  } catch (error) {
    console.error("para-zk auto-template failed", error);
  }
}
