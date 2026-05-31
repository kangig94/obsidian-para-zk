import {
  ButtonComponent,
  DropdownComponent,
  Notice,
  SuggestModal,
  TFile,
  TextComponent,
  type App,
  type MarkdownPostProcessorContext
} from "obsidian";
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
import { normalizeVaultPath, wikiLink } from "../vault/paths";

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
  if (!type) {
    renderMuted(el, "PARA-ZK props type is missing or unsupported.");
    return;
  }

  renderPropsGrid(plugin, propsSchemaForType(type, plugin.settings.locale), el, ctx.sourcePath);
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
  if (!file) container.addClass("is-disabled");

  for (const row of schema.rows) {
    const rowEl = container.createDiv({ cls: "para-zk-props-row" });
    for (const field of row) {
      renderField(plugin, schema, field, frontmatter, rowEl, sourcePath);
    }
  }
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
      renderDisplayValue(field, frontmatter, container);
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
  input
    .setValue(type === "datetime-local"
      ? toDateTimeInputValue(valueText(readFieldValue(field, frontmatter)))
      : valueText(readFieldValue(field, frontmatter)))
    .setDisabled(!field.key || !sourcePath);
  input.inputEl.addEventListener("change", () => {
    if (!field.key) return;
    const value = type === "datetime-local"
      ? fromDateTimeInputValue(input.getValue())
      : input.getValue();
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

  for (const option of field.options ?? []) {
    select.addOption(option.value, option.label);
  }

  const rawValue = valueText(readFieldValue(field, frontmatter));
  const selected = selectValue(rawValue, field.options ?? []);
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
    chip.createSpan({ text: displayLinkLabel(value) });
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

function renderDisplayValue(field: PropsField, frontmatter: Frontmatter, container: HTMLElement): void {
  const value = readFieldValue(field, frontmatter);
  container.createSpan({
    cls: "para-zk-props-display",
    text: valueText(value)
  });
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
        { app: plugin.app, settings: plugin.settings },
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

function parseCodeBlockKeyValues(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/);
    if (match) result[match[1]] = match[2];
  }
  return result;
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
