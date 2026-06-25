import type { App } from "obsidian";
import { PARA_ZK_PATHS } from "../layout";
import { isRecord } from "../records";
import { appendUniqueStrings } from "../text";
import type { SetupResult } from "../types";
import { joinVaultPath, normalizeVaultPath, obsidianConfigPath, parentFolder } from "../vault/paths";

const ATTACHMENT_FOLDER = "assets";

type ConfigState = {
  path: string;
  exists: boolean;
  value: Record<string, unknown>;
};

export async function configureObsidianCoreSettings(
  app: App,
  result: SetupResult,
  dryRun: boolean
): Promise<void> {
  const appConfig = await readConfig(app, appConfigPath(app), result);
  if (appConfig) {
    const nextAppConfig = mergeAppConfig(appConfig.value);
    await writeConfig(app, appConfig, nextAppConfig, result, dryRun);
    if (!dryRun) updateRuntimeAppConfig(app, nextAppConfig);
  }

  const templatesConfig = await readConfig(app, templatesConfigPath(app), result);
  if (templatesConfig) {
    const nextTemplatesConfig = mergeTemplatesConfig(templatesConfig.value);
    await writeConfig(app, templatesConfig, nextTemplatesConfig, result, dryRun);
    if (!dryRun) updateRuntimeTemplatesConfig(app, nextTemplatesConfig);
  }
}

function appConfigPath(app: App): string {
  return obsidianConfigPath(app.vault, "app.json");
}

function templatesConfigPath(app: App): string {
  return obsidianConfigPath(app.vault, "templates.json");
}

async function readConfig(app: App, path: string, result: SetupResult): Promise<ConfigState | undefined> {
  const exists = await app.vault.adapter.exists(path);
  if (!exists) return { path, exists: false, value: {} };

  try {
    const parsed: unknown = JSON.parse(await app.vault.adapter.read(path));
    if (!isRecord(parsed)) {
      addUnique(result.skipped, path);
      addUnique(result.warnings, `Skipped Obsidian config at ${path} because it is not a JSON object`);
      return undefined;
    }
    return { path, exists: true, value: parsed };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addUnique(result.skipped, path);
    addUnique(result.warnings, `Skipped Obsidian config at ${path} because it could not be parsed: ${message}`);
    return undefined;
  }
}

async function writeConfig(
  app: App,
  current: ConfigState,
  next: Record<string, unknown>,
  result: SetupResult,
  dryRun: boolean
): Promise<void> {
  if (JSON.stringify(current.value) === JSON.stringify(next)) {
    addUnique(result.existing, current.path);
    return;
  }

  if (current.exists) {
    addUnique(result.updated, current.path);
  } else {
    addUnique(result.created, current.path);
  }

  if (dryRun) return;

  await ensureAdapterFolder(app, parentFolder(current.path));
  await app.vault.adapter.write(current.path, `${JSON.stringify(next, null, 2)}\n`);
}

function mergeAppConfig(current: Record<string, unknown>): Record<string, unknown> {
  const legacyLogFilter = cleanIgnoreFilter(joinVaultPath(PARA_ZK_PATHS.wikiFolder, "log.md"));
  const prunedIgnoreFilters = Array.isArray(current.userIgnoreFilters)
    ? current.userIgnoreFilters.filter((item): item is string =>
      typeof item === "string" && item !== legacyLogFilter)
    : current.userIgnoreFilters;

  return {
    ...current,
    alwaysUpdateLinks: true,
    attachmentFolderPath: ATTACHMENT_FOLDER,
    trashOption: "local",
    userIgnoreFilters: appendUniqueStrings(prunedIgnoreFilters, [
      ignoreFilterFolder(PARA_ZK_PATHS.templatesFolder),
      // Obsidian's excluded-files filters are not recursive, so the nested managed
      // templates folder needs its own entry even though it sits under templatesFolder.
      ignoreFilterFolder(PARA_ZK_PATHS.managedTemplatesFolder),
      ignoreFilterFolder(PARA_ZK_PATHS.dashboardFolder),
      ignoreFilterFolder(PARA_ZK_PATHS.tasksFolder),
      "README"
    ].map(cleanIgnoreFilter)),
    propertiesInDocument: "hidden"
  };
}

function mergeTemplatesConfig(current: Record<string, unknown>): Record<string, unknown> {
  return {
    ...current,
    folder: normalizeVaultPath(PARA_ZK_PATHS.templatesFolder)
  };
}

function ignoreFilterFolder(folder: string): string {
  const normalized = normalizeVaultPath(folder);
  return normalized ? `${normalized}/` : "";
}

function cleanIgnoreFilter(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/g, "")
    .replace(/\/{2,}/g, "/");
}

async function ensureAdapterFolder(app: App, folder: string): Promise<void> {
  const parts = normalizeVaultPath(folder).split("/").filter(Boolean);
  let current = "";

  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (await app.vault.adapter.exists(current)) continue;
    await app.vault.adapter.mkdir(current);
  }
}

function updateRuntimeAppConfig(app: App, config: Record<string, unknown>): void {
  const vault = app.vault as unknown as {
    config?: unknown;
    requestSaveConfig?: () => void;
  };
  if (isRecord(vault.config)) Object.assign(vault.config, config);
  vault.requestSaveConfig?.();
}

function updateRuntimeTemplatesConfig(app: App, config: Record<string, unknown>): void {
  const internalPlugins = (app as unknown as { internalPlugins?: unknown }).internalPlugins;
  if (!isRecord(internalPlugins)) return;

  const plugins = internalPlugins.plugins;
  if (!isRecord(plugins)) return;

  const templates = plugins.templates;
  if (!isRecord(templates)) return;

  const instance = templates.instance;
  if (!isRecord(instance) || !isRecord(instance.options)) return;

  Object.assign(instance.options, config);
}

function addUnique(items: string[], value: string): void {
  if (!value) return;
  if (!items.includes(value)) items.push(value);
}
