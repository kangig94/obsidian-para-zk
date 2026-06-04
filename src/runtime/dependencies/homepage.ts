import type { App } from "obsidian";
import { isRecord } from "../../infra/records";
import type { ParaZkSettings } from "../../types";
import { normalizeVaultPath } from "../../vault/paths";
import type { DependencyConfiguration, DependencyConfigurationServices, PluginManager } from "./index";

export const HOMEPAGE_PLUGIN_ID = "homepage";

const HOMEPAGE_SETTINGS_PATH = ".obsidian/plugins/homepage/data.json";
const HOMEPAGE_NAME = "Main Homepage";

export const homepageDependencyConfiguration: DependencyConfiguration = {
  wouldConfigure: "would_configure_homepage",
  configured: "configured_homepage",
  isConfigured: isHomepageConfigured,
  configure: ensureHomepageConfigured
};

async function isHomepageConfigured(
  services: DependencyConfigurationServices,
  app: App,
  manager: PluginManager,
  settings: ParaZkSettings
): Promise<boolean> {
  const currentSettings = await services.readSettingsFile(app, HOMEPAGE_SETTINGS_PATH);
  const nextSettings = mergeHomepageSettings(currentSettings, settings);
  if (JSON.stringify(currentSettings) !== JSON.stringify(nextSettings)) return false;

  const runtimeSettings = services.readRuntimePluginSettings(manager, HOMEPAGE_PLUGIN_ID);
  if (!runtimeSettings) return true;
  return JSON.stringify(runtimeSettings) === JSON.stringify(mergeHomepageSettings(runtimeSettings, settings))
    && isRunningHomepageReady(manager);
}

async function ensureHomepageConfigured(
  services: DependencyConfigurationServices,
  app: App,
  manager: PluginManager,
  settings: ParaZkSettings
): Promise<boolean> {
  const currentSettings = await services.readSettingsFile(app, HOMEPAGE_SETTINGS_PATH);
  const nextSettings = mergeHomepageSettings(currentSettings, settings);
  const runtimeSettings = services.readRuntimePluginSettings(manager, HOMEPAGE_PLUGIN_ID);
  const runtimeChanged = runtimeSettings
    ? JSON.stringify(runtimeSettings) !== JSON.stringify(mergeHomepageSettings(runtimeSettings, settings))
    : false;
  const diskChanged = JSON.stringify(currentSettings) !== JSON.stringify(nextSettings);
  const changed = diskChanged || runtimeChanged || !isRunningHomepageReady(manager);
  if (!changed) return false;

  if (diskChanged) {
    await services.writeSettingsFile(app, HOMEPAGE_SETTINGS_PATH, nextSettings);
  }
  await updateRunningHomepageSettings(manager, nextSettings);
  return true;
}

function mergeHomepageSettings(
  current: Record<string, unknown>,
  settings: ParaZkSettings
): Record<string, unknown> {
  const homepages = isRecord(current.homepages) ? current.homepages : {};
  const currentHomepage = isRecord(homepages[HOMEPAGE_NAME]) ? homepages[HOMEPAGE_NAME] : {};

  return {
    ...current,
    version: 4,
    homepages: {
      ...homepages,
      [HOMEPAGE_NAME]: {
        ...currentHomepage,
        value: normalizeVaultPath(`${settings.paths.dashboardFolder}/HomePage`),
        kind: "File",
        openOnStartup: true,
        openMode: "Replace all open notes",
        manualOpenMode: "Keep open notes",
        view: "Default view",
        revertView: true,
        openWhenEmpty: true,
        refreshDataview: false,
        autoCreate: false,
        autoScroll: false,
        pin: false,
        commands: Array.isArray(currentHomepage.commands) ? currentHomepage.commands : [],
        alwaysApply: false,
        hideReleaseNotes: false
      }
    },
    separateMobile: false
  };
}

async function updateRunningHomepageSettings(
  manager: PluginManager,
  settings: Record<string, unknown>
): Promise<void> {
  const plugin = manager.plugins?.[HOMEPAGE_PLUGIN_ID];
  if (!isRecord(plugin)) return;

  plugin.settings = { ...settings };
  if (isRecord(plugin.homepage)) {
    const homepages = settings.homepages;
    if (isRecord(homepages) && isRecord(homepages[HOMEPAGE_NAME])) {
      plugin.homepage.data = { ...homepages[HOMEPAGE_NAME] };
    }
  }

  const saveSettings = plugin.saveSettings;
  if (typeof saveSettings === "function") {
    await saveSettings.call(plugin);
  } else {
    const saveData = plugin.saveData;
    if (typeof saveData === "function") {
      await saveData.call(plugin, plugin.settings);
    }
  }

  await activateRunningHomepage(plugin);
}

function isRunningHomepageReady(manager: PluginManager): boolean {
  const plugin = manager.plugins?.[HOMEPAGE_PLUGIN_ID];
  if (!isRecord(plugin)) return true;
  return plugin.loaded !== false && plugin.executing !== true;
}

async function activateRunningHomepage(plugin: Record<string, unknown>): Promise<void> {
  if (plugin.loaded === false) {
    plugin.loaded = true;
    const unpatchReleaseNotes = plugin.unpatchReleaseNotes;
    if (typeof unpatchReleaseNotes === "function") {
      unpatchReleaseNotes.call(plugin);
    }
  }
  if (plugin.executing === true) {
    plugin.executing = false;
  }

  const homepage = plugin.homepage;
  if (!isRecord(homepage)) return;

  const openWhenEmpty = homepage.openWhenEmpty;
  if (typeof openWhenEmpty === "function") {
    await openWhenEmpty.call(homepage);
  }
}
