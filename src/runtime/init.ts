import { App, TFile, TFolder } from "obsidian";
import { managedArtifacts } from "../templates";
import {
  type InitOptions,
  type InitResult,
  type ManagedFileState,
  type ParaZkSettings
} from "../types";
import { normalizeVaultPath } from "../vault/paths";
import { resolveDependencies } from "./dependencies";

export async function initializeVault(
  app: App,
  settings: ParaZkSettings,
  options: InitOptions = {}
): Promise<{ result: InitResult; settings: ParaZkSettings }> {
  const nextSettings: ParaZkSettings = {
    ...settings,
    paths: { ...settings.paths },
    layoutFolders: [...settings.layoutFolders],
    locale: options.locale ?? settings.locale,
    managedFiles: { ...settings.managedFiles }
  };
  const dryRun = options.dryRun ?? false;
  const force = options.force ?? false;
  const result: InitResult = {
    dryRun,
    created: [],
    updated: [],
    existing: [],
    skipped: [],
    warnings: [],
    dependencies: []
  };

  const folders = Array.from(new Set(nextSettings.layoutFolders.map(normalizeVaultPath).filter(Boolean)));
  for (const folder of folders) {
    await ensureFolder(app, folder, result, dryRun);
  }

  for (const artifact of managedArtifacts(nextSettings)) {
    await writeManagedFile(app, artifact.path, artifact.content, result, {
      dryRun,
      force,
      managedFiles: nextSettings.managedFiles
    });
  }

  result.dependencies = await resolveDependencies(app, {
    installDeps: options.installDeps ?? false,
    dryRun,
    warnings: result.warnings
  });

  if (!dryRun) {
    return {
      result,
      settings: {
        ...nextSettings,
        initializedAt: new Date().toISOString()
      }
    };
  }

  return { result, settings };
}

async function ensureFolder(app: App, folder: string, result: InitResult, dryRun: boolean): Promise<void> {
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

async function writeManagedFile(
  app: App,
  path: string,
  content: string,
  result: InitResult,
  options: {
    dryRun: boolean;
    force: boolean;
    managedFiles: Record<string, ManagedFileState>;
  }
): Promise<void> {
  const normalized = normalizeVaultPath(path);
  const contentHash = hashText(content);
  const existing = app.vault.getAbstractFileByPath(normalized);

  if (existing instanceof TFolder) {
    addUnique(result.skipped, normalized);
    addUnique(result.warnings, `Cannot create file because a folder already exists at ${normalized}`);
    return;
  }

  if (!existing) {
    await ensureFolder(app, parentFolder(normalized), result, options.dryRun);
    addUnique(result.created, normalized);
    if (!options.dryRun) {
      await app.vault.create(normalized, content);
      options.managedFiles[normalized] = managedFileState(contentHash);
    }
    return;
  }

  if (!(existing instanceof TFile)) {
    addUnique(result.skipped, normalized);
    addUnique(result.warnings, `Unsupported vault item at ${normalized}`);
    return;
  }

  const current = await app.vault.read(existing);
  const currentHash = hashText(current);
  const known = options.managedFiles[normalized];

  if (current === content) {
    addUnique(result.existing, normalized);
    if (!options.dryRun) {
      options.managedFiles[normalized] = managedFileState(contentHash);
    }
    return;
  }

  if (!known && !options.force) {
    addUnique(result.skipped, normalized);
    addUnique(result.warnings, `Skipped user-managed file at ${normalized}`);
    return;
  }

  if (known && known.hash !== currentHash && !options.force) {
    addUnique(result.skipped, normalized);
    addUnique(result.warnings, `Skipped user-modified PARA-ZK file at ${normalized}; pass force=true to overwrite`);
    return;
  }

  if (!options.force) {
    addUnique(result.skipped, normalized);
    addUnique(result.warnings, `Skipped changed PARA-ZK managed file at ${normalized}; pass force=true to overwrite`);
    return;
  }

  addUnique(result.updated, normalized);
  if (!options.dryRun) {
    await app.vault.modify(existing, content);
    options.managedFiles[normalized] = managedFileState(contentHash);
  }
}

function parentFolder(path: string): string {
  const normalized = normalizeVaultPath(path);
  const index = normalized.lastIndexOf("/");
  return index === -1 ? "" : normalized.slice(0, index);
}

function addUnique(items: string[], value: string): void {
  if (!value) return;
  if (!items.includes(value)) items.push(value);
}

function managedFileState(hash: string): ManagedFileState {
  return {
    hash,
    updatedAt: new Date().toISOString()
  };
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
