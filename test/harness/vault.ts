// In-memory Obsidian App used by workflow unit tests. It backs the subset of
// the vault / fileManager / metadataCache / workspace API that src/workflows.ts
// touches, parsing and re-serializing YAML frontmatter on every read so reads
// always reflect the latest write. Behaviors that depend on Obsidian's real
// engine (link rewriting on rename, backlink resolution, metadataCache write
// lag) are intentionally NOT reproduced — those stay in the live smoke test.
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { ParaZkPluginContext } from "../../src/plugin-interface";
import { DEFAULT_SETTINGS, type ParaZkSettings } from "../../src/types";
import { workflowContext } from "../../src/vault/host";
import type { WorkflowContext } from "../../src/workflows";
import { TAbstractFile, TFile, TFolder } from "../mocks/obsidian";

function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function baseName(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? path : path.slice(index + 1);
}

function splitFrontmatter(content: string): { yaml: string | null; body: string } {
  const match = content.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---[^\S\r\n]*(?:\r?\n|$)/);
  if (!match) return { yaml: null, body: content };
  return { yaml: match[1], body: content.slice(match[0].length) };
}

function parsedFrontmatter(content: string): Record<string, unknown> | undefined {
  const { yaml } = splitFrontmatter(content);
  if (yaml === null) return undefined;
  try {
    const parsed = parseYaml(yaml);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

export class MockApp {
  private contents = new Map<string, string>();
  private binaryContents = new Map<string, Uint8Array>();
  private fileObjs = new Map<string, TFile>();
  private folderObjs = new Map<string, TFolder>();
  private root = new TFolder();

  readonly trashed: Array<{ path: string; system: boolean }> = [];
  readonly deleted: string[] = [];
  readonly opened: string[] = [];

  vault = {
    getAbstractFileByPath: (path: string): TAbstractFile | null =>
      this.fileObjs.get(path) ?? this.folderObjs.get(path) ?? null,
    getFileByPath: (path: string): TFile | null => this.fileObjs.get(path) ?? null,
    getMarkdownFiles: (): TFile[] =>
      [...this.fileObjs.values()].filter((file) => file.extension === "md"),
    getAllLoadedFiles: (): TAbstractFile[] => [
      ...this.folderObjs.values(),
      ...this.fileObjs.values()
    ],
    read: async (file: TFile): Promise<string> => this.contents.get(file.path) ?? "",
    cachedRead: async (file: TFile): Promise<string> => this.contents.get(file.path) ?? "",
    create: async (path: string, content: string): Promise<TFile> => this.createFile(path, content),
    createBinary: async (path: string, content: ArrayBuffer): Promise<TFile> =>
      this.createBinaryFile(path, new Uint8Array(content)),
    createFolder: async (path: string): Promise<void> => {
      this.ensureFolderPath(path);
    },
    modify: async (file: TFile, content: string): Promise<void> => {
      this.contents.set(file.path, content);
      file.stat.size = content.length;
      this.rewire();
    },
    trash: async (file: TAbstractFile, system: boolean): Promise<void> => {
      this.removePath(file.path, system);
    },
    delete: async (file: TAbstractFile): Promise<void> => {
      this.deletePath(file.path);
    },
    adapter: {
      exists: async (path: string): Promise<boolean> =>
        this.fileObjs.has(path) || this.folderObjs.has(path)
    }
  };

  fileManager = {
    processFrontMatter: async (
      file: TFile,
      fn: (frontmatter: Record<string, unknown>) => void
    ): Promise<void> => {
      const content = this.contents.get(file.path) ?? "";
      const { body } = splitFrontmatter(content);
      const frontmatter = parsedFrontmatter(content) ?? {};
      fn(frontmatter);
      const keys = Object.keys(frontmatter);
      this.contents.set(
        file.path,
        keys.length > 0 ? `---\n${stringifyYaml(frontmatter)}---\n${body}` : body
      );
      const nextContent = this.contents.get(file.path) ?? "";
      file.stat.size = nextContent.length;
      this.rewire();
    },
    renameFile: async (file: TAbstractFile, newPath: string): Promise<void> => {
      this.relocate(file.path, newPath);
    }
  };

  metadataCache = {
    getFileCache: (file: TFile): { frontmatter?: Record<string, unknown> } | null => {
      const content = this.contents.get(file.path);
      if (content === undefined) return null;
      return { frontmatter: parsedFrontmatter(content) };
    },
    getFirstLinkpathDest: (linkpath: string, _sourcePath: string): TFile | null =>
      this.resolveLinkpathDest(linkpath),
    resolvedLinks: {} as Record<string, Record<string, number>>,
    unresolvedLinks: {} as Record<string, Record<string, number>>
  };

  workspace = {
    getLeaf: (_newLeaf?: boolean | string) => ({
      openFile: async (file: TFile): Promise<void> => {
        this.opened.push(file.path);
      }
    }),
    getActiveFile: (): TFile | null => null
  };

  constructor() {
    this.root.path = "";
    this.root.name = "";
  }

  /** Test-only: read a file's current content by path. */
  readPath(path: string): string | undefined {
    return this.contents.get(path);
  }

  /** Test-only: list every file path that currently exists. */
  listPaths(): string[] {
    return [...this.fileObjs.keys()];
  }

  /** Test-only: read a binary file's current content by path. */
  readBinaryPath(path: string): Uint8Array | undefined {
    return this.binaryContents.get(path);
  }

  private createFile(path: string, content: string): TFile {
    if (this.fileObjs.has(path) || this.folderObjs.has(path)) {
      throw new Error(`file already exists: ${path}`);
    }
    this.ensureFolderPath(parentPath(path));
    const file = new TFile();
    this.assignFileFields(file, path);
    file.stat.size = content.length;
    this.fileObjs.set(path, file);
    this.contents.set(path, content);
    this.rewire();
    return file;
  }

  private createBinaryFile(path: string, content: Uint8Array): TFile {
    if (this.fileObjs.has(path) || this.folderObjs.has(path)) {
      throw new Error(`file already exists: ${path}`);
    }
    this.ensureFolderPath(parentPath(path));
    const file = new TFile();
    this.assignFileFields(file, path);
    file.stat.size = content.byteLength;
    this.fileObjs.set(path, file);
    this.binaryContents.set(path, content);
    this.rewire();
    return file;
  }

  private ensureFolderPath(path: string): void {
    if (!path) return;
    const parts = path.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (this.folderObjs.has(current)) continue;
      const folder = new TFolder();
      folder.path = current;
      folder.name = baseName(current);
      this.folderObjs.set(current, folder);
    }
    this.rewire();
  }

  private removePath(path: string, system: boolean): void {
    const targets = [...this.fileObjs.keys(), ...this.folderObjs.keys()].filter(
      (candidate) => candidate === path || candidate.startsWith(`${path}/`)
    );
    for (const target of targets) {
      this.trashed.push({ path: target, system });
      this.contents.delete(target);
      this.binaryContents.delete(target);
      this.fileObjs.delete(target);
      this.folderObjs.delete(target);
    }
    this.rewire();
  }

  private deletePath(path: string): void {
    const targets = [...this.fileObjs.keys(), ...this.folderObjs.keys()].filter(
      (candidate) => candidate === path || candidate.startsWith(`${path}/`)
    );
    for (const target of targets) {
      this.deleted.push(target);
      this.contents.delete(target);
      this.binaryContents.delete(target);
      this.fileObjs.delete(target);
      this.folderObjs.delete(target);
    }
    this.rewire();
  }

  private relocate(oldPath: string, newPath: string): void {
    this.ensureFolderPath(parentPath(newPath));
    const affected = [...this.fileObjs.keys(), ...this.folderObjs.keys()].filter(
      (candidate) => candidate === oldPath || candidate.startsWith(`${oldPath}/`)
    );
    for (const from of affected) {
      const to = newPath + from.slice(oldPath.length);
      const fileObj = this.fileObjs.get(from);
      if (fileObj) {
        this.fileObjs.delete(from);
        this.assignFileFields(fileObj, to);
        this.fileObjs.set(to, fileObj);
        const content = this.contents.get(from);
        this.contents.delete(from);
        if (content !== undefined) this.contents.set(to, content);
        const binaryContent = this.binaryContents.get(from);
        this.binaryContents.delete(from);
        if (binaryContent !== undefined) this.binaryContents.set(to, binaryContent);
      }
      const folderObj = this.folderObjs.get(from);
      if (folderObj) {
        this.folderObjs.delete(from);
        folderObj.path = to;
        folderObj.name = baseName(to);
        this.folderObjs.set(to, folderObj);
      }
    }
    this.rewire();
  }

  private assignFileFields(file: TFile, path: string): void {
    file.path = path;
    file.name = baseName(path);
    const dot = file.name.lastIndexOf(".");
    file.basename = dot === -1 ? file.name : file.name.slice(0, dot);
    file.extension = dot === -1 ? "" : file.name.slice(dot + 1);
  }

  private resolveLinkpathDest(linkpath: string): TFile | null {
    const base = linkpath.split("#")[0];
    const direct = this.fileObjs.get(base) ?? this.fileObjs.get(`${base}.md`);
    if (direct) return direct;

    const target = baseName(base).replace(/\.md$/i, "");
    return [...this.fileObjs.values()].find((file) => file.basename === target) ?? null;
  }

  private rewire(): void {
    for (const folder of this.folderObjs.values()) folder.children = [];
    this.root.children = [];
    for (const node of [...this.folderObjs.values(), ...this.fileObjs.values()]) {
      if (node === this.root) continue;
      const parent = this.folderObjs.get(parentPath(node.path)) ?? this.root;
      node.parent = parent;
      parent.children.push(node);
    }
    this.rewireLinks();
  }

  private rewireLinks(): void {
    const resolved: Record<string, Record<string, number>> = {};
    const unresolved: Record<string, Record<string, number>> = {};

    for (const file of this.fileObjs.values()) {
      if (file.extension !== "md") continue;
      const content = this.contents.get(file.path) ?? "";
      for (const target of wikiLinkTargets(splitFrontmatter(content).body)) {
        const base = target.split("#")[0].trim();
        const resolvedFile = base ? this.resolveLinkpathDest(target) : file;
        if (resolvedFile) {
          incrementLinkCount(resolved, file.path, resolvedFile.path);
        } else {
          incrementLinkCount(unresolved, file.path, target);
        }
      }
    }

    this.metadataCache.resolvedLinks = resolved;
    this.metadataCache.unresolvedLinks = unresolved;
  }
}

function wikiLinkTargets(content: string): string[] {
  const targets: string[] = [];
  const pattern = /!?\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const target = match[1]?.trim();
    if (target) targets.push(target);
  }
  return targets;
}

function incrementLinkCount(
  links: Record<string, Record<string, number>>,
  sourcePath: string,
  target: string
): void {
  links[sourcePath] ??= {};
  links[sourcePath][target] = (links[sourcePath][target] ?? 0) + 1;
}

export function createTestContext(
  overrides: Partial<ParaZkSettings> = {}
): { ctx: WorkflowContext; app: MockApp } {
  const app = new MockApp();
  const settings: ParaZkSettings = {
    ...structuredClone(DEFAULT_SETTINGS),
    ...overrides
  };
  return { ctx: workflowContext({ app, settings } as unknown as ParaZkPluginContext), app };
}
