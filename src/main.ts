import { Plugin } from "obsidian";
import { registerNativeCliHandlers } from "./cli/handlers";
import { loadSettings as loadRuntimeSettings, saveSettings as saveRuntimeSettings } from "./runtime/settings";
import { DEFAULT_SETTINGS, type SetupOptions, type SetupResult, type ParaZkSettings } from "./types";
import { registerCitationRenderers } from "./ux/citation-renderer";
import { registerDashboardActionRenderers } from "./ux/dashboard-actions";
import { registerDashboardSummaryRenderers } from "./ux/dashboard-summary";
import { registerDataviewViewRenderers } from "./ux/dataview-views";
import { registerExplorerActions } from "./ux/explorer-actions";
import { registerLatestRetroSummaryRenderers } from "./ux/latest-retro-summary";
import { refreshRegisteredLocaleLabels } from "./ux/locale-labels";
import { registerManagedSectionRenderers } from "./ux/managed-sections";
import { registerPropsControlRenderers } from "./ux/props-controls";
import { registerRibbonActions } from "./ux/ribbon-actions";
import { ParaZkSettingTab } from "./ux/settings";
import { registerReferenceRenderers } from "./ux/reference-renderer";
import { registerTaskRenderers } from "./ux/task-renderer";
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
    registerRibbonActions(this);
    registerExplorerActions(this);
    registerDashboardActionRenderers(this);
    registerDashboardSummaryRenderers(this);
    registerDataviewViewRenderers(this);
    registerLatestRetroSummaryRenderers(this);
    registerPropsControlRenderers(this);
    registerTaskRenderers(this);
    registerReferenceRenderers(this);
    registerCitationRenderers(this);
    registerManagedSectionRenderers(this);

    this.addSettingTab(new ParaZkSettingTab(this));
    registerNativeCliHandlers(this);
  }

  async loadSettings(): Promise<void> {
    this.settings = await loadRuntimeSettings(this);
  }

  async saveSettings(): Promise<void> {
    await saveRuntimeSettings(this, this.settings);
  }

  async setupVault(options: SetupOptions = {}): Promise<SetupResult> {
    const { setupVault } = await import("./runtime/setup");
    const previousLocale = this.settings.locale;
    const { result, settings } = await setupVault(this.app, this.settings, options);
    if (!result.dryRun) {
      this.settings = settings;
      await this.saveSettings();
      refreshRegisteredLocaleLabels(this, previousLocale);
    }
    return result;
  }
}
