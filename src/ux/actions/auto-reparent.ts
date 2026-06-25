import { type TAbstractFile } from "obsidian";
import type { ParaZkPluginContext } from "../../plugin-interface";
import { workflowContext } from "../../vault/host";
import { syncMovedChildParent } from "../../workflows/reparent-on-move";

export function registerAutoReparent(plugin: ParaZkPluginContext): void {
  plugin.app.workspace.onLayoutReady(() => {
    plugin.registerEvent(plugin.app.vault.on("rename", (file, oldPath) => {
      void handleRenamedFile(plugin, file, oldPath);
    }));
  });
}

async function handleRenamedFile(plugin: ParaZkPluginContext, file: TAbstractFile, oldPath: string): Promise<void> {
  try {
    await syncMovedChildParent(workflowContext(plugin), file, oldPath);
  } catch (error) {
    console.error("para-zk auto-reparent failed", error);
  }
}
