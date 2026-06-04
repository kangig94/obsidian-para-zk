import type { App } from "obsidian";
import { isRecord } from "../../infra/records";
import type { DependencyConfiguration, DependencyConfigurationServices, PluginManager } from "./index";

export const OPEN_TAB_SETTINGS_PLUGIN_ID = "open-tab-settings";

const OPEN_TAB_SETTINGS_PATH = ".obsidian/plugins/open-tab-settings/data.json";
const APP_CONFIG_PATH = ".obsidian/app.json";

export const openTabSettingsDependencyConfiguration: DependencyConfiguration = {
  wouldConfigure: "would_configure_open_tab_settings",
  configured: "configured_open_tab_settings",
  isConfigured: isOpenTabSettingsConfigured,
  configure: ensureOpenTabSettingsConfigured
};

async function isOpenTabSettingsConfigured(
  services: DependencyConfigurationServices,
  app: App,
  manager: PluginManager
): Promise<boolean> {
  const currentSettings = await services.readSettingsFile(app, OPEN_TAB_SETTINGS_PATH);
  const nextSettings = mergeOpenTabSettings(currentSettings);
  if (JSON.stringify(currentSettings) !== JSON.stringify(nextSettings)) return false;

  const runtimeSettings = services.readRuntimePluginSettings(manager, OPEN_TAB_SETTINGS_PLUGIN_ID);
  if (runtimeSettings && JSON.stringify(runtimeSettings) !== JSON.stringify(mergeOpenTabSettings(runtimeSettings))) return false;

  return await readFocusNewTab(app) === true;
}

async function ensureOpenTabSettingsConfigured(
  services: DependencyConfigurationServices,
  app: App,
  manager: PluginManager
): Promise<boolean> {
  const currentSettings = await services.readSettingsFile(app, OPEN_TAB_SETTINGS_PATH);
  const nextSettings = mergeOpenTabSettings(currentSettings);
  const runtimeSettings = services.readRuntimePluginSettings(manager, OPEN_TAB_SETTINGS_PLUGIN_ID);
  const settingsChanged = JSON.stringify(currentSettings) !== JSON.stringify(nextSettings);
  const runtimeChanged = runtimeSettings
    ? JSON.stringify(runtimeSettings) !== JSON.stringify(mergeOpenTabSettings(runtimeSettings))
    : false;
  const focusChanged = await readFocusNewTab(app) !== true;

  if (settingsChanged) {
    await services.writeSettingsFile(app, OPEN_TAB_SETTINGS_PATH, nextSettings);
  }
  if (settingsChanged || runtimeChanged) {
    await services.updateRunningPluginSettings(manager, OPEN_TAB_SETTINGS_PLUGIN_ID, nextSettings);
  }
  if (focusChanged) {
    await writeFocusNewTab(app, true);
  }

  return settingsChanged || runtimeChanged || focusChanged;
}

function mergeOpenTabSettings(current: Record<string, unknown>): Record<string, unknown> {
  return {
    ...current,
    openInNewTab: true,
    deduplicateTabs: true,
    deduplicateAcrossTabGroups: true,
    newTabPlacement: "after-active",
    newTabTabGroupPlacement: "same",
    modClickBehavior: "tab"
  };
}

async function readFocusNewTab(app: App): Promise<boolean | undefined> {
  const vault = app.vault as unknown as {
    getConfig?: (key: string) => unknown;
  };
  if (typeof vault.getConfig === "function") {
    const value = vault.getConfig("focusNewTab");
    if (typeof value === "boolean") return value;
  }

  const appConfig = await readAppConfig(app);
  return typeof appConfig.focusNewTab === "boolean" ? appConfig.focusNewTab : undefined;
}

async function writeFocusNewTab(app: App, value: boolean): Promise<void> {
  const appConfig = await readAppConfig(app);
  await writeAppConfig(app, {
    ...appConfig,
    focusNewTab: value
  });

  const vault = app.vault as unknown as {
    setConfig?: (key: string, value: unknown) => void;
    config?: unknown;
    requestSaveConfig?: () => void;
  };
  if (typeof vault.setConfig === "function") {
    vault.setConfig("focusNewTab", value);
    return;
  }

  if (isRecord(vault.config)) vault.config.focusNewTab = value;
  vault.requestSaveConfig?.();
}

async function readAppConfig(app: App): Promise<Record<string, unknown>> {
  if (!await app.vault.adapter.exists(APP_CONFIG_PATH)) return {};
  const raw = await app.vault.adapter.read(APP_CONFIG_PATH);
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) throw new Error(`${APP_CONFIG_PATH} is not a JSON object`);
  return parsed;
}

async function writeAppConfig(app: App, config: Record<string, unknown>): Promise<void> {
  await app.vault.adapter.write(APP_CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
}
