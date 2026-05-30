import type { App } from "obsidian";
import { isRecord } from "../../records";
import type { DependencyConfiguration, DependencyConfigurationServices, PluginManager } from "./index";

export const DATAVIEW_PLUGIN_ID = "dataview";

const DATAVIEW_SETTINGS_PATH = ".obsidian/plugins/dataview/data.json";

export const dataviewDependencyConfiguration: DependencyConfiguration = {
  wouldConfigure: "would_enable_dataview_js",
  configured: "enabled_dataview_js",
  isConfigured: isDataviewJsEnabled,
  configure: ensureDataviewJsEnabled
};

async function isDataviewJsEnabled(
  services: DependencyConfigurationServices,
  app: App,
  manager: PluginManager
): Promise<boolean> {
  const settings = await services.readSettingsFile(app, DATAVIEW_SETTINGS_PATH);
  const runtime = readRuntimeDataviewSettings(manager);
  return settings.enableDataviewJs === true && (runtime === undefined || runtime.enableDataviewJs === true);
}

async function ensureDataviewJsEnabled(
  services: DependencyConfigurationServices,
  app: App,
  manager: PluginManager
): Promise<boolean> {
  const settings = await services.readSettingsFile(app, DATAVIEW_SETTINGS_PATH);
  const runtime = readRuntimeDataviewSettings(manager);
  const changed = settings.enableDataviewJs !== true || (runtime !== undefined && runtime.enableDataviewJs !== true);
  if (!changed) return false;

  const nextSettings = {
    ...settings,
    enableDataviewJs: true
  };

  await services.writeSettingsFile(app, DATAVIEW_SETTINGS_PATH, nextSettings);
  await updateRunningDataviewSettings(manager, nextSettings);
  return true;
}

function readRuntimeDataviewSettings(manager: PluginManager): Record<string, unknown> | undefined {
  const plugin = manager.plugins?.[DATAVIEW_PLUGIN_ID];
  if (!isRecord(plugin)) return undefined;
  return isRecord(plugin.settings) ? plugin.settings : undefined;
}

async function updateRunningDataviewSettings(
  manager: PluginManager,
  settings: Record<string, unknown>
): Promise<void> {
  const plugin = manager.plugins?.[DATAVIEW_PLUGIN_ID];
  if (!isRecord(plugin)) return;

  const updateSettings = plugin.updateSettings;
  if (typeof updateSettings === "function") {
    await updateSettings.call(plugin, { enableDataviewJs: true });
    return;
  }

  const currentSettings = isRecord(plugin.settings) ? plugin.settings : {};
  plugin.settings = {
    ...currentSettings,
    ...settings
  };

  const saveData = plugin.saveData;
  if (typeof saveData === "function") {
    await saveData.call(plugin, plugin.settings);
  }
}
