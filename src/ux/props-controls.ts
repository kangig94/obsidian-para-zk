import {
  ButtonComponent,
  DropdownComponent,
  MarkdownView,
  Notice,
  SuggestModal,
  TFile,
  TextComponent,
  type App,
  type MarkdownPostProcessorContext,
  type WorkspaceLeaf
} from "obsidian";
import { localePack } from "../i18n";
import type { ParaZkPluginContext } from "../plugin-interface";
import {
  findPropsField,
  inferPropsViewType,
  parsePropsViewType,
  propsSchemaForType,
  type PropsField,
  type PropsSchema,
  type PropsSelectOption,
  type PropsViewType
} from "../props/schema";
import { frontmatterLinks } from "../vault/frontmatter";
import { createObsidianHost } from "../vault/host";
import { normalizeVaultPath, wikiLink } from "../vault/paths";
import { parseCodeBlockKeyValues } from "./code-block-args";

type Frontmatter = Record<string, unknown>;

type InlineInputToken = {
  type?: PropsViewType;
  fieldId: string;
};

type AreaSuggestion = {
  name: string;
  path: string;
  link: string;
};

export function registerPropsControlRenderers(plugin: ParaZkPluginContext): void {
  plugin.registerMarkdownCodeBlockProcessor("para-zk-props", (source, el, ctx) => {
    renderPropsCodeBlock(plugin, source, el, ctx);
  });

  plugin.registerMarkdownPostProcessor((el, ctx) => {
    renderInlinePropsInputs(plugin, el, ctx);
  });
}

function renderPropsCodeBlock(
  plugin: ParaZkPluginContext,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
): void {
  const args = parseCodeBlockKeyValues(source);
  const file = sourceFile(plugin, ctx.sourcePath);
  const frontmatter = file ? fileFrontmatter(plugin, file) : {};
  const type = parsePropsViewType(args.type) ?? inferPropsViewType(frontmatter);

  el.empty();
  el.removeClass("para-zk-props", "is-disabled");
  el.addClass("para-zk-props-block");
  if (!type) {
    renderMuted(el, "PARA-ZK props type is missing or unsupported.");
    return;
  }

  renderPropsToolbar(plugin, el, ctx.sourcePath);
  renderPropsGrid(plugin, propsSchemaForType(type, plugin.settings.locale), el.createDiv(), ctx.sourcePath);
}

function renderInlinePropsInputs(plugin: ParaZkPluginContext, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
  const codeEls = Array.from(el.querySelectorAll("code"));
  for (const codeEl of codeEls) {
    if (codeEl.closest("pre")) continue;
    const token = parseInlineInputToken(codeEl.textContent ?? "");
    if (!token) continue;

    const file = sourceFile(plugin, ctx.sourcePath);
    const frontmatter = file ? fileFrontmatter(plugin, file) : {};
    const type = token.type ?? inferPropsViewType(frontmatter);
    if (!type) continue;

    const schema = propsSchemaForType(type, plugin.settings.locale);
    const field = findPropsField(schema, token.fieldId);
    if (!field) continue;

    const container = document.createElement("span");
    container.addClass("para-zk-inline-input");
    renderFieldControl(plugin, field, frontmatter, container, ctx.sourcePath, () => {
      renderSingleField(plugin, schema, field, container, ctx.sourcePath);
    });
    codeEl.replaceWith(container);
  }
}

function renderPropsGrid(
  plugin: ParaZkPluginContext,
  schema: PropsSchema,
  container: HTMLElement,
  sourcePath?: string
): void {
  const file = sourceFile(plugin, sourcePath);
  const frontmatter = file ? fileFrontmatter(plugin, file) : {};

  container.empty();
  container.addClass("para-zk-props");
  container.removeClass("is-disabled");
  if (!file) container.addClass("is-disabled");

  for (const row of schema.rows) {
    const visibleFields = row.filter((field) => !isHiddenDisplayField(field, frontmatter));
    if (visibleFields.length === 0) continue;
    const rowEl = container.createDiv({ cls: "para-zk-props-row" });
    for (const field of visibleFields) {
      renderField(plugin, schema, field, frontmatter, rowEl, sourcePath);
    }
  }
}

