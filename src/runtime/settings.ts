import type { Plugin } from "obsidian";
import { normalizeLocale } from "../i18n";
import {
  DEFAULT_SETTINGS,
  type ManagedFileState,
  type ParaZkSettings
} from "../types";
import { isRecord } from "../records";
import { normalizeVaultPath } from "../vault/paths";

export async function loadSettings(plugin: Plugin): Promise<ParaZkSettings> {
  return mergeSettings(await plugin.loadData());
}

export async function saveSettings(plugin: Plugin, settings: ParaZkSettings): Promise<void> {
  await plugin.saveData(settings);
}

export function mergeSettings(loaded: unknown): ParaZkSettings {
  const data = isRecord(loaded) ? loaded : {};
  return {
    ...DEFAULT_SETTINGS,
    paths: readPaths(data.paths),
    layoutFolders: Array.isArray(data.layoutFolders)
      ? data.layoutFolders.map(String).map(normalizeVaultPath).filter(Boolean)
      : [...DEFAULT_SETTINGS.layoutFolders],
    locale: normalizeLocale(data.locale, DEFAULT_SETTINGS.locale),
    initializedAt: typeof data.initializedAt === "string" ? data.initializedAt : undefined,
    managedFiles: readManagedFiles(data.managedFiles)
  };
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
