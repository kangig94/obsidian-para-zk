import { Plugin } from "obsidian";
import { registerNativeCliHandlers } from "./cli/handlers";
import { loadSettings as loadRuntimeSettings, saveSettings as saveRuntimeSettings } from "./runtime/settings";
import { DEFAULT_SETTINGS, type SetupOptions, type SetupResult, type ParaZkSettings } from "./types";
import { createCitationEditorExtension } from "./ux/citations/editor";
import { registerCitationRenderers } from "./ux/citations/renderer";
import { CitationSuggest } from "./ux/citations/suggest";
import { registerAutoReparent } from "./ux/actions/auto-reparent";
import { registerAutoTemplate } from "./ux/actions/auto-template";
import { registerDashboardActionRenderers } from "./ux/actions/dashboard";
import { registerDashboardSummaryRenderers } from "./ux/blocks/dashboard-summary";
import { registerEditorWidthControl } from "./ux/editor-width";
import { registerExplorerActions } from "./ux/actions/explorer";
import { registerLatestRetroSummaryRenderers } from "./ux/blocks/latest-retro-summary";
import { refreshRegisteredLocaleLabels } from "./ux/locale-labels";
import { registerNoteChromeRenderers } from "./ux/blocks/note-chrome";
import { createNoteChromeEditorExtension } from "./ux/note-chrome-editor";
import { registerPropsControlRenderers } from "./ux/props-controls";
import { registerRibbonActions } from "./ux/actions/ribbon";
import { ParaZkSettingTab } from "./ux/settings";
import { registerTaskRenderers } from "./ux/blocks/tasks";
import {
  registerStatusAndInitCommands,
  registerWorkflowCommands
} from "./ux/actions/workflows";

export default class ParaZkPlugin extends Plugin {
  settings: ParaZkSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    registerStatusAndInitCommands(this);
    registerWorkflowCommands(this);
    registerEditorWidthControl(this);
    registerRibbonActions(this);
    registerAutoTemplate(this);
    registerAutoReparent(this);
    registerExplorerActions(this);
    registerDashboardActionRenderers(this);
    registerDashboardSummaryRenderers(this);
    registerLatestRetroSummaryRenderers(this);
    registerPropsControlRenderers(this);
    registerTaskRenderers(this);
    registerCitationRenderers(this);
    this.registerEditorExtension(createCitationEditorExtension(this));
    registerNoteChromeRenderers(this);
    this.registerEditorExtension(createNoteChromeEditorExtension(this));
    if (this.settings.rememberCursorPosition) {
      const { registerPositionMemory } = await import("./ux/position-memory");
      await registerPositionMemory(this);
    }
    this.registerEditorSuggest(new CitationSuggest(this));

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