function renderPropsToolbar(plugin: ParaZkPluginContext, container: HTMLElement, sourcePath?: string): void {
  const labels = localePack(plugin.settings.locale).labels;
  const toolbar = container.createDiv({ cls: "para-zk-props-toolbar" });
  const controls = toolbar.createDiv({ cls: "para-zk-props-toolbar-controls" });

  renderPropsModeButton(plugin, controls, {
    sourcePath,
    label: labelValue(labels.edit, "Edit"),
    icon: "pencil",
    className: "para-zk-props-edit",
    mode: "source"
  });
  renderPropsModeButton(plugin, controls, {
    sourcePath,
    label: labelValue(labels.view, "View"),
    icon: "eye",
    className: "para-zk-props-view",
    mode: "preview"
  });
}

function renderPropsModeButton(
  plugin: ParaZkPluginContext,
  container: HTMLElement,
  options: {
    sourcePath?: string;
    label: string;
    icon: string;
    className: string;
    mode: "source" | "preview";
  }
): void {
  const buttonComponent = new ButtonComponent(container);
  const button = buttonComponent.buttonEl;
  button.addClass("para-zk-props-toolbar-button", options.className);
  button.setAttr("aria-label", options.label);
  buttonComponent
    .setIcon(options.icon)
    .setButtonText(options.label)
    .setTooltip(options.label)
    .setDisabled(!options.sourcePath)
    .onClick(async () => {
      button.disabled = true;
      try {
        await focusMarkdownMode(plugin, options.sourcePath, options.mode);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        new Notice(`PARA-ZK: ${message}`);
      } finally {
        button.disabled = false;
      }
    });
}

// Read-only display fields with no value (e.g. an area note's empty `parent`)
// are skipped so they do not leave a half-empty row; editable controls always
// render so the user can fill them.
function isHiddenDisplayField(field: PropsField, frontmatter: Frontmatter): boolean {
  return field.control === "display" && valueText(readFieldValue(field, frontmatter)).trim() === "";
}

function renderField(
  plugin: ParaZkPluginContext,
  schema: PropsSchema,
  field: PropsField,
  frontmatter: Frontmatter,
  rowEl: HTMLElement,
  sourcePath?: string
): void {
  const fieldEl = rowEl.createDiv({ cls: "para-zk-props-field" });
  fieldEl.createDiv({ cls: "para-zk-props-label", text: field.label });
  const controlEl = fieldEl.createDiv({ cls: "para-zk-props-control" });
  renderFieldControl(plugin, field, frontmatter, controlEl, sourcePath, () => {
    renderPropsGrid(plugin, schema, rowEl.parentElement ?? rowEl, sourcePath);
  });
}

function renderSingleField(
  plugin: ParaZkPluginContext,
  schema: PropsSchema,
  field: PropsField,
  container: HTMLElement,
  sourcePath?: string
): void {
  const file = sourceFile(plugin, sourcePath);
  const frontmatter = file ? fileFrontmatter(plugin, file) : {};
  container.empty();
  renderFieldControl(plugin, findPropsField(schema, field.id) ?? field, frontmatter, container, sourcePath, () => {
    renderSingleField(plugin, schema, field, container, sourcePath);
  });
}

function renderFieldControl(
  plugin: ParaZkPluginContext,
  field: PropsField,
  frontmatter: Frontmatter,
  container: HTMLElement,
  sourcePath: string | undefined,
  rerender: () => void
): void {
  switch (field.control) {
    case "text":
      renderTextInput(plugin, field, frontmatter, container, sourcePath);
      return;
    case "date":
      renderDateInput(plugin, field, frontmatter, container, sourcePath, "date");
      return;
    case "datetime":
      renderDateInput(plugin, field, frontmatter, container, sourcePath, "datetime-local");
      return;
    case "select":
      renderSelectInput(plugin, field, frontmatter, container, sourcePath);
      return;
    case "area-list":
      renderAreaListInput(plugin, field, frontmatter, container, sourcePath, rerender);
      return;
    case "display":
      renderDisplayValue(plugin, field, frontmatter, container, sourcePath);
      return;
  }
}

function renderTextInput(
  plugin: ParaZkPluginContext,
  field: PropsField,
  frontmatter: Frontmatter,
  container: HTMLElement,
  sourcePath?: string
): void {
  const input = new TextComponent(container);
  input.inputEl.type = "text";
  input.inputEl.addClass("para-zk-props-input");
  input
    .setValue(valueText(readFieldValue(field, frontmatter)))
    .setDisabled(!field.key || !sourcePath);
  input.inputEl.addEventListener("change", () => {
    if (field.key) void writeFrontmatterValue(plugin, sourcePath, field.key, input.getValue());
  });
}

