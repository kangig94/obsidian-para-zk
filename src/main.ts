import { Plugin } from "obsidian";
import { registerNativeCliHandlers } from "./cli/handlers";
import { loadSettings as loadRuntimeSettings, saveSettings as saveRuntimeSettings } from "./runtime/settings";
import { DEFAULT_SETTINGS, type InitOptions, type InitResult, type ParaZkSettings } from "./types";
import { registerDashboardActionRenderers } from "./ux/dashboard-actions";
import { registerInlineActionRenderers } from "./ux/inline-actions";
import { registerPropsControlRenderers } from "./ux/props-controls";
import { ParaZkSettingTab } from "./ux/settings";
import {
  registerStatusAndInitCommands,
  registerWorkflowCommands
} from "./ux/workflow-commands";

export default class ParaZkPlugin extends Plugin {
  settings: ParaZkSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    registerStatusAndInitCommands(this);
    registerWorkflowCommands(this);
    registerDashboardActionRenderers(this);
    registerInlineActionRenderers(this);
    registerPropsControlRenderers(this);

    this.addSettingTab(new ParaZkSettingTab(this));
    registerNativeCliHandlers(this);
  }

  async loadSettings(): Promise<void> {
    this.settings = await loadRuntimeSettings(this);
  }

  async saveSettings(): Promise<void> {
    await saveRuntimeSettings(this, this.settings);
  }

  async initializeVault(options: InitOptions = {}): Promise<InitResult> {
    const { initializeVault } = await import("./runtime/init");
    const { result, settings } = await initializeVault(this.app, this.settings, options);
    if (!result.dryRun) {
      this.settings = settings;
      await this.saveSettings();
    }
    return result;
  }
}
