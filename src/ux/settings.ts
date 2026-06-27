import { ButtonComponent, Notice, PluginSettingTab, Setting } from "obsidian";
import { localePack, normalizeLocale } from "../i18n";
import type { ParaZkPluginContext } from "../plugin-interface";
import type { SetupOptions, SetupResult } from "../types";
import { refreshEditorWidthControl } from "./editor-width";
import { refreshExplorerActions } from "./actions/explorer";
import { refreshRegisteredLocaleLabels } from "./locale-labels";
import { refreshRibbonActions } from "./actions/ribbon";
import { confirmAction } from "./prompts";

export class ParaZkSettingTab extends PluginSettingTab {
  private readonly plugin: ParaZkPluginContext;

  constructor(plugin: ParaZkPluginContext) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.renderSettings();
  }

  private renderSettings(): void {
    const { containerEl } = this;
    const labels = localePack(this.plugin.settings.locale).labels;
    containerEl.empty();

    new Setting(containerEl)
      .setName(labels.settingsHeading)
      .setHeading();
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
            this.renderSettings();
          });
      })
      .addButton((button) => {
        button
          .setButtonText(labels.settingsSetupVaultButton)
          .setCta()
          .onClick(() => {
            void this.confirmAndRunSetupAction(button);
          });
      });

    new Setting(containerEl)
      .setName(labels.setupRequiredDeps)
      .setDesc(labels.setupRequiredDepsDesc)
      .addButton((button) => {
        button
          .setButtonText(labels.settingsInstallRequiredDepsButton)
          .onClick(() => {
            void this.runSetupAction(button, { deps: "required" });
          });
      });

    new Setting(containerEl)
      .setName(labels.setupEnhancementDeps)
      .setDesc(labels.setupEnhancementDepsDesc)
      .addButton((button) => {
        button
          .setButtonText(labels.settingsInstallEnhancementDepsButton)
          .onClick(() => {
            void this.runSetupAction(button, { deps: "enhancements" });
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

    new Setting(containerEl)
      .setName(labels.settingsRememberCursorPosition)
      .setDesc(labels.settingsRememberCursorPositionDesc)
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.rememberCursorPosition)
          .onChange(async (value) => {
            this.plugin.settings.rememberCursorPosition = value;
            await this.plugin.saveSettings();
            if (value) {
              const { registerPositionMemory } = await import("./position-memory");
              await registerPositionMemory(this.plugin);
            } else {
              const { unregisterPositionMemory } = await import("./position-memory");
              unregisterPositionMemory(this.plugin);
            }
          });
      });

  }

  private async confirmAndRunSetupAction(button: ButtonComponent): Promise<void> {
    const labels = localePack(this.plugin.settings.locale).labels;
    const confirmed = await confirmAction(
      this.plugin.app,
      labels.settingsSetupVaultConfirmTitle,
      labels.settingsSetupVaultConfirmMessage,
      labels.settingsSetupVaultConfirmButton,
      labels.cancel
    );
    if (!confirmed) return;
    await this.runSetupAction(button, { deps: "none" });
  }

  private async runSetupAction(button: ButtonComponent, options: Pick<SetupOptions, "deps">): Promise<void> {
    button.setDisabled(true);
    try {
      const result = await this.plugin.setupVault({
        locale: this.plugin.settings.locale,
        deps: options.deps
      });
      new Notice(this.setupNotice(result));
      this.renderSettings();
    } catch (error) {
      console.error(error);
      new Notice(`PARA-ZK error: ${errorMessage(error)}`);
    } finally {
      button.setDisabled(false);
    }
  }

  private setupNotice(result: SetupResult): string {
    const messages = localePack(this.plugin.settings.locale).messages;
    const dependencyChanges = result.dependencies.filter((dependency) => (
      dependency.action !== "none" && dependency.action !== "warn"
    )).length;
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
