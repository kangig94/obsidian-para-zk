import { RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type EditorView,
  type ViewUpdate
} from "@codemirror/view";
import { Notice, editorInfoField, type MarkdownPostProcessorContext } from "obsidian";
import { localePack } from "../i18n";
import type { ParaZkPluginContext } from "../plugin-interface";
import {
  normalizeWorkflowCommand,
  runGuiWorkflow,
  workflowButtonLabel
} from "./workflow-commands";

type InlineActionToken = {
  command: string;
  label?: string;
};

export function registerInlineActionRenderers(plugin: ParaZkPluginContext): void {
  plugin.registerMarkdownCodeBlockProcessor("para-zk-button", (source, el, ctx) => {
    renderParaZkButton(plugin, source, el, ctx);
  });

  plugin.registerMarkdownPostProcessor((el, ctx) => {
    renderInlineParaZkActions(plugin, el, ctx);
  });

  plugin.registerEditorExtension(createInlineActionEditorExtension(plugin));
}

function renderParaZkButton(
  plugin: ParaZkPluginContext,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
): void {
  const args = parseCodeBlockKeyValues(source);
  const command = normalizeWorkflowCommand(args.command);
  const label = args.label ?? workflowButtonLabel(plugin, command) ?? command ?? "PARA-ZK";
  el.addClass("para-zk-button-container");
  const button = createWorkflowButton(plugin, label, command, ctx.sourcePath);
  button.addClass("para-zk-block-button");
  el.appendChild(button);
}

function renderInlineParaZkActions(plugin: ParaZkPluginContext, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
  const codeEls = Array.from(el.querySelectorAll("code"));
  for (const codeEl of codeEls) {
    if (codeEl.closest("pre")) continue;
    const token = parseInlineActionToken(codeEl.textContent ?? "");
    if (!token) continue;

    const command = normalizeWorkflowCommand(token.command);
    const label = token.label || workflowButtonLabel(plugin, command) || command || "PARA-ZK";
    const button = createWorkflowButton(plugin, label, command, ctx.sourcePath);
    button.addClass("para-zk-inline-button");
    codeEl.replaceWith(button);

    const heading = button.closest("h1,h2,h3,h4,h5,h6");
    if (heading instanceof HTMLElement) {
      heading.addClass("para-zk-action-heading");
    }
  }
}

export function createWorkflowButton(
  plugin: ParaZkPluginContext,
  label: string,
  command: string | undefined,
  sourcePath?: string
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.addClass("para-zk-command-button", "mod-cta");
  button.textContent = label;

  button.addEventListener("click", async () => {
    if (!command) {
      new Notice(localePack(plugin.settings.locale).messages.buttonMissingCommand);
      return;
    }

    button.disabled = true;
    try {
      await runGuiWorkflow(plugin, command, sourcePath);
    } finally {
      button.disabled = false;
    }
  });

  return button;
}

function createInlineActionEditorExtension(plugin: ParaZkPluginContext): Extension {
  class InlineActionWidget extends WidgetType {
    constructor(private readonly token: InlineActionToken) {
      super();
    }

    eq(widget: WidgetType): boolean {
      return widget instanceof InlineActionWidget
        && widget.token.command === this.token.command
        && widget.token.label === this.token.label;
    }

    toDOM(_view: EditorView): HTMLElement {
      const command = normalizeWorkflowCommand(this.token.command);
      const label = this.token.label || workflowButtonLabel(plugin, command) || command || "PARA-ZK";
      const sourcePath = _view.state.field(editorInfoField, false)?.file?.path;
      const button = createWorkflowButton(plugin, label, command, sourcePath);
      button.addClass("para-zk-inline-button", "para-zk-editor-inline-button");
      return button;
    }

    ignoreEvent(_event: Event): boolean {
      return true;
    }
  }

  const buildDecorations = (view: EditorView): DecorationSet => {
    const builder = new RangeSetBuilder<Decoration>();
    const tokenRe = /`(PZK\[[^\]\n]+\])`/g;

    for (const range of view.visibleRanges) {
      const text = view.state.doc.sliceString(range.from, range.to);
      tokenRe.lastIndex = 0;

      for (let match = tokenRe.exec(text); match; match = tokenRe.exec(text)) {
        const token = parseInlineActionToken(match[1]);
        if (!token) continue;

        builder.add(
          range.from + match.index,
          range.from + match.index + match[0].length,
          Decoration.replace({
            widget: new InlineActionWidget(token)
          })
        );
      }
    }

    return builder.finish();
  };

  class InlineActionEditorPlugin {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  }

  return ViewPlugin.fromClass(InlineActionEditorPlugin, {
    decorations: (value) => value.decorations
  });
}

function parseCodeBlockKeyValues(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/);
    if (match) result[match[1]] = match[2];
  }
  return result;
}

function parseInlineActionToken(value: string): InlineActionToken | undefined {
  const match = value.trim().match(/^PZK\[([^\]|]+)(?:\|([^\]]+))?\]$/);
  if (!match) return undefined;
  return {
    command: match[1].trim(),
    label: match[2]?.trim()
  };
}
