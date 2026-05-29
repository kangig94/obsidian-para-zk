import { App, requestUrl, type PluginManifest } from "obsidian";
import { isRecord } from "../records";
import type { DependencyAction, DependencyResult, ParaZkSettings } from "../types";
import { normalizeVaultPath } from "../vault/paths";

type RequiredDependency = {
  id: string;
  name: string;
  repo: string;
  reason: string;
};

type PluginManager = {
  manifests?: Record<string, PluginManifest | undefined>;
  plugins?: Record<string, unknown>;
  enabledPlugins?: Set<string>;
  installPlugin?: (repo: string, version: string, manifest: PluginManifest) => Promise<unknown>;
  enablePluginAndSave?: (id: string) => Promise<boolean>;
  enablePlugin?: (id: string, save?: boolean) => Promise<boolean>;
  requestSaveConfig?: () => void;
};

const REQUIRED_DEPENDENCIES: RequiredDependency[] = [
  {
    id: "dataview",
    name: "Dataview",
    repo: "blacksmithgu/obsidian-dataview",
    reason: "PARA-ZK dashboards use Dataview and DataviewJS blocks"
  },
  {
    id: "obsidian-tasks-plugin",
    name: "Tasks",
    repo: "obsidian-tasks-group/obsidian-tasks",
    reason: "PARA-ZK dashboards use Tasks query blocks"
  },
  {
    id: "tabs",
    name: "Tabs",
    repo: "xhuajin/obsidian-tabs",
    reason: "PARA-ZK area templates use Tabs blocks to separate open and completed tasks"
  },
  {
    id: "folder-notes",
    name: "Folder notes",
    repo: "LostPaul/obsidian-folder-notes",
    reason: "PARA-ZK uses folder-style project and area notes that should open from folder clicks"
  },
  {
    id: "update-time-on-edit",
    name: "Update time on edit",
    repo: "beaussan/update-time-on-edit-obsidian",
    reason: "PARA-ZK relies on created and updated frontmatter staying current after human edits"
  }
];

const COMMUNITY_PLUGINS_CONFIG = ".obsidian/community-plugins.json";
const DATAVIEW_PLUGIN_ID = "dataview";
const DATAVIEW_PLUGIN_DIR = ".obsidian/plugins/dataview";
const DATAVIEW_SETTINGS_PATH = `${DATAVIEW_PLUGIN_DIR}/data.json`;
const UPDATE_TIME_PLUGIN_ID = "update-time-on-edit";
const UPDATE_TIME_PLUGIN_DIR = ".obsidian/plugins/update-time-on-edit";
const UPDATE_TIME_SETTINGS_PATH = `${UPDATE_TIME_PLUGIN_DIR}/data.json`;
const ATTACHMENT_FOLDER = "assets";

export async function resolveDependencies(
  app: App,
  options: {
    installDeps: boolean;
    dryRun: boolean;
    settings: ParaZkSettings;
    warnings: string[];
  }
): Promise<DependencyResult[]> {
  const manager = readPluginManager(app);
  if (!manager) {
    options.warnings.push("Cannot inspect Obsidian community plugins; app.plugins API is unavailable");
    return REQUIRED_DEPENDENCIES.map((dependency) => ({
      ...baseResult(dependency),
      installed: false,
      enabled: false,
      action: "failed",
      error: "app.plugins API is unavailable"
    }));
  }

  const results: DependencyResult[] = [];
  for (const dependency of REQUIRED_DEPENDENCIES) {
    const enabledConfig = await readEnabledPluginConfig(app);
    const before = readDependencyState(manager, dependency, enabledConfig);
    const result: DependencyResult = {
      ...baseResult(dependency),
      ...before,
      action: "none"
    };

    if (before.installed && before.enabled) {
      if (options.installDeps && !options.dryRun && !enabledConfig?.has(dependency.id)) {
        await ensureEnabledPluginConfig(app, dependency.id);
        result.action = "enabled";
      }
      await configureDependency(app, manager, dependency, result, options);
      results.push(result);
      continue;
    }

    if (!options.installDeps) {
      result.action = "warn";
      options.warnings.push(dependencyWarning(dependency, before));
      results.push(result);
      continue;
    }

    if (options.dryRun) {
      result.action = before.installed ? "would_enable" : "would_install_and_enable";
      options.warnings.push(`Would ${before.installed ? "enable" : "install and enable"} required plugin ${dependency.name} (${dependency.id})`);
      await configureDependency(app, manager, dependency, result, options);
      results.push(result);
      continue;
    }

    const finalResult = await installOrEnableDependency(app, manager, dependency, result, options.warnings);
    await configureDependency(app, manager, dependency, finalResult, options);
    results.push(finalResult);
  }

  return results;
}

