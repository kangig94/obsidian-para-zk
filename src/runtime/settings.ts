import type { Plugin } from "obsidian";
import { normalizeLocale } from "../i18n";
import {
  DEFAULT_SETTINGS,
  type ManagedFileState,
  type ParaZkSettings
} from "../types";
import { isRecord } from "../records";
import { joinVaultPath, normalizeVaultPath } from "../vault/paths";

export async function loadSettings(plugin: Plugin): Promise<ParaZkSettings> {
  return mergeSettings(await plugin.loadData());
}

export async function saveSettings(plugin: Plugin, settings: ParaZkSettings): Promise<void> {
  await plugin.saveData(settings);
}

function mergeSettings(loaded: unknown): ParaZkSettings {
  const data = isRecord(loaded) ? loaded : {};
  const paths = readPaths(data.paths);
  return {
    ...DEFAULT_SETTINGS,
    paths,
    layoutFolders: readLayoutFolders(data.layoutFolders, paths),
    locale: normalizeLocale(data.locale, DEFAULT_SETTINGS.locale),
    setupAt: typeof data.setupAt === "string" ? data.setupAt : undefined,
    managedFiles: readManagedFiles(data.managedFiles)
  };
}

function readLayoutFolders(value: unknown, paths: ParaZkSettings["paths"]): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_SETTINGS.layoutFolders];

  const legacyTaskRoots = joinVaultPath(paths.tasksFolder, "roots");
  const taskCurrent = joinVaultPath(paths.tasksFolder, "current");
  const taskArchives = joinVaultPath(paths.tasksFolder, "archives");
  const folders: string[] = [];

  for (const item of value) {
    const folder = normalizeVaultPath(String(item));
    if (!folder) continue;

    if (folder === legacyTaskRoots) {
      addUnique(folders, taskCurrent);
      addUnique(folders, taskArchives);
      continue;
    }

    addUnique(folders, folder);
  }

  return folders;
}

function readPaths(value: unknown): ParaZkSettings["paths"] {
  const data = isRecord(value) ? value : {};
  const paths = { ...DEFAULT_SETTINGS.paths };
  for (const key of Object.keys(paths) as Array<keyof ParaZkSettings["paths"]>) {
    const path = data[key];
    if (typeof path !== "string") continue;
    const normalized = normalizeVaultPath(path);
    if (normalized) paths[key] = normalized;
  }
  return paths;
}

function readManagedFiles(value: unknown): Record<string, ManagedFileState> {
  if (!isRecord(value)) return {};
  const result: Record<string, ManagedFileState> = {};
  for (const [path, state] of Object.entries(value)) {
    if (!isRecord(state)) continue;
    if (typeof state.hash !== "string" || typeof state.updatedAt !== "string") continue;
    result[normalizeVaultPath(path)] = {
      hash: state.hash,
      updatedAt: state.updatedAt
    };
  }
  return result;
}

function addUnique(items: string[], value: string): void {
  if (!value) return;
  if (!items.includes(value)) items.push(value);
}