function renderDateInput(
  plugin: ParaZkPluginContext,
  field: PropsField,
  frontmatter: Frontmatter,
  container: HTMLElement,
  sourcePath: string | undefined,
  type: "date" | "datetime-local"
): void {
  const input = new TextComponent(container);
  input.inputEl.type = type;
  input.inputEl.addClass("para-zk-props-input");
  const currentValue = valueText(readFieldValue(field, frontmatter));
  const inputValue = type === "datetime-local" ? toDateTimeInputValue(currentValue) : currentValue;
  input
    .setValue(inputValue)
    .setDisabled(!field.key || !sourcePath);
  input.inputEl.addEventListener("change", () => {
    if (!field.key) return;
    let value = input.getValue();
    if (type === "datetime-local") value = fromDateTimeInputValue(value);
    void writeFrontmatterValue(plugin, sourcePath, field.key, value);
  });
}

function renderSelectInput(
  plugin: ParaZkPluginContext,
  field: PropsField,
  frontmatter: Frontmatter,
  container: HTMLElement,
  sourcePath?: string
): void {
  const select = new DropdownComponent(container);
  select.selectEl.addClass("para-zk-props-select");
  select.setDisabled(!field.key || !sourcePath);
  select.addOption("", "");
  const options = field.options ?? [];

  for (const option of options) {
    select.addOption(option.value, option.label);
  }

  const rawValue = valueText(readFieldValue(field, frontmatter));
  const selected = selectValue(rawValue, options);
  if (rawValue && selected === undefined) {
    select.addOption(rawValue, rawValue);
  }
  select.setValue(selected ?? rawValue);

  select.onChange((value) => {
    if (field.key) void writeFrontmatterValue(plugin, sourcePath, field.key, value);
  });
}

function renderAreaListInput(
  plugin: ParaZkPluginContext,
  field: PropsField,
  frontmatter: Frontmatter,
  container: HTMLElement,
  sourcePath: string | undefined,
  rerender: () => void
): void {
  const key = field.key;
  const values = key ? frontmatterLinks(frontmatter[key]) : [];
  const wrapper = container.createDiv({ cls: "para-zk-area-list" });
  const chips = wrapper.createDiv({ cls: "para-zk-area-chips" });

  for (const [index, value] of values.entries()) {
    const chip = chips.createSpan({ cls: "para-zk-area-chip" });
    const link = parseDisplayLink(value);
    if (link) {
      renderInternalLink(plugin, chip, link.target, link.label, sourcePath);
    } else {
      chip.createSpan({ text: displayLinkLabel(value) });
    }
    const remove = new ButtonComponent(chip);
    remove.buttonEl.addClass("para-zk-area-remove");
    remove
      .setIcon("x")
      .setTooltip("Remove")
      .setDisabled(!key || !sourcePath)
      .onClick(async () => {
        if (!key) return;
        await writeFrontmatterValue(plugin, sourcePath, key, values.filter((_, itemIndex) => itemIndex !== index));
        window.setTimeout(rerender, 50);
      });
  }

  const add = new ButtonComponent(wrapper);
  add.buttonEl.addClass("para-zk-area-add");
  add
    .setIcon("plus")
    .setTooltip("Add")
    .setDisabled(!key || !sourcePath)
    .onClick(() => {
      if (!key) return;
      const used = new Set(values);
      const suggestions = areaSuggestions(plugin).filter((area) => !used.has(area.link));
      if (suggestions.length === 0) {
        new Notice("PARA-ZK: no area notes found");
        return;
      }
      new AreaSuggestModal(plugin.app, suggestions, async (area) => {
        await writeFrontmatterValue(plugin, sourcePath, key, [...values, area.link]);
        window.setTimeout(rerender, 50);
      }).open();
    });
}

function renderDisplayValue(
  plugin: ParaZkPluginContext,
  field: PropsField,
  frontmatter: Frontmatter,
  container: HTMLElement,
  sourcePath?: string
): void {
  const value = readFieldValue(field, frontmatter);
  const tokens = Array.isArray(value) ? value.map((item) => String(item)) : [valueText(value)];
  tokens.forEach((token, index) => {
    if (index > 0) container.createSpan({ cls: "para-zk-props-display", text: ", " });
    const link = parseDisplayLink(token);
    if (link) {
      renderInternalLink(plugin, container, link.target, link.label, sourcePath, "para-zk-props-display");
    } else if (token) {
      container.createSpan({ cls: "para-zk-props-display", text: token });
    }
  });
}