async function configureDependency(
  app: App,
  manager: PluginManager,
  dependency: RequiredDependency,
  result: DependencyResult,
  options: {
    dryRun: boolean;
    settings: ParaZkSettings;
    warnings: string[];
  }
): Promise<void> {
  if (dependency.id !== DATAVIEW_PLUGIN_ID && dependency.id !== UPDATE_TIME_PLUGIN_ID) return;
  if (!result.installed && !options.dryRun) return;

  try {
    if (dependency.id === UPDATE_TIME_PLUGIN_ID) {
      if (options.dryRun) {
        if (!await isUpdateTimeOnEditConfigured(app, manager, options.settings)) {
          addConfigured(result, "would_configure_update_time_on_edit");
        }
        return;
      }

      if (await ensureUpdateTimeOnEditConfigured(app, manager, options.settings)) {
        addConfigured(result, "configured_update_time_on_edit");
      }
      return;
    }

    if (options.dryRun) {
      if (!await isDataviewJsEnabled(app, manager)) addConfigured(result, "would_enable_dataview_js");
      return;
    }

    if (await ensureDataviewJsEnabled(app, manager)) {
      addConfigured(result, "enabled_dataview_js");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.warnings.push(`Failed to enable Dataview JavaScript queries: ${message}`);
  }
}

async function installOrEnableDependency(
  app: App,
  manager: PluginManager,
  dependency: RequiredDependency,
  result: DependencyResult,
  warnings: string[]
): Promise<DependencyResult> {
  try {
    const wasInstalled = result.installed;
    if (!result.installed) {
      const { releaseTag, manifest } = await fetchLatestReleaseManifest(dependency);
      result.latestVersion = manifest.version;
      await installDependency(manager, dependency, releaseTag, manifest);
      Object.assign(result, readDependencyState(manager, dependency, await readEnabledPluginConfig(app)));
    }

    if (!result.enabled) {
      const enabled = await enableDependency(manager, dependency.id);
      if (enabled) await ensureEnabledPluginConfig(app, dependency.id);
      Object.assign(result, readDependencyState(manager, dependency, await readEnabledPluginConfig(app)), { enabled });
    }

    if (result.installed && result.enabled) {
      result.action = wasInstalled ? result.action : "installed_and_enabled";
      if (result.action === "none" || result.action === "warn") result.action = "enabled";
      return result;
    }

    result.action = "failed";
    result.error = `Failed to enable ${dependency.id}`;
    warnings.push(result.error);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.action = "failed";
    result.error = message;
    Object.assign(result, readDependencyState(manager, dependency));
    warnings.push(`Failed to install or enable required plugin ${dependency.name} (${dependency.id}): ${message}`);
    return result;
  }
}

async function installDependency(
  manager: PluginManager,
  dependency: RequiredDependency,
  version: string,
  manifest: PluginManifest
): Promise<void> {
  if (!manager.installPlugin) throw new Error("app.plugins.installPlugin API is unavailable");
  await manager.installPlugin(dependency.repo, version, manifest);
}

async function enableDependency(manager: PluginManager, id: string): Promise<boolean> {
  if (manager.enablePluginAndSave) return manager.enablePluginAndSave(id);
  if (manager.enablePlugin) {
    const enabled = await manager.enablePlugin(id, true);
    if (enabled) {
      manager.enabledPlugins?.add(id);
      manager.requestSaveConfig?.();
    }
    return enabled;
  }
  if (manager.enabledPlugins?.has(id)) {
    manager.requestSaveConfig?.();
    return true;
  }
  throw new Error("app.plugins.enablePluginAndSave API is unavailable");
}

async function fetchLatestReleaseManifest(dependency: RequiredDependency): Promise<{
  releaseTag: string;
  manifest: PluginManifest;
}> {
  const latest = await requestJson(`https://api.github.com/repos/${dependency.repo}/releases/latest`);
  const releaseTag = readString(latest, "tag_name");
  if (!releaseTag) throw new Error(`Cannot resolve latest release for ${dependency.repo}`);

  const manifest = await requestJson(
    `https://github.com/${dependency.repo}/releases/download/${encodeURIComponent(releaseTag)}/manifest.json`
  );
  const pluginManifest = readPluginManifest(manifest);
  if (pluginManifest.id !== dependency.id) {
    throw new Error(`Release manifest id mismatch for ${dependency.repo}: expected ${dependency.id}, got ${pluginManifest.id}`);
  }

  return { releaseTag, manifest: pluginManifest };
}

async function requestJson(url: string): Promise<unknown> {
  const response = await requestUrl({
    url,
    headers: { "User-Agent": "obsidian-para-zk" }
  });
  return response.json;
}

function readPluginManager(app: App): PluginManager | undefined {
  const candidate = (app as unknown as { plugins?: unknown }).plugins;
  return isRecord(candidate) ? candidate as PluginManager : undefined;
}

function readDependencyState(
  manager: PluginManager,
  dependency: RequiredDependency,
  enabledConfig?: Set<string>
): Pick<DependencyResult, "installed" | "enabled" | "installedVersion"> {
  const manifest = manager.manifests?.[dependency.id];
  return {
    installed: Boolean(manifest),
    enabled: enabledConfig?.has(dependency.id)
      ?? manager.enabledPlugins?.has(dependency.id)
      ?? Boolean(manager.plugins?.[dependency.id]),
    installedVersion: manifest?.version
  };
}

async function readEnabledPluginConfig(app: App): Promise<Set<string> | undefined> {
  try {
    if (!await app.vault.adapter.exists(COMMUNITY_PLUGINS_CONFIG)) return undefined;
    const raw = await app.vault.adapter.read(COMMUNITY_PLUGINS_CONFIG);
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    return new Set(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return undefined;
  }
}

async function ensureEnabledPluginConfig(app: App, id: string): Promise<void> {
  const enabled = await readEnabledPluginConfig(app) ?? new Set<string>();
  if (enabled.has(id)) return;
  enabled.add(id);
  await app.vault.adapter.write(
    COMMUNITY_PLUGINS_CONFIG,
    `${JSON.stringify(Array.from(enabled), null, 2)}\n`
  );
}

async function isDataviewJsEnabled(app: App, manager: PluginManager): Promise<boolean> {
  const settings = await readDataviewSettings(app);
  const runtime = readRuntimeDataviewSettings(manager);
  return settings.enableDataviewJs === true && (runtime === undefined || runtime.enableDataviewJs === true);
}

async function ensureDataviewJsEnabled(app: App, manager: PluginManager): Promise<boolean> {
  const settings = await readDataviewSettings(app);
  const runtime = readRuntimeDataviewSettings(manager);
  const changed = settings.enableDataviewJs !== true || (runtime !== undefined && runtime.enableDataviewJs !== true);
  if (!changed) return false;

  const nextSettings = {
    ...settings,
    enableDataviewJs: true
  };

  await ensureAdapterFolder(app, DATAVIEW_PLUGIN_DIR);
  await app.vault.adapter.write(DATAVIEW_SETTINGS_PATH, `${JSON.stringify(nextSettings, null, 2)}\n`);
  await updateRunningDataviewSettings(manager, nextSettings);
  return true;
}

async function readDataviewSettings(app: App): Promise<Record<string, unknown>> {
  if (!await app.vault.adapter.exists(DATAVIEW_SETTINGS_PATH)) return {};
  const raw = await app.vault.adapter.read(DATAVIEW_SETTINGS_PATH);
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) throw new Error(`${DATAVIEW_SETTINGS_PATH} is not a JSON object`);
  return parsed;
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

async function isUpdateTimeOnEditConfigured(
  app: App,
  manager: PluginManager,
  settings: ParaZkSettings
): Promise<boolean> {
  const currentSettings = await readUpdateTimeOnEditSettings(app);
  const nextSettings = mergeUpdateTimeOnEditSettings(currentSettings, settings);
  if (JSON.stringify(currentSettings) !== JSON.stringify(nextSettings)) return false;

  const runtimeSettings = readRuntimePluginSettings(manager, UPDATE_TIME_PLUGIN_ID);
  if (!runtimeSettings) return true;
  return JSON.stringify(runtimeSettings) === JSON.stringify(mergeUpdateTimeOnEditSettings(runtimeSettings, settings));
}

async function ensureUpdateTimeOnEditConfigured(
  app: App,
  manager: PluginManager,
  settings: ParaZkSettings
): Promise<boolean> {
  const currentSettings = await readUpdateTimeOnEditSettings(app);
  const nextSettings = mergeUpdateTimeOnEditSettings(currentSettings, settings);
  const runtimeSettings = readRuntimePluginSettings(manager, UPDATE_TIME_PLUGIN_ID);
  const runtimeChanged = runtimeSettings
    ? JSON.stringify(runtimeSettings) !== JSON.stringify(mergeUpdateTimeOnEditSettings(runtimeSettings, settings))
    : false;
  const changed = JSON.stringify(currentSettings) !== JSON.stringify(nextSettings) || runtimeChanged;
  if (!changed) return false;

  await ensureAdapterFolder(app, UPDATE_TIME_PLUGIN_DIR);
  await app.vault.adapter.write(UPDATE_TIME_SETTINGS_PATH, `${JSON.stringify(nextSettings, null, 2)}\n`);
  await updateRunningPluginSettings(manager, UPDATE_TIME_PLUGIN_ID, nextSettings);
  return true;
}

async function readUpdateTimeOnEditSettings(app: App): Promise<Record<string, unknown>> {
  if (!await app.vault.adapter.exists(UPDATE_TIME_SETTINGS_PATH)) return {};
  const raw = await app.vault.adapter.read(UPDATE_TIME_SETTINGS_PATH);
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) throw new Error(`${UPDATE_TIME_SETTINGS_PATH} is not a JSON object`);
  return parsed;
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
    ignoreGlobalFolder: mergeStringList(current.ignoreGlobalFolder, [
      settings.paths.templatesFolder,
      settings.paths.dashboardFolder,
      ATTACHMENT_FOLDER,
      "README"
    ]),
    ignoreCreatedFolder: mergeStringList(current.ignoreCreatedFolder, [
      settings.paths.templatesFolder,
      settings.paths.dashboardFolder,
      "README"
    ]),
    enableExperimentalHash: true
  };
}

