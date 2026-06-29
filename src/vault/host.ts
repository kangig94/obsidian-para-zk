import type { App, CachedMetadata, TAbstractFile, TFile } from "obsidian";
import type { ParaZkPluginContext } from "../plugin-interface";
import type { WorkflowContext } from "../workflows/context";
import { joinVaultPath, obsidianConfigPath } from "./paths";

const CACHE_TEMP_TTL_MS = 6 * 60 * 60 * 1000;

type CacheAdapter = {
  read?: (path: string) => Promise<string>;
  write?: (path: string, data: string) => Promise<void>;
  rename?: (path: string, newPath: string) => Promise<void>;
  remove?: (path: string) => Promise<void>;
  exists?: (path: string) => Promise<boolean>;
  list?: (path: string) => Promise<{ files: string[]; folders: string[] }>;
};

export interface WorkflowHost {
  getFile(path: string): TFile | null;
  getAbstractFile(path: string): TAbstractFile | null;
  getMarkdownFiles(): TFile[];
  read(file: TFile): Promise<string>;
  cachedRead(file: TFile): Promise<string>;
  create(path: string, data: string): Promise<TFile>;
  createFolder(path: string): Promise<void>;
  modify(file: TFile, data: string): Promise<void>;
  trashFile(file: TAbstractFile): Promise<void>;
  processFrontMatter(file: TFile, fn: (frontmatter: Record<string, unknown>) => void): Promise<void>;
  renameFile(file: TAbstractFile, newPath: string): Promise<void>;
  getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null;
  getFileCache(file: TFile): CachedMetadata | null;
  resolvedLinks(): Record<string, Record<string, number>>;
  unresolvedLinks(): Record<string, Record<string, number>>;
  openFile(file: TFile): Promise<void>;
  getActiveFile(): TFile | null;
}

export async function trashAbstractFile(host: WorkflowHost, file: TAbstractFile): Promise<string> {
  await host.trashFile(file);
  return "fileManager.trashFile";
}

function createObsidianHost(app: App): WorkflowHost {
  return {
    getFile: (path) => app.vault.getFileByPath(path),
    getAbstractFile: (path) => app.vault.getAbstractFileByPath(path),
    getMarkdownFiles: () => app.vault.getMarkdownFiles(),
    read: (file) => app.vault.read(file),
    cachedRead: (file) => app.vault.cachedRead(file),
    create: (path, data) => app.vault.create(path, data),
    createFolder: async (path) => { await app.vault.createFolder(path); },
    modify: (file, data) => app.vault.modify(file, data),
    trashFile: (file) => app.fileManager.trashFile(file),
    processFrontMatter: (file, fn) => app.fileManager.processFrontMatter(file, fn),
    renameFile: (file, newPath) => app.fileManager.renameFile(file, newPath),
    getFirstLinkpathDest: (linkpath, sourcePath) => app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath),
    getFileCache: (file) => app.metadataCache.getFileCache(file),
    resolvedLinks: () => app.metadataCache.resolvedLinks,
    unresolvedLinks: () => app.metadataCache.unresolvedLinks,
    openFile: async (file) => { await app.workspace.getLeaf(true).openFile(file); },
    getActiveFile: () => app.workspace.getActiveFile()
  };
}

export function workflowContext(plugin: ParaZkPluginContext): WorkflowContext {
  return {
    host: createObsidianHost(plugin.app),
    settings: plugin.settings,
    cache: createPluginCache(plugin)
  };
}

function createPluginCache(plugin: ParaZkPluginContext): WorkflowContext["cache"] {
  const manifest = (plugin as { manifest?: { id?: string; dir?: string } }).manifest;
  const adapter = plugin.app.vault.adapter as CacheAdapter;
  if (!manifest?.id || typeof adapter.read !== "function" || typeof adapter.write !== "function") return undefined;

  const pluginDir = manifest.dir ?? obsidianConfigPath(plugin.app.vault, "plugins", manifest.id);
  const canReplace = typeof adapter.rename === "function";

  return {
    readText: async (name) => {
      try {
        return await adapter.read!(joinVaultPath(pluginDir, name));
      } catch {
        return undefined;
      }
    },
    writeText: async (name, value) => {
      try {
        await adapter.write!(joinVaultPath(pluginDir, name), value);
      } catch {
        // Cache writes should never make a workflow fail.
      }
    },
    ...(canReplace ? {
      replaceText: async (name: string, value: string) => {
        const finalPath = joinVaultPath(pluginDir, name);
        try {
          await replaceAdapterText(adapter, pluginDir, name, finalPath, value);
        } catch {
          try {
            await adapter.write!(finalPath, value);
          } catch {
            // Cache writes should never make a workflow fail.
          }
        }
      }
    } : {})
  };
}

async function replaceAdapterText(
  adapter: CacheAdapter,
  pluginDir: string,
  name: string,
  finalPath: string,
  value: string
): Promise<void> {
  const now = Date.now();
  const tempPath = cacheTempPath(finalPath, now);
  await removeStaleCacheTemps(adapter, pluginDir, name, now);
  try {
    await adapter.write!(tempPath, value);
    await adapter.rename!(tempPath, finalPath);
  } catch (error) {
    await removeAdapterPath(adapter, tempPath);
    throw error;
  }
}

async function removeStaleCacheTemps(
  adapter: CacheAdapter,
  pluginDir: string,
  name: string,
  now: number
): Promise<void> {
  if (typeof adapter.list !== "function") return;
  try {
    const listed = await adapter.list(pluginDir);
    for (const path of listed.files) {
      if (!isStaleCacheTemp(path, name, now)) continue;
      await removeAdapterPath(adapter, path);
    }
  } catch {
    // Cache temp cleanup should never block the replacement write.
  }
}

async function removeAdapterPath(adapter: CacheAdapter, path: string): Promise<void> {
  if (typeof adapter.remove !== "function") return;
  try {
    if (typeof adapter.exists === "function" && !await adapter.exists(path)) return;
    await adapter.remove(path);
  } catch {
    // Cache temp cleanup should never make a workflow fail.
  }
}

function cacheTempPath(path: string, now: number): string {
  const nonce = Math.random().toString(36).slice(2);
  return `${path}.${now.toString(36)}-${nonce}.tmp`;
}

function isStaleCacheTemp(path: string, name: string, now: number): boolean {
  const fileName = path.slice(path.lastIndexOf("/") + 1);
  const prefix = `${name}.`;
  if (!fileName.startsWith(prefix) || !fileName.endsWith(".tmp")) return false;
  const marker = fileName.slice(prefix.length, -".tmp".length);
  const timestamp = Number.parseInt(marker.split("-")[0], 36);
  return Number.isFinite(timestamp) && now - timestamp > CACHE_TEMP_TTL_MS;
}