function renderInternalLink(
  plugin: ParaZkPluginContext,
  container: HTMLElement,
  target: string,
  label: string,
  sourcePath?: string,
  extraClass?: string
): void {
  const link = container.createEl("a", {
    cls: extraClass ? `internal-link ${extraClass}` : "internal-link",
    text: label,
    attr: { href: target, "data-href": target }
  });
  link.addEventListener("click", (event) => {
    event.preventDefault();
    void plugin.app.workspace.openLinkText(
      target,
      sourcePath ?? "",
      event.ctrlKey || event.metaKey || event.button === 1
    );
  });
  link.addEventListener("mouseover", (event) => {
    plugin.app.workspace.trigger("hover-link", {
      event,
      source: "para-zk-props",
      hoverParent: container,
      targetEl: link,
      linktext: target,
      sourcePath: sourcePath ?? ""
    });
  });
}

async function focusMarkdownMode(
  plugin: ParaZkPluginContext,
  sourcePath: string | undefined,
  mode: "source" | "preview"
): Promise<void> {
  const file = sourceFile(plugin, sourcePath);
  if (!file) throw new Error("current note not found");

  const leaf = findMarkdownLeafForPath(plugin, file.path) ?? plugin.app.workspace.getLeaf(false);
  let view = leaf.view instanceof MarkdownView ? leaf.view : undefined;
  if (!view || view.file?.path !== file.path) {
    await leaf.openFile(file, {
      active: true,
      state: { mode }
    });
    view = leaf.view instanceof MarkdownView ? leaf.view : undefined;
  } else {
    await plugin.app.workspace.revealLeaf(leaf);
    plugin.app.workspace.setActiveLeaf(leaf, { focus: true });
    if (view.getMode() !== mode) {
      await view.setState({
        ...view.getState(),
        mode
      }, { history: false });
    }
  }

  if (!view) throw new Error("markdown editor not available");
  plugin.app.workspace.setActiveLeaf(view.leaf, { focus: true });
  if (mode === "source") {
    window.setTimeout(() => {
      if (!view) return;
      view.editor.setCursor(cursorAfterPropsHeading(view.editor.getValue()));
      view.editor.focus();
    }, 0);
  }
}

function cursorAfterPropsHeading(content: string): { line: number; ch: number } {
  const lines = content.split(/\r?\n/);
  const propsEnd = propsBlockEndLine(lines);
  const headingLine = firstHeadingLineAfter(lines, propsEnd + 1);
  if (headingLine === undefined) return { line: Math.min(lines.length, propsEnd + 1), ch: 0 };
  return { line: headingBodyStartLine(lines, headingLine + 1), ch: 0 };
}

function propsBlockEndLine(lines: string[]): number {
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*```para-zk-props(?:\s|$)/.test(lines[index])) continue;
    const close = closingFenceLine(lines, index + 1);
    return close ?? index;
  }
  return -1;
}

function firstHeadingLineAfter(lines: string[], startLine: number): number | undefined {
  for (let index = Math.max(0, startLine); index < lines.length; index += 1) {
    if (/^#{1,6}\s+\S/.test(lines[index])) return index;
  }
  return undefined;
}

function headingBodyStartLine(lines: string[], startLine: number): number {
  let line = startLine;
  if (/^\s*```para-zk-[^\r\n]*\s*$/.test(lines[line] ?? "")) {
    line = (closingFenceLine(lines, line + 1) ?? line) + 1;
  }

  return Math.min(line, lines.length);
}

