import { ButtonComponent, Notice, PluginSettingTab, Setting } from "obsidian";
import { localePack, normalizeLocale } from "../i18n";
import type { ParaZkPluginContext } from "../plugin-interface";
import type { SetupOptions, SetupResult } from "../types";
import { refreshEditorWidthControl } from "./editor-width";
import { refreshExplorerActions } from "./actions/explorer";
import { refreshRegisteredLocaleLabels } from "./locale-labels";
import { refreshRibbonActions } from "./actions/ribbon";

export class ParaZkSettingTab extends PluginSettingTab {
  private readonly plugin: ParaZkPluginContext;

  constructor(plugin: ParaZkPluginContext) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    const labels = localePack(this.plugin.settings.locale).labels;
    containerEl.empty();

    containerEl.createEl("h2", { text: "PARA-ZK" });
    containerEl.createEl("p", {
      cls: "para-zk-setting-note",
      text: labels.settingsNote
    });

    const setupSetting = new Setting(containerEl)
      .setName(labels.settingsSetupVault)
      .setDesc(labels.settingsSetupVaultDesc);
    // Fixed English caption to the left of the language picker; it stays
    // "Language:" regardless of the selected locale.
    setupSetting.controlEl.createSpan({ cls: "para-zk-language-label", text: "Language:" });
    setupSetting
      .addDropdown((dropdown) => {
        dropdown
          .addOption("ko", "한국어")
          .addOption("en", "English")
          .setValue(this.plugin.settings.locale)
          .onChange(async (value) => {
            const previousLocale = this.plugin.settings.locale;
            this.plugin.settings.locale = normalizeLocale(value, previousLocale);
            await this.plugin.saveSettings();
            refreshRegisteredLocaleLabels(this.plugin, previousLocale);
            this.display();
          });
      })
      .addButton((button) => {
        button
          .setButtonText(labels.settingsSetupVaultButton)
          .setCta()
          .onClick(() => {
            void this.runSetupAction(button, { installDeps: false });
          });
      });

    new Setting(containerEl)
      .setName(labels.setupInstallDeps)
      .setDesc(labels.setupInstallDepsDesc)
      .addButton((button) => {
        button
          .setButtonText(labels.settingsInstallDepsButton)
          .onClick(() => {
            void this.runSetupAction(button, { installDeps: true });
          });
      });

    new Setting(containerEl)
      .setName(labels.settingsShowRibbon)
      .setDesc(labels.settingsShowRibbonDesc)
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.showRibbon)
          .onChange(async (value) => {
            this.plugin.settings.showRibbon = value;
            await this.plugin.saveSettings();
            refreshRibbonActions(this.plugin);
          });
      });

    new Setting(containerEl)
      .setName(labels.settingsEmptyTrashAction)
      .setDesc(labels.settingsEmptyTrashActionDesc)
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.showEmptyTrashAction)
          .onChange(async (value) => {
            this.plugin.settings.showEmptyTrashAction = value;
            await this.plugin.saveSettings();
            refreshExplorerActions(this.plugin);
          });
      });

    new Setting(containerEl)
      .setName(labels.settingsEditorWidthSlider)
      .setDesc(labels.settingsEditorWidthSliderDesc)
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.editorWidthSliderEnabled)
          .onChange(async (value) => {
            this.plugin.settings.editorWidthSliderEnabled = value;
            await this.plugin.saveSettings();
            refreshEditorWidthControl(this.plugin);
          });
      });

  }

  private async runSetupAction(button: ButtonComponent, options: Pick<SetupOptions, "installDeps">): Promise<void> {
    button.setDisabled(true);
    try {
      const result = await this.plugin.setupVault({
        locale: this.plugin.settings.locale,
        installDeps: options.installDeps
      });
      new Notice(this.setupNotice(result));
      this.display();
    } catch (error) {
      console.error(error);
      new Notice(`PARA-ZK error: ${errorMessage(error)}`);
    } finally {
      button.setDisabled(false);
    }
  }

  private setupNotice(result: SetupResult): string {
    const messages = localePack(this.plugin.settings.locale).messages;
    const dependencyChanges = result.dependencies.filter((dependency) => dependency.action !== "none").length;
    const parts = [
      `${messages.setupReady}: ${result.created.length} created, ${result.updated.length} updated`
    ];
    if (dependencyChanges > 0) parts.push(`${dependencyChanges} dependency actions`);
    if (result.warnings.length > 0) parts.push(`${result.warnings.length} warnings`);
    return parts.join(", ");
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