function mergeStringList(current: unknown, desired: string[]): string[] {
  const merged = Array.isArray(current)
    ? current.filter((item): item is string => typeof item === "string")
    : [];

  for (const item of desired.map(normalizeVaultPath).filter(Boolean)) {
    if (!merged.includes(item)) merged.push(item);
  }

  return merged;
}

function readRuntimePluginSettings(manager: PluginManager, id: string): Record<string, unknown> | undefined {
  const plugin = manager.plugins?.[id];
  if (!isRecord(plugin)) return undefined;
  return isRecord(plugin.settings) ? plugin.settings : undefined;
}

async function updateRunningPluginSettings(
  manager: PluginManager,
  id: string,
  settings: Record<string, unknown>
): Promise<void> {
  const plugin = manager.plugins?.[id];
  if (!isRecord(plugin)) return;

  if (isRecord(plugin.settings)) {
    Object.assign(plugin.settings, settings);
  } else {
    plugin.settings = { ...settings };
  }

  const saveSettings = plugin.saveSettings;
  if (typeof saveSettings === "function") {
    await saveSettings.call(plugin);
    return;
  }

  const saveData = plugin.saveData;
  if (typeof saveData === "function") {
    await saveData.call(plugin, plugin.settings);
  }
}

async function ensureAdapterFolder(app: App, path: string): Promise<void> {
  if (!path) return;
  if (await app.vault.adapter.exists(path)) return;
  await ensureAdapterFolder(app, parentAdapterFolder(path));
  await app.vault.adapter.mkdir(path);
}

