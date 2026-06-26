import {
  TFile,
  type MarkdownRenderChild
} from "obsidian";
import type { ParaZkPluginContext } from "../plugin-interface";
import { inferPropsViewType } from "../props/schema";
import { managedUiBlocksForType } from "../templates";
import { parseFrontmatterFromContent } from "../vault/frontmatter";
import {
  normalizeFrontmatterType,
  readFrontmatterTypeFromContent,
  yamlFrontmatterRange
} from "../vault/sections";
import { renderManagedPanel } from "./blocks/managed-sections";
import { renderPropsPanel } from "./props-controls";

export type NoteChromeKind = "props" | "managed";

export type NoteChromeSpec = {
  sourcePath: string | undefined;
  type: string | undefined;
  frontmatter: Record<string, unknown>;
  locale: string;
  signature: string;
  hasProps: boolean;
  hasManaged: boolean;
};

export function buildCachedNoteChromeSpec(
  plugin: ParaZkPluginContext,
  sourcePath: string | undefined,
  typeHint?: string
): NoteChromeSpec {
  const frontmatter = cachedFrontmatter(plugin, sourcePath);
  return buildNoteChromeSpec(
    plugin,
    sourcePath,
    typeHint ?? normalizeFrontmatterType(frontmatter.type),
    frontmatter
  );
}

export function buildEditorNoteChromeSpec(
  plugin: ParaZkPluginContext,
  file: TFile,
  content: string
): NoteChromeSpec {
  const cached = cachedFrontmatterForFile(plugin, file);
  const hasLiveFrontmatter = yamlFrontmatterRange(content) !== undefined;
  const frontmatter = hasLiveFrontmatter ? parseFrontmatterFromContent(content) : cached;
  const type = hasLiveFrontmatter
    ? normalizeFrontmatterType(frontmatter.type) ?? readFrontmatterTypeFromContent(content)
    : normalizeFrontmatterType(cached.type) ?? readFrontmatterTypeFromContent(content);
  return buildNoteChromeSpec(
    plugin,
    file.path,
    type,
    frontmatter
  );
}

export function hasNoteChrome(spec: NoteChromeSpec): boolean {
  return spec.hasProps || spec.hasManaged;
}

export function renderNoteChromeProps(
  plugin: ParaZkPluginContext,
  el: HTMLElement,
  spec: NoteChromeSpec
): void {
  renderPropsPanel(plugin, el, spec.sourcePath);
}

export async function renderNoteChromeManaged(
  plugin: ParaZkPluginContext,
  el: HTMLElement,
  spec: NoteChromeSpec,
  child: MarkdownRenderChild
): Promise<void> {
  await renderManagedPanel(plugin, el, spec.sourcePath, child);
}

function buildNoteChromeSpec(
  plugin: ParaZkPluginContext,
  sourcePath: string | undefined,
  rawType: string | undefined,
  frontmatter: Record<string, unknown>
): NoteChromeSpec {
  const type = normalizeFrontmatterType(rawType);
  const hasProps = type ? inferPropsViewType({ type }) !== undefined : false;
  const hasManaged = type ? managedUiBlocksForType(type, plugin.settings) !== undefined : false;
  const locale = plugin.settings.locale;
  return {
    sourcePath,
    type,
    frontmatter,
    locale,
    signature: JSON.stringify({ sourcePath, type, locale, frontmatter }),
    hasProps,
    hasManaged
  };
}

function cachedFrontmatter(
  plugin: ParaZkPluginContext,
  sourcePath: string | undefined
): Record<string, unknown> {
  if (!sourcePath) return {};
  const file = plugin.app.vault.getFileByPath(sourcePath);
  if (!(file instanceof TFile)) return {};
  return cachedFrontmatterForFile(plugin, file);
}

function cachedFrontmatterForFile(plugin: ParaZkPluginContext, file: TFile): Record<string, unknown> {
  return plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
}
