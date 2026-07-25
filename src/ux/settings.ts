import { ButtonComponent, Notice, PluginSettingTab, Setting } from "obsidian";
import type { PluginManifest } from "obsidian";
import { localePack, normalizeLocale } from "../i18n";
import { BUY_ME_A_COFFEE_BADGE_URI, GITHUB_SPONSORS_MARK_URI } from "./donate-badges";
import type { ParaZkPluginContext } from "../plugin-interface";
import type { SetupOptions, SetupResult } from "../types";
import { refreshEditorWidthControl } from "./editor-width";
import { refreshExplorerActions } from "./actions/explorer";
import { refreshRegisteredLocaleLabels } from "./locale-labels";
import { refreshRibbonActions } from "./actions/ribbon";
import { confirmAction } from "./prompts";

// Obsidian 1.13 adds these interfaces to the public API. Keep a structural
// compatibility type here while minAppVersion (and therefore the pinned
// Obsidian type package) remains on 1.12.3.
type CompatibleSettingDefinition = {
  name: string;
  desc?: string;
  render: (setting: Setting, group?: unknown) => void | (() => void);
};

export class ParaZkSettingTab extends PluginSettingTab {
  private readonly plugin: ParaZkPluginContext;

  constructor(plugin: ParaZkPluginContext) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  // Obsidian 1.13+ uses these definitions for rendering and settings search.
  // Older versions ignore this method and continue through display().
  getSettingDefinitions(): CompatibleSettingDefinition[] {
    return this.settingDefinitions();
  }

  display(): void {
    this.renderSettings();
  }

  private renderSettings(): void {
    const { containerEl } = this;
    containerEl.empty();

    for (const definition of this.settingDefinitions()) {
      const setting = new Setting(containerEl).setName(definition.name);
      if (definition.desc) setting.setDesc(definition.desc);
      definition.render(setting);
    }
  }

  private settingDefinitions(): CompatibleSettingDefinition[] {
    const labels = localePack(this.plugin.settings.locale).labels;
    const definitions: CompatibleSettingDefinition[] = [
      {
        name: labels.settingsHeading,
        desc: labels.settingsNote,
        render: (setting) => {
          setting.setHeading();
        }
      },
      {
        name: labels.settingsSetupVault,
        desc: labels.settingsSetupVaultDesc,
        render: (setting) => {
          // Fixed English caption to the left of the language picker; it stays
          // "Language:" regardless of the selected locale.
          setting.controlEl.createSpan({ cls: "para-zk-language-label", text: "Language:" });
          setting
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
                  this.refreshSettings();
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
        }
      },
      {
        name: labels.setupRequiredDeps,
        desc: labels.setupRequiredDepsDesc,
        render: (setting) => {
          setting.addButton((button) => {
            button
              .setButtonText(labels.settingsInstallRequiredDepsButton)
              .onClick(() => {
                void this.runSetupAction(button, { deps: "required" });
              });
          });
        }
      },
      {
        name: labels.setupEnhancementDeps,
        desc: labels.setupEnhancementDepsDesc,
        render: (setting) => {
          setting.addButton((button) => {
            button
              .setButtonText(labels.settingsInstallEnhancementDepsButton)
              .onClick(() => {
                void this.runSetupAction(button, { deps: "enhancements" });
              });
          });
        }
      },
      {
        name: labels.settingsShowRibbon,
        desc: labels.settingsShowRibbonDesc,
        render: (setting) => {
          setting.addToggle((toggle) => {
            toggle
              .setValue(this.plugin.settings.showRibbon)
              .onChange(async (value) => {
                this.plugin.settings.showRibbon = value;
                await this.plugin.saveSettings();
                refreshRibbonActions(this.plugin);
              });
          });
        }
      },
      {
        name: labels.settingsEmptyTrashAction,
        desc: labels.settingsEmptyTrashActionDesc,
        render: (setting) => {
          setting.addToggle((toggle) => {
            toggle
              .setValue(this.plugin.settings.showEmptyTrashAction)
              .onChange(async (value) => {
                this.plugin.settings.showEmptyTrashAction = value;
                await this.plugin.saveSettings();
                refreshExplorerActions(this.plugin);
              });
          });
        }
      },
      {
        name: labels.settingsEditorWidthSlider,
        desc: labels.settingsEditorWidthSliderDesc,
        render: (setting) => {
          setting.addToggle((toggle) => {
            toggle
              .setValue(this.plugin.settings.editorWidthSliderEnabled)
              .onChange(async (value) => {
                this.plugin.settings.editorWidthSliderEnabled = value;
                await this.plugin.saveSettings();
                refreshEditorWidthControl(this.plugin);
              });
          });
        }
      },
      {
        name: labels.settingsRememberCursorPosition,
        desc: labels.settingsRememberCursorPositionDesc,
        render: (setting) => {
          setting.addToggle((toggle) => {
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
      }
    ];

    const links = fundingLinks(this.plugin.manifest);
    if (links) {
      definitions.push({
        name: labels.settingsSupportHeading,
        desc: labels.settingsSupportNote,
        render: (setting) => {
          setting.setHeading();
          this.renderSupportLinks(setting.settingEl, links);
        }
      });
    }
    return definitions;
  }

  private renderSupportLinks(containerEl: HTMLElement, links: FundingLinks): void {
    const row = containerEl.createDiv({ cls: "para-zk-donate-row" });
    const sponsors = row.createEl("a", {
      cls: "para-zk-donate-button is-sponsors",
      href: links.githubSponsors,
      attr: { target: "_blank", rel: "noopener", "aria-label": "GitHub Sponsors" }
    });
    sponsors.createEl("img", {
      cls: "para-zk-donate-icon",
      attr: { src: GITHUB_SPONSORS_MARK_URI, alt: "" }
    });
    sponsors.createSpan({ cls: "para-zk-donate-label", text: "Sponsors" });

    const coffee = row.createEl("a", {
      cls: "para-zk-donate-badge",
      href: links.buyMeACoffee,
      attr: { target: "_blank", rel: "noopener", "aria-label": "Buy me a coffee" }
    });
    coffee.createEl("img", {
      cls: "para-zk-donate-badge-img",
      attr: { src: BUY_ME_A_COFFEE_BADGE_URI, alt: "Buy me a coffee" }
    });
  }

  private refreshSettings(): void {
    const update = (this as PluginSettingTab & { update?: () => void }).update;
    if (typeof update === "function") {
      update.call(this);
      return;
    }
    this.renderSettings();
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
      this.refreshSettings();
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

type FundingLinks = {
  githubSponsors: string;
  buyMeACoffee: string;
};

// The manifest fundingUrl is the single source for the sponsor account; both
// donation buttons are derived from its trailing handle so README, manifest, and
// settings stay in sync.
export function fundingLinks(manifest: PluginManifest): FundingLinks | null {
  const fundingUrl = (manifest as { fundingUrl?: string }).fundingUrl;
  const account = typeof fundingUrl === "string"
    ? fundingUrl.split("/").filter(Boolean).pop() ?? ""
    : "";
  if (!account) return null;
  return {
    githubSponsors: `https://github.com/sponsors/${account}`,
    buyMeACoffee: `https://www.buymeacoffee.com/${account}`
  };
}
