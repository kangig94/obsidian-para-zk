import { PluginSettingTab, Setting } from "obsidian";
import { localePack, normalizeLocale } from "../i18n";
import type { ParaZkPluginContext } from "../plugin-interface";
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
}