function closingFenceLine(lines: string[], startLine: number): number | undefined {
  for (let index = startLine; index < lines.length; index += 1) {
    if (/^\s*```\s*$/.test(lines[index])) return index;
  }
  return undefined;
}

function findMarkdownLeafForPath(plugin: ParaZkPluginContext, path: string): WorkspaceLeaf | undefined {
  const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
  if (activeView?.file?.path === path) return activeView.leaf;

  return plugin.app.workspace.getLeavesOfType("markdown")
    .find((leaf) => markdownLeafPath(leaf) === path);
}

function markdownLeafPath(leaf: WorkspaceLeaf): string | undefined {
  if (leaf.view instanceof MarkdownView) return leaf.view.file?.path;
  const stateFile = leaf.getViewState().state?.file;
  return typeof stateFile === "string" ? stateFile : undefined;
}

function parseDisplayLink(value: string): { target: string; label: string } | undefined {
  const match = value.match(/^\[\[(.*?)(?:\|(.*?))?\]\]$/);
  if (!match) return undefined;
  const target = match[1];
  const label = match[2]?.trim() || target.split("/").pop()?.replace(/\.md$/i, "") || target;
  return { target, label };
}

async function writeFrontmatterValue(
  plugin: ParaZkPluginContext,
  sourcePath: string | undefined,
  key: string,
  value: string | string[]
): Promise<void> {
  const file = sourceFile(plugin, sourcePath);
  if (!file) {
    new Notice("PARA-ZK: current note not found");
    return;
  }

  try {
    const type = String(fileFrontmatter(plugin, file).type ?? "").toLowerCase();
    if (type === "project" && key === "status") {
      const workflows = await import("../workflows");
      await workflows.updateProject(
        { host: createObsidianHost(plugin.app), settings: plugin.settings },
        {
          path: file.path,
          key: "frontmatter/status",
          operation: "set",
          value
        }
      );
      return;
    }

    await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter[key] = value;
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    new Notice(`PARA-ZK: failed to update frontmatter: ${message}`);
  }
}

function readFieldValue(field: PropsField, frontmatter: Frontmatter): unknown {
  if (field.display === "period") {
    const start = valueText(frontmatter.week_start);
    const end = valueText(frontmatter.week_end);
    return [start, end].filter(Boolean).join(" ~ ");
  }
  if (field.display === "areas" && field.key) {
    return frontmatterLinks(frontmatter[field.key]).map(displayLinkLabel).join(", ");
  }
  return field.key ? frontmatter[field.key] : "";
}

function areaSuggestions(plugin: ParaZkPluginContext): AreaSuggestion[] {
  const folder = normalizeVaultPath(plugin.settings.paths.areasFolder);
  return plugin.app.vault.getMarkdownFiles()
    .filter((file) => {
      if (!file.path.startsWith(`${folder}/`)) return false;
      const frontmatter = fileFrontmatter(plugin, file);
      return frontmatter.type === "area" || file.parent?.name === file.basename;
    })
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((file) => ({
      name: file.basename,
      path: file.path,
      link: wikiLink(file.path)
    }));
}

class AreaSuggestModal extends SuggestModal<AreaSuggestion> {
  constructor(
    app: App,
    private readonly areas: AreaSuggestion[],
    private readonly choose: (area: AreaSuggestion) => Promise<void>
  ) {
    super(app);
    this.setPlaceholder("Area");
  }

  getSuggestions(query: string): AreaSuggestion[] {
    const token = query.trim().toLowerCase();
    if (!token) return this.areas;
    return this.areas.filter((area) => {
      return area.name.toLowerCase().includes(token)
        || area.path.toLowerCase().includes(token);
    });
  }

  renderSuggestion(area: AreaSuggestion, el: HTMLElement): void {
    el.createDiv({ text: area.name });
    el.createEl("small", { text: area.path });
  }

  onChooseSuggestion(area: AreaSuggestion): void {
    void this.choose(area);
  }
}

function sourceFile(plugin: ParaZkPluginContext, sourcePath: string | undefined): TFile | undefined {
  if (!sourcePath) return undefined;
  const file = plugin.app.vault.getFileByPath(sourcePath);
  return file instanceof TFile ? file : undefined;
}

function fileFrontmatter(plugin: ParaZkPluginContext, file: TFile): Frontmatter {
  return (plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Frontmatter;
}

function parseInlineInputToken(value: string): InlineInputToken | undefined {
  const match = value.trim().match(/^PZK_INPUT\[([A-Za-z0-9_.-]+)\]$/);
  if (!match) return undefined;
  const [maybeType, maybeField] = match[1].split(".");
  if (maybeField) {
    const type = parsePropsViewType(maybeType);
    return type ? { type, fieldId: maybeField } : undefined;
  }
  return { fieldId: maybeType };
}

function renderMuted(el: HTMLElement, text: string): void {
  el.createDiv({ cls: "para-zk-props-muted", text });
}

function valueText(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (value === null || value === undefined) return "";
  return String(value);
}

function labelValue(value: string | undefined, fallback: string): string {
  return value?.trim() ? value : fallback;
}

function toDateTimeInputValue(value: string): string {
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  return match ? `${match[1]}T${match[2]}` : "";
}

function fromDateTimeInputValue(value: string): string {
  return value ? value.replace("T", " ") : "";
}

function selectValue(rawValue: string, options: PropsSelectOption[]): string | undefined {
  if (!rawValue) return "";
  return options.find((option) => rawValue === option.value)?.value;
}

function displayLinkLabel(value: string): string {
  const match = value.match(/^\[\[(.*?)(?:\|(.*?))?\]\]$/);
  if (!match) return value;
  if (match[2]) return match[2];
  const path = match[1];
  return path.split("/").pop()?.replace(/\.md$/i, "") ?? path;
}
