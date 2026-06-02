import {
  MarkdownRenderChild,
  MarkdownRenderer,
  type MarkdownPostProcessorContext
} from "obsidian";
import type { ParaZkPluginContext } from "../plugin-interface";
import { dataviewViewBlock } from "../templates";

// Renders a compact `para-zk-view` block by expanding its view key into the
// managed Dataview query and delegating to Dataview's own renderer through
// MarkdownRenderer. The note source stays terse (just the key), while the
// rendered output is identical to an inline ```dataview block. ctx.sourcePath
// is passed so the query's `this.file` resolves to the host note.
export function registerDataviewViewRenderers(plugin: ParaZkPluginContext): void {
  plugin.registerMarkdownCodeBlockProcessor("para-zk-view", (source, el, ctx) => renderDataviewView(plugin, source, el, ctx));
}

function renderDataviewView(
  plugin: ParaZkPluginContext,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
): Promise<void> {
  const key = source.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
  const block = dataviewViewBlock(key, plugin.settings);

  el.empty();
  if (!block) {
    el.createDiv({ cls: "para-zk-props-muted", text: `Unknown PARA-ZK view: ${key || "(empty)"}` });
    return Promise.resolve();
  }

  const child = new MarkdownRenderChild(el);
  ctx.addChild(child);
  return MarkdownRenderer.render(plugin.app, block, el, ctx.sourcePath, child);
}
