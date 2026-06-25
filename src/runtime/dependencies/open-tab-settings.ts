import type { App } from "obsidian";
import { isRecord } from "../../records";
import { obsidianConfigPath } from "../../vault/paths";
import type { DependencyConfiguration, DependencyConfigurationServices, PluginManager } from "./index";

export const OPEN_TAB_SETTINGS_PLUGIN_ID = "open-tab-settings";

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
  const currentSettings = await services.readSettingsFile(app, openTabSettingsPath(app));
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
  const currentSettings = await services.readSettingsFile(app, openTabSettingsPath(app));
  const nextSettings = mergeOpenTabSettings(currentSettings);
  const runtimeSettings = services.readRuntimePluginSettings(manager, OPEN_TAB_SETTINGS_PLUGIN_ID);
  const settingsChanged = JSON.stringify(currentSettings) !== JSON.stringify(nextSettings);
  const runtimeChanged = runtimeSettings
    ? JSON.stringify(runtimeSettings) !== JSON.stringify(mergeOpenTabSettings(runtimeSettings))
    : false;
  const focusChanged = await readFocusNewTab(app) !== true;

  if (settingsChanged) {
    await services.writeSettingsFile(app, openTabSettingsPath(app), nextSettings);
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
  const path = appConfigPath(app);
  if (!await app.vault.adapter.exists(path)) return {};
  const raw = await app.vault.adapter.read(path);
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) throw new Error(`${path} is not a JSON object`);
  return parsed;
}

async function writeAppConfig(app: App, config: Record<string, unknown>): Promise<void> {
  await app.vault.adapter.write(appConfigPath(app), `${JSON.stringify(config, null, 2)}\n`);
}

function openTabSettingsPath(app: App): string {
  return obsidianConfigPath(app.vault, "plugins", OPEN_TAB_SETTINGS_PLUGIN_ID, "data.json");
}

function appConfigPath(app: App): string {
  return obsidianConfigPath(app.vault, "app.json");
}