function parentAdapterFolder(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function readPluginManifest(value: unknown): PluginManifest {
  if (!isRecord(value)) throw new Error("Release manifest is not an object");
  const id = readString(value, "id");
  const name = readString(value, "name");
  const version = readString(value, "version");
  const minAppVersion = readString(value, "minAppVersion");
  const description = readString(value, "description");
  const author = readString(value, "author");
  if (!id || !name || !version || !minAppVersion || !description || !author) {
    throw new Error("Release manifest is missing required fields");
  }
  return {
    id,
    name,
    version,
    minAppVersion,
    description,
    author,
    authorUrl: readString(value, "authorUrl"),
    isDesktopOnly: readOptionalBoolean(value, "isDesktopOnly")
  };
}

function readString(value: unknown, key: string): string | undefined {
  return isRecord(value) && typeof value[key] === "string" ? value[key] : undefined;
}

function readOptionalBoolean(value: unknown, key: string): boolean | undefined {
  return isRecord(value) && typeof value[key] === "boolean" ? value[key] : undefined;
}

function baseResult(dependency: RequiredDependency): Pick<DependencyResult, "id" | "name" | "repo"> {
  return {
    id: dependency.id,
    name: dependency.name,
    repo: dependency.repo
  };
}

function addConfigured(result: DependencyResult, value: string): void {
  result.configured = Array.from(new Set([...(result.configured ?? []), value]));
}

function dependencyWarning(
  dependency: RequiredDependency,
  state: Pick<DependencyResult, "installed" | "enabled">
): string {
  const status = state.installed ? "installed but disabled" : "not installed";
  return `Required plugin ${dependency.name} (${dependency.id}) is ${status}; ${dependency.reason}. Re-run para-zk:init installDeps=true to install/enable dependencies.`;
}
