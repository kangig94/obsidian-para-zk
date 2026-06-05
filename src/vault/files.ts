import { TFolder, type TFile } from "obsidian";
import type { WorkflowHost } from "./host";
import { normalizeVaultPath } from "./paths";

type FolderHost = Pick<WorkflowHost, "createFolder" | "getAbstractFile">;

export async function ensureFolder(host: FolderHost, folder: string): Promise<void> {
  const normalized = normalizeVaultPath(folder);
  if (!normalized) return;

  const parts = normalized.split("/");
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const existing = host.getAbstractFile(current);
    if (existing instanceof TFolder) continue;
    if (existing) throw new Error(`cannot create folder; a file exists at ${current}`);
    await host.createFolder(current);
  }
}

export function isInFolder(file: TFile, folder: string): boolean {
  const normalized = normalizeVaultPath(folder);
  return file.path === normalized || file.path.startsWith(`${normalized}/`);
}

export function parentFolder(path: string): string {
  const normalized = normalizeVaultPath(path);
  const index = normalized.lastIndexOf("/");
  return index === -1 ? "" : normalized.slice(0, index);
}

export function uniqueFiles(files: TFile[]): TFile[] {
  const seen = new Set<string>();
  const result: TFile[] = [];
  for (const file of files) {
    if (seen.has(file.path)) continue;
    seen.add(file.path);
    result.push(file);
  }
  return result;
}
