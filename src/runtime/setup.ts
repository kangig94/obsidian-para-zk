import { App, TFile, TFolder } from "obsidian";
import { LAYOUT_FOLDERS, PARA_ZK_PATHS } from "../layout";
import { managedArtifacts } from "../templates";
import {
  type SetupOptions,
  type SetupResult,
  type ParaZkSettings
} from "../types";
import { joinVaultPath, normalizeVaultPath, parentFolder } from "../vault/paths";
import { resolveDependencies } from "./dependencies";
import { configureObsidianCoreSettings } from "./obsidian-core-config";

export async function setupVault(
  app: App,
  settings: ParaZkSettings,
  options: SetupOptions = {}
): Promise<{ result: SetupResult; settings: ParaZkSettings }> {
  const nextSettings: ParaZkSettings = {
    ...settings,
    locale: options.locale ?? settings.locale
  };
  const dryRun = options.dryRun ?? false;
  const result: SetupResult = {
    dryRun,
    created: [],
    updated: [],
    existing: [],
    skipped: [],
    warnings: [],
    dependencies: []
  };

  await migrateLegacyTaskRootsFolder(app, result, dryRun);

  const folders = Array.from(new Set(LAYOUT_FOLDERS.map(normalizeVaultPath).filter(Boolean)));
  for (const folder of folders) {
    await ensureFolder(app, folder, result, dryRun);
  }

  await configureObsidianCoreSettings(app, result, dryRun);

  for (const artifact of managedArtifacts(nextSettings)) {
    await writeManagedFile(app, artifact.path, artifact.content, result, dryRun);
  }

  result.dependencies = await resolveDependencies(app, {
    installDeps: options.installDeps ?? false,
    dryRun,
    warnings: result.warnings
  });

  if (!dryRun) {
    return {
      result,
      settings: nextSettings
    };
  }

  return { result, settings };
}

async function ensureFolder(app: App, folder: string, result: SetupResult, dryRun: boolean): Promise<void> {
  const parts = normalizeVaultPath(folder).split("/").filter(Boolean);
  let current = "";

  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const existing = app.vault.getAbstractFileByPath(current);
    if (existing instanceof TFolder) {
      addUnique(result.existing, current);
      continue;
    }
    if (existing) {
      addUnique(result.skipped, current);
      addUnique(result.warnings, `Cannot create folder because a file already exists at ${current}`);
      return;
    }
    addUnique(result.created, current);
    if (!dryRun) {
      await app.vault.createFolder(current);
    }
  }
}

async function migrateLegacyTaskRootsFolder(
  app: App,
  result: SetupResult,
  dryRun: boolean
): Promise<void> {
  const legacyPath = joinVaultPath(PARA_ZK_PATHS.tasksFolder, "roots");
  const currentPath = joinVaultPath(PARA_ZK_PATHS.tasksFolder, "current");
  if (legacyPath === currentPath) return;

  const legacyFolder = app.vault.getAbstractFileByPath(legacyPath);
  if (!(legacyFolder instanceof TFolder)) return;

  const currentFolder = app.vault.getAbstractFileByPath(currentPath);
  if (!currentFolder) {
    addUnique(result.updated, `${legacyPath} -> ${currentPath}`);
    if (!dryRun) {
      await ensureFolder(app, parentFolder(currentPath), result, false);
      await app.fileManager.renameFile(legacyFolder, currentPath);
    }
    return;
  }

  if (!(currentFolder instanceof TFolder)) {
    addUnique(result.skipped, legacyPath);
    addUnique(result.warnings, `Cannot migrate task registry because a file exists at ${currentPath}`);
    return;
  }

  for (const child of [...legacyFolder.children]) {
    const targetPath = joinVaultPath(currentPath, child.name);
    if (app.vault.getAbstractFileByPath(targetPath)) {
      addUnique(result.skipped, child.path);
      addUnique(result.warnings, `Skipped legacy task registry item because ${targetPath} already exists`);
      continue;
    }

    addUnique(result.updated, `${child.path} -> ${targetPath}`);
    if (!dryRun) await app.fileManager.renameFile(child, targetPath);
  }

  const refreshedLegacyFolder = app.vault.getAbstractFileByPath(legacyPath);
  if (refreshedLegacyFolder instanceof TFolder && refreshedLegacyFolder.children.length === 0) {
    addUnique(result.updated, legacyPath);
    if (!dryRun) await app.vault.delete(refreshedLegacyFolder, true);
  }
}

async function writeManagedFile(
  app: App,
  path: string,
  content: string,
  result: SetupResult,
  dryRun: boolean
): Promise<void> {
  const normalized = normalizeVaultPath(path);
  const existing = app.vault.getAbstractFileByPath(normalized);

  if (existing instanceof TFolder) {
    addUnique(result.skipped, normalized);
    addUnique(result.warnings, `Cannot create file because a folder already exists at ${normalized}`);
    return;
  }

  if (!existing) {
    await ensureFolder(app, parentFolder(normalized), result, dryRun);
    addUnique(result.created, normalized);
    if (!dryRun) {
      await app.vault.create(normalized, content);
    }
    return;
  }

  if (!(existing instanceof TFile)) {
    addUnique(result.skipped, normalized);
    addUnique(result.warnings, `Unsupported vault item at ${normalized}`);
    return;
  }

  const current = await app.vault.read(existing);

  if (current === content) {
    addUnique(result.existing, normalized);
    return;
  }

  addUnique(result.updated, normalized);
  if (!dryRun) {
    await app.vault.modify(existing, content);
  }
}

function addUnique(items: string[], value: string): void {
  if (!value) return;
  if (!items.includes(value)) items.push(value);
}
