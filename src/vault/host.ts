import type { App, CachedMetadata, TAbstractFile, TFile } from "obsidian";
import type { ParaZkPluginContext } from "../plugin-interface";
import type { WorkflowContext } from "../workflows/context";

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
  return { host: createObsidianHost(plugin.app), settings: plugin.settings };
}
