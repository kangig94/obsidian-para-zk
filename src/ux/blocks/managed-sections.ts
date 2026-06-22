import {
  MarkdownRenderChild,
  MarkdownRenderer,
  TFile
} from "obsidian";
import type { ParaZkPluginContext } from "../../plugin-interface";
import { managedUiBlockForType } from "../../templates";
import { normalizeFrontmatterType, readFrontmatterTypeFromContent } from "../../vault/sections";
import { applyBlockKind, renderBlockNotice } from "./shell";

export async function renderManagedPanel(
  plugin: ParaZkPluginContext,
  el: HTMLElement,
  sourcePath: string | undefined,
  child: MarkdownRenderChild
): Promise<void> {
  const type = await resolveManagedType(plugin, sourcePath);
  const block = type ? managedUiBlockForType(type, plugin.settings) : undefined;

  el.empty();

  if (!type) {
    renderBlockNotice(el, "managed", `No PARA-ZK managed UI for type: ${type || "(unknown)"}`);
    return;
  }

  applyBlockKind(el, `managed-${type}`);
  if (!block) return;

  await MarkdownRenderer.render(plugin.app, block, el, sourcePath ?? "", child);
}

async function resolveManagedType(
  plugin: ParaZkPluginContext,
  sourcePath: string | undefined
): Promise<string | undefined> {
  if (!sourcePath) return undefined;
  const file = plugin.app.vault.getFileByPath(sourcePath);
  if (!(file instanceof TFile)) return undefined;

  try {
    const freshType = readFrontmatterTypeFromContent(await plugin.app.vault.read(file));
    if (freshType) return freshType;
  } catch {
    // Fall through to the cache only if the fresh file read cannot provide a type.
  }

  return normalizeFrontmatterType(plugin.app.metadataCache.getFileCache(file)?.frontmatter?.type);
}
