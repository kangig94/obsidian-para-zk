import {
  MarkdownRenderChild,
  MarkdownRenderer,
  TFile,
  type MarkdownPostProcessorContext
} from "obsidian";
import type { ParaZkPluginContext } from "../plugin-interface";
import { managedUiBlockForType } from "../templates";

export function registerManagedSectionRenderers(plugin: ParaZkPluginContext): void {
  plugin.registerMarkdownCodeBlockProcessor("para-zk-managed", (source, el, ctx) => {
    ctx.addChild(new ManagedSectionsRenderChild(plugin, el, source, ctx.sourcePath));
  });
}

class ManagedSectionsRenderChild extends MarkdownRenderChild {
  private unloaded = true;

  constructor(
    private readonly plugin: ParaZkPluginContext,
    containerEl: HTMLElement,
    private readonly source: string,
    private readonly sourcePath: MarkdownPostProcessorContext["sourcePath"]
  ) {
    super(containerEl);
  }

  onload(): void {
    this.unloaded = false;
    void renderManagedSections(this.plugin, this.source, this.containerEl, this.sourcePath, this)
      .catch((error: unknown) => {
        if (!this.unloaded) renderManagedSectionsError(this.containerEl, error);
      });
  }

  onunload(): void {
    this.unloaded = true;
  }
}

async function renderManagedSections(
  plugin: ParaZkPluginContext,
  source: string,
  el: HTMLElement,
  sourcePath: MarkdownPostProcessorContext["sourcePath"],
  child: MarkdownRenderChild
): Promise<void> {
  const type = await resolveManagedType(plugin, source, sourcePath);
  const block = type ? managedUiBlockForType(type, plugin.settings) : undefined;

  el.empty();
  el.addClass("para-zk-managed");
  if (type) el.addClass(`para-zk-managed-${className(type)}`);

  if (!block) {
    el.createDiv({ cls: "para-zk-props-muted", text: `No PARA-ZK managed UI for type: ${type || "(unknown)"}` });
    return;
  }

  await MarkdownRenderer.render(plugin.app, block, el, sourcePath, child);
}

async function resolveManagedType(
  plugin: ParaZkPluginContext,
  source: string,
  sourcePath: MarkdownPostProcessorContext["sourcePath"]
): Promise<string | undefined> {
  const inlineType = readManagedType(source);
  if (inlineType) return inlineType;

  if (!sourcePath) return undefined;
  const file = plugin.app.vault.getFileByPath(sourcePath);
  if (!(file instanceof TFile)) return undefined;

  const cachedType = readFrontmatterType(plugin.app.metadataCache.getFileCache(file)?.frontmatter?.type);
  if (cachedType) return cachedType;

  try {
    return readFrontmatterTypeFromText(await plugin.app.vault.cachedRead(file));
  } catch {
    return undefined;
  }
}

function readManagedType(source: string): string | undefined {
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const typed = trimmed.match(/^type\s*:\s*(.+)$/i)?.[1];
    const type = readFrontmatterType(typed ?? trimmed);
    if (type) return type;
  }
  return undefined;
}

function readFrontmatterType(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const type = value.trim().replace(/^["']|["']$/g, "");
  return /^[A-Za-z0-9_-]+$/.test(type) ? type : undefined;
}

function readFrontmatterTypeFromText(content: string): string | undefined {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return undefined;
  for (const line of match[1].split(/\r?\n/)) {
    const typed = line.trim().match(/^type\s*:\s*(.+)$/i)?.[1];
    const type = readFrontmatterType(typed);
    if (type) return type;
  }
  return undefined;
}

function renderManagedSectionsError(el: HTMLElement, error: unknown): void {
  el.empty();
  el.addClass("para-zk-managed");
  el.createDiv({
    cls: "para-zk-props-muted",
    text: error instanceof Error ? error.message : String(error)
  });
}

function className(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}
