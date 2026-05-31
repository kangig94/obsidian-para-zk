import { ButtonComponent, Notice, PluginSettingTab, Setting } from "obsidian";
import { localePack, normalizeLocale } from "../i18n";
import type { ParaZkPluginContext } from "../plugin-interface";
import type { InitOptions, InitResult } from "../types";
import { normalizeVaultPath } from "../vault/paths";
import { refreshRegisteredLocaleLabels } from "./locale-labels";

export class ParaZkSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: ParaZkPluginContext) {
    super(plugin.app, plugin);
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

    new Setting(containerEl)
      .setName(labels.settingsInitializeVault)
      .setDesc(labels.settingsInitializeVaultDesc)
      .addButton((button) => {
        button
          .setButtonText(labels.settingsInitializeVaultButton)
          .setCta()
          .onClick(() => {
            void this.runInitializeAction(button, { installDeps: false });
          });
      });

    new Setting(containerEl)
      .setName(labels.initInstallDeps)
      .setDesc(labels.initInstallDepsDesc)
      .addButton((button) => {
        button
          .setButtonText(labels.settingsInstallDepsButton)
          .onClick(() => {
            void this.runInitializeAction(button, { installDeps: true });
          });
      });

    new Setting(containerEl)
      .setName(labels.locale)
      .setDesc(labels.localeDesc)
      .addDropdown((dropdown) => {
        dropdown
          .addOption("ko", "ko")
          .addOption("en", "en")
          .setValue(this.plugin.settings.locale)
          .onChange(async (value) => {
            const previousLocale = this.plugin.settings.locale;
            this.plugin.settings.locale = normalizeLocale(value, previousLocale);
            await this.plugin.saveSettings();
            refreshRegisteredLocaleLabels(this.plugin, previousLocale);
            this.display();
          });
      });

    new Setting(containerEl)
      .setName(labels.layoutFolders)
      .setDesc(labels.layoutFoldersDesc)
      .addTextArea((text) => {
        text
          .setValue(this.plugin.settings.layoutFolders.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.layoutFolders = value
              .split(/\r?\n/)
              .map(normalizeVaultPath)
              .filter((folder) => folder.length > 0);
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 12;
      });
  }

  private async runInitializeAction(button: ButtonComponent, options: Pick<InitOptions, "installDeps">): Promise<void> {
    button.setDisabled(true);
    try {
      const result = await this.plugin.initializeVault({
        locale: this.plugin.settings.locale,
        force: false,
        installDeps: options.installDeps
      });
      new Notice(this.initNotice(result));
      this.display();
    } catch (error) {
      console.error(error);
      new Notice(`PARA-ZK error: ${errorMessage(error)}`);
    } finally {
      button.setDisabled(false);
    }
  }

  private initNotice(result: InitResult): string {
    const messages = localePack(this.plugin.settings.locale).messages;
    const dependencyChanges = result.dependencies.filter((dependency) => dependency.action !== "none").length;
    const parts = [
      `${messages.initReady}: ${result.created.length} created, ${result.updated.length} updated`
    ];
    if (dependencyChanges > 0) parts.push(`${dependencyChanges} dependency actions`);
    if (result.warnings.length > 0) parts.push(`${result.warnings.length} warnings`);
    return parts.join(", ");
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
