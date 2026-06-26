import { TFile } from "obsidian";
import type { ParaZkPluginContext } from "../plugin-interface";
import {
  inferPropsViewType,
  propsSchemaForType,
  type PropsField,
  type PropsViewType
} from "../props/schema";
import { managedUiBlocksForType, type ManagedUiRenderBlock } from "../templates";
import { parseFrontmatterFromContent } from "../vault/frontmatter";
import {
  normalizeFrontmatterType,
  readFrontmatterTypeFromContent,
  yamlFrontmatterRange
} from "../vault/sections";
import { renderPropsPanel } from "./props-controls";
import type { Locale } from "../types";

export type NoteChromeKind = "props" | "managed";

export type NoteChromeSpec = {
  sourcePath: string | undefined;
  type: string | undefined;
  frontmatter: Record<string, unknown>;
  locale: string;
  propsSignature: string | undefined;
  managedLayoutSignature: string | undefined;
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

function buildNoteChromeSpec(
  plugin: ParaZkPluginContext,
  sourcePath: string | undefined,
  rawType: string | undefined,
  frontmatter: Record<string, unknown>
): NoteChromeSpec {
  const type = normalizeFrontmatterType(rawType);
  const locale = plugin.settings.locale;
  const propsType = inferPropsViewType({ type });
  const managedBlocks = type ? managedUiBlocksForType(type, plugin.settings) : undefined;
  return {
    sourcePath,
    type,
    frontmatter,
    locale,
    propsSignature: propsType
      ? JSON.stringify({
        sourcePath,
        type: propsType,
        locale,
        frontmatter: propsFrontmatterSnapshot(propsType, locale, frontmatter)
      })
      : undefined,
    managedLayoutSignature: type && managedBlocks
      ? JSON.stringify({
        sourcePath,
        type,
        locale,
        blocks: managedLayoutSnapshot(managedBlocks)
      })
      : undefined,
    hasProps: propsType !== undefined,
    hasManaged: managedBlocks !== undefined
  };
}

function propsFrontmatterSnapshot(
  type: PropsViewType,
  locale: Locale,
  frontmatter: Record<string, unknown>
): Record<string, unknown> {
  const schema = propsSchemaForType(type, locale);
  const keys = new Set<string>(["type"]);
  for (const field of propsFields(schema)) {
    collectPropsFieldKeys(field, keys);
  }
  return pickFrontmatter(frontmatter, keys);
}

function propsFields(schema: ReturnType<typeof propsSchemaForType>): PropsField[] {
  return [
    ...(schema.lead ? [schema.lead] : []),
    ...schema.rows.flat()
  ];
}

function collectPropsFieldKeys(field: PropsField, keys: Set<string>): void {
  if (field.key) keys.add(field.key);
  if (field.display === "period") {
    keys.add("week_start");
    keys.add("week_end");
  }
}

function pickFrontmatter(frontmatter: Record<string, unknown>, keys: Set<string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Array.from(keys).sort()) {
    if (Object.prototype.hasOwnProperty.call(frontmatter, key)) result[key] = frontmatter[key];
  }
  return result;
}

function managedLayoutSnapshot(blocks: readonly ManagedUiRenderBlock[]): unknown[] {
  return blocks.map((block) => {
    if (block.kind === "action") {
      return {
        kind: "action",
        actions: block.actions.map((action) => ({
          command: action.command,
          label: action.label,
          icon: action.icon
        }))
      };
    }
    if (block.kind === "view") return { kind: block.kind, key: block.key, title: block.title };
    return { kind: block.kind, title: block.title };
  });
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
