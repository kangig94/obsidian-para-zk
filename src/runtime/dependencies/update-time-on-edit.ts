import type { App } from "obsidian";
import type { ParaZkSettings } from "../../types";
import { appendUniqueStrings } from "../../text";
import { normalizeVaultPath } from "../../vault/paths";
import type { DependencyConfiguration, DependencyConfigurationServices, PluginManager } from "./index";

export const UPDATE_TIME_PLUGIN_ID = "update-time-on-edit";

const UPDATE_TIME_SETTINGS_PATH = ".obsidian/plugins/update-time-on-edit/data.json";
const ATTACHMENT_FOLDER = "assets";

export const updateTimeOnEditDependencyConfiguration: DependencyConfiguration = {
  wouldConfigure: "would_configure_update_time_on_edit",
  configured: "configured_update_time_on_edit",
  isConfigured: isUpdateTimeOnEditConfigured,
  configure: ensureUpdateTimeOnEditConfigured
};

async function isUpdateTimeOnEditConfigured(
  services: DependencyConfigurationServices,
  app: App,
  manager: PluginManager,
  settings: ParaZkSettings
): Promise<boolean> {
  const currentSettings = await services.readSettingsFile(app, UPDATE_TIME_SETTINGS_PATH);
  const nextSettings = mergeUpdateTimeOnEditSettings(currentSettings, settings);
  if (JSON.stringify(currentSettings) !== JSON.stringify(nextSettings)) return false;

  const runtimeSettings = services.readRuntimePluginSettings(manager, UPDATE_TIME_PLUGIN_ID);
  if (!runtimeSettings) return true;
  return JSON.stringify(runtimeSettings) === JSON.stringify(mergeUpdateTimeOnEditSettings(runtimeSettings, settings));
}

async function ensureUpdateTimeOnEditConfigured(
  services: DependencyConfigurationServices,
  app: App,
  manager: PluginManager,
  settings: ParaZkSettings
): Promise<boolean> {
  const currentSettings = await services.readSettingsFile(app, UPDATE_TIME_SETTINGS_PATH);
  const nextSettings = mergeUpdateTimeOnEditSettings(currentSettings, settings);
  const runtimeSettings = services.readRuntimePluginSettings(manager, UPDATE_TIME_PLUGIN_ID);
  const runtimeChanged = runtimeSettings
    ? JSON.stringify(runtimeSettings) !== JSON.stringify(mergeUpdateTimeOnEditSettings(runtimeSettings, settings))
    : false;
  const changed = JSON.stringify(currentSettings) !== JSON.stringify(nextSettings) || runtimeChanged;
  if (!changed) return false;

  await services.writeSettingsFile(app, UPDATE_TIME_SETTINGS_PATH, nextSettings);
  await services.updateRunningPluginSettings(manager, UPDATE_TIME_PLUGIN_ID, nextSettings);
  return true;
}

function mergeUpdateTimeOnEditSettings(
  current: Record<string, unknown>,
  settings: ParaZkSettings
): Record<string, unknown> {
  return {
    ...current,
    dateFormat: "yyyy-MM-dd'T'HH:mm",
    enableCreateTime: true,
    headerUpdated: "updated",
    headerCreated: "created",
    minMinutesBetweenSaves: 1,
    ignoreGlobalFolder: appendUniqueStrings(current.ignoreGlobalFolder, [
      settings.paths.templatesFolder,
      settings.paths.dashboardFolder,
      settings.paths.tasksFolder,
      ATTACHMENT_FOLDER,
      "README"
    ].map(normalizeVaultPath)),
    ignoreCreatedFolder: appendUniqueStrings(current.ignoreCreatedFolder, [
      settings.paths.templatesFolder,
      settings.paths.dashboardFolder,
      settings.paths.tasksFolder,
      "README"
    ].map(normalizeVaultPath)),
    enableExperimentalHash: true
  };
}
