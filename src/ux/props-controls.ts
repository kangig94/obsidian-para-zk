import {
  ButtonComponent,
  DropdownComponent,
  MarkdownView,
  Notice,
  SuggestModal,
  TFile,
  TextComponent,
  setIcon,
  type App,
  type MarkdownPostProcessorContext,
  type WorkspaceLeaf
} from "obsidian";
import { formatRelativeTime, localePack } from "../i18n";
import { PARA_ZK_PATHS } from "../layout";
import type { ParaZkPluginContext } from "../plugin-interface";
import { singleItemList } from "../text";
import { formatDateTimeMinutes, frontmatterTimeMs, minutesFromMs, relativeTimeParts } from "../time";
import {
  findPropsField,
  inferPropsViewType,
  parsePropsNoteType,
  parsePropsViewType,
  propsSchemaForType,
  type PropsField,
  type PropsSchema,
  type PropsSelectOption,
  type PropsViewType
} from "../props/schema";
import {
  RESOURCE_KIND_CODES,
  resourceKindLabel
} from "../vocabulary";
import { frontmatterLinks, readFileTypeFresh } from "../vault/frontmatter";
import { workflowContext } from "../vault/host";
import { normalizeVaultPath, wikiLink } from "../vault/paths";
import {
  updateArea,
  updateJournal,
  updateProject,
  updateResource,
  updateRetro,
  updateZk
} from "../workflows";
import {
  renderBlockNotice,
  renderBlockShell,
  renderShellAction
} from "./blocks/shell";

type Frontmatter = Record<string, unknown>;
type WorkflowFrontmatterType = Exclude<PropsViewType, "subnote" | "llm-wiki">;
type FrontmatterWorkflowUpdate = (
  workflow: ReturnType<typeof workflowContext>,
  options: { path: string; key: string; operation: "set"; value: string | string[] }
) => Promise<unknown>;

type InlineInputToken = {
  type?: PropsViewType;
  fieldId: string;
};

type AreaSuggestion = {
  name: string;
  path: string;
  link: string;
};

type PropsRerender = (delayMs?: number) => void;

type PropsRerenderState = {
  generation: number;
};

type ResourceKindCache = {
  byPath: Map<string, string>;
  distinct?: string[];
};

type PropsControlRenderContext = {
  plugin: ParaZkPluginContext;
  field: PropsField;
  frontmatter: Frontmatter;
  container: HTMLElement;
  sourcePath: string | undefined;
  blockEl: HTMLElement;
  rerender: PropsRerender;
};
type PropsControlRenderer = (context: PropsControlRenderContext) => void;

const FRONTMATTER_WORKFLOW_UPDATES: Record<WorkflowFrontmatterType, FrontmatterWorkflowUpdate> = {
  project: updateProject,
  area: updateArea,
  resource: updateResource,
  journal: updateJournal,
  retro: updateRetro,
  spark: updateZk,
  digest: updateZk,
  permanent: updateZk
};

const PROPS_CONTROL_RENDERERS: Record<PropsField["control"], PropsControlRenderer> = {
  text: ({ plugin, field, frontmatter, container, sourcePath, blockEl }) => {
    renderTextInput(plugin, field, frontmatter, container, sourcePath, blockEl);
  },
  "text-list": ({ plugin, field, frontmatter, container, sourcePath, blockEl }) => {
    renderTextInput(plugin, field, frontmatter, container, sourcePath, blockEl, { list: true });
  },
  "resource-kind": ({ plugin, field, frontmatter, container, sourcePath, blockEl }) => {
    renderTextInput(plugin, field, frontmatter, container, sourcePath, blockEl, {
      suggestions: resourceKindSuggestions(plugin)
    });
  },
  url: ({ plugin, field, frontmatter, container, sourcePath, blockEl, rerender }) => {
    renderUrlField(plugin, field, frontmatter, container, sourcePath, blockEl, rerender);
  },
  date: ({ plugin, field, frontmatter, container, sourcePath, blockEl }) => {
    renderDateInput(plugin, field, frontmatter, container, sourcePath, blockEl, "date");
  },
  datetime: ({ plugin, field, frontmatter, container, sourcePath, blockEl }) => {
    renderDateInput(plugin, field, frontmatter, container, sourcePath, blockEl, "datetime-local");
  },
  select: ({ plugin, field, frontmatter, container, sourcePath, blockEl }) => {
    renderSelectInput(plugin, field, frontmatter, container, sourcePath, blockEl);
  },
  "area-list": ({ plugin, field, frontmatter, container, sourcePath, blockEl, rerender }) => {
    renderAreaListInput(plugin, field, frontmatter, container, sourcePath, blockEl, rerender);
  },
  "datetime-display": ({ field, frontmatter, container }) => {
    renderDateTimeDisplay(field, frontmatter, container);
  },
  "relative-time": ({ plugin, field, frontmatter, container }) => {
    renderRelativeTime(plugin, field, frontmatter, container);
  },
  display: ({ plugin, field, frontmatter, container, sourcePath }) => {
    renderDisplayValue(plugin, field, frontmatter, container, sourcePath);
  }
};

const propsRerenderStates = new WeakMap<HTMLElement, PropsRerenderState>();
const resourceKindCaches = new WeakMap<ParaZkPluginContext, ResourceKindCache>();
const registeredResourceKindCaches = new WeakSet<ParaZkPluginContext>();

export function registerPropsControlRenderers(plugin: ParaZkPluginContext): void {
  registerResourceKindCache(plugin);
  plugin.registerMarkdownPostProcessor((el, ctx) => {
    renderInlinePropsInputs(plugin, el, ctx);
  });
}

export function renderPropsPanel(
  plugin: ParaZkPluginContext,
  el: HTMLElement,
  sourcePath: string | undefined
): void {
  const file = sourceFile(plugin, sourcePath);
  const frontmatter = file ? fileFrontmatter(plugin, file) : {};
  const type = inferPropsViewType(frontmatter);

  el.empty();
  if (!type) {
    renderBlockNotice(el, "props", "PARA-ZK props type is missing or unsupported.");
    return;
  }

  const schema = propsSchemaForType(type, plugin.settings.locale);
  const body = renderPropsShell(plugin, schema, el, sourcePath);
  renderPropsGrid(plugin, schema, body, sourcePath, el);
}

function renderInlinePropsInputs(plugin: ParaZkPluginContext, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
  if (!el.textContent?.includes("PZ_INPUT[")) return;

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

    const container = activeDocument.createElement("span");
    container.addClass("para-zk-inline-input");
    const rerender = latestPropsRerender(container, () => {
      renderSingleField(plugin, schema, field, container, ctx.sourcePath, container);
    });
    renderFieldControl(plugin, field, frontmatter, container, ctx.sourcePath, container, rerender);
    codeEl.replaceWith(container);
  }
}

function renderPropsGrid(
  plugin: ParaZkPluginContext,
  schema: PropsSchema,
  container: HTMLElement,
  sourcePath: string | undefined,
  blockEl: HTMLElement
): void {
  const file = sourceFile(plugin, sourcePath);
  const frontmatter = file ? fileFrontmatter(plugin, file) : {};

  container.empty();
  container.addClass("para-zk-block__grid");
  container.removeClass("is-disabled");
  if (!file) container.addClass("is-disabled");

  for (const row of schema.rows) {
    const visibleFields = row.filter((field) => !isHiddenDisplayField(field, frontmatter));
    if (visibleFields.length === 0) continue;
    const rowEl = container.createDiv({ cls: "para-zk-block__row" });
    for (const field of visibleFields) {
      renderField(plugin, schema, field, frontmatter, rowEl, sourcePath, blockEl);
    }
  }
}

function renderPropsShell(
  plugin: ParaZkPluginContext,
  schema: PropsSchema,
  container: HTMLElement,
  sourcePath?: string
): HTMLElement {
  const labels = localePack(plugin.settings.locale).labels;
  const leadField = schema.lead;
  return renderBlockShell(container, {
    kind: "props",
    renderLead: leadField
      ? (lead) => renderPropsLeadField(plugin, schema, leadField, lead, sourcePath, container)
      : undefined,
    renderActions: (actions) => {
      renderPropsModeButton(plugin, actions, {
        sourcePath,
        blockEl: container,
        label: labelValue(labels.edit, "Edit"),
        icon: "pencil",
        variant: "edit-mode",
        mode: "source"
      });
      renderPropsModeButton(plugin, actions, {
        sourcePath,
        blockEl: container,
        label: labelValue(labels.view, "Read"),
        icon: "eye",
        variant: "read-mode",
        mode: "preview"
      });
    }
  }).body;
}

function renderPropsLeadField(
  plugin: ParaZkPluginContext,
  schema: PropsSchema,
  field: PropsField,
  container: HTMLElement,
  sourcePath: string | undefined,
  blockEl: HTMLElement
): void {
  container.addClass("para-zk-block__lead--props");
  renderSingleField(plugin, schema, field, container, sourcePath, blockEl);
}

function renderPropsModeButton(
  plugin: ParaZkPluginContext,
  container: HTMLElement,
  options: {
    sourcePath?: string;
    blockEl: HTMLElement;
    label: string;
    icon: string;
    variant: string;
    mode: "source" | "preview";
  }
): void {
  const buttonComponent = renderShellAction(container, {
    label: options.label,
    icon: options.icon,
    variant: options.variant,
    onClick: async (button) => {
      button.disabled = true;
      try {
        await focusMarkdownMode(plugin, options.sourcePath, options.blockEl, options.mode);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        new Notice(`PARA-ZK: ${message}`);
      } finally {
        button.disabled = false;
      }
    }
  });
  buttonComponent.setDisabled(!options.sourcePath);
}

// Read-only display fields with no value (e.g. an area note's empty `parent`, or an
// unfilled `created`/`updated`) are skipped so they do not leave a half-empty row;
// editable controls always render so the user can fill them.
function isHiddenDisplayField(field: PropsField, frontmatter: Frontmatter): boolean {
  const readOnly = field.control === "display"
    || field.control === "datetime-display"
    || field.control === "relative-time";
  return readOnly && valueText(readFieldValue(field, frontmatter)).trim() === "";
}

function renderField(
  plugin: ParaZkPluginContext,
  schema: PropsSchema,
  field: PropsField,
  frontmatter: Frontmatter,
  rowEl: HTMLElement,
  sourcePath: string | undefined,
  blockEl: HTMLElement
): void {
  const fieldEl = rowEl.createDiv({ cls: "para-zk-block__field" });
  fieldEl.createDiv({ cls: "para-zk-block__label", text: field.label });
  const controlEl = fieldEl.createDiv({ cls: "para-zk-block__control" });
  const gridEl = rowEl.parentElement ?? rowEl;
  const rerender = latestPropsRerender(gridEl, () => {
    renderPropsGrid(plugin, schema, gridEl, sourcePath, blockEl);
  });
  renderFieldControl(plugin, field, frontmatter, controlEl, sourcePath, blockEl, rerender);
}

function renderSingleField(
  plugin: ParaZkPluginContext,
  schema: PropsSchema,
  field: PropsField,
  container: HTMLElement,
  sourcePath: string | undefined,
  blockEl: HTMLElement = container
): void {
  const file = sourceFile(plugin, sourcePath);
  const frontmatter = file ? fileFrontmatter(plugin, file) : {};
  container.empty();
  const rerender = latestPropsRerender(container, () => {
    renderSingleField(plugin, schema, field, container, sourcePath, blockEl);
  });
  const resolvedField = findPropsField(schema, field.id) ?? field;
  renderFieldControl(plugin, resolvedField, frontmatter, container, sourcePath, blockEl, rerender);
  labelSingleFieldControl(container, resolvedField.label);
}

function labelSingleFieldControl(container: HTMLElement, label: string): void {
  const input = container.querySelector<HTMLInputElement>("input.para-zk-block__input");
  if (!input) return;
  input.placeholder = label;
  input.setAttribute("aria-label", label);
}

function renderFieldControl(
  plugin: ParaZkPluginContext,
  field: PropsField,
  frontmatter: Frontmatter,
  container: HTMLElement,
  sourcePath: string | undefined,
  blockEl: HTMLElement,
  rerender: PropsRerender
): void {
  container.removeClass("para-zk-block__control--url-link");
  PROPS_CONTROL_RENDERERS[field.control]({
    plugin,
    field,
    frontmatter,
    container,
    sourcePath,
    blockEl,
    rerender
  });
}

const TIMESTAMP_CLS = "para-zk-block__display para-zk-block__timestamp";

// Read-only absolute timestamp (`YYYY-MM-DD HH:MM`). PARA-ZK formats the value itself so
// the display is stable regardless of how Obsidian types the `created` property.
function renderDateTimeDisplay(field: PropsField, frontmatter: Frontmatter, container: HTMLElement): void {
  const raw = valueText(readFieldValue(field, frontmatter));
  if (!raw) return;
  container.createSpan({ cls: TIMESTAMP_CLS, text: formatDateTimeMinutes(raw) ?? raw });
}

// Read-only relative timestamp ("3시간 12분 전") with the absolute value on hover; past the
// 30-day horizon it falls back to the same absolute format as `created`.
function renderRelativeTime(
  plugin: ParaZkPluginContext,
  field: PropsField,
  frontmatter: Frontmatter,
  container: HTMLElement
): void {
  const raw = valueText(readFieldValue(field, frontmatter));
  if (!raw) return;
  const ms = frontmatterTimeMs(raw);
  // Parse once: absolute date and the relative bucket both derive from `ms`. When the value
  // is unparseable the span shows the raw text; past the 30-day horizon it shows the date.
  const absolute = ms === undefined ? raw : minutesFromMs(ms);
  const parts = ms === undefined ? undefined : relativeTimeParts(ms, Date.now());
  const relative = parts && parts.unit !== "absolute" ? formatRelativeTime(parts, plugin.settings.locale) : undefined;
  const span = container.createSpan({ cls: TIMESTAMP_CLS, text: relative ?? absolute });
  if (relative) span.setAttribute("title", absolute);
}

function renderTextInput(
  plugin: ParaZkPluginContext,
  field: PropsField,
  frontmatter: Frontmatter,
  container: HTMLElement,
  sourcePath: string | undefined,
  blockEl: HTMLElement,
  options: { list?: boolean; suggestions?: PropsSelectOption[] } = {}
): void {
  const input = new TextComponent(container);
  input.inputEl.type = "text";
  input.inputEl.addClass("para-zk-block__input");
  if (options.suggestions?.length) {
    attachTextSuggestions(container, input.inputEl, options.suggestions);
  }
  input
    .setValue(valueText(readFieldValue(field, frontmatter)))
    .setDisabled(!field.key || !sourcePath);
  input.inputEl.addEventListener("change", () => {
    if (!field.key) return;
    const raw = input.getValue();
    // A list-backed text field (e.g. Obsidian-native `aliases`) keeps a single
    // typed value but stores it as a one-item YAML list, the form Obsidian resolves
    // for links/quick-switcher. Empty clears it to an empty list.
    const value = options.list ? singleItemList(raw) : raw;
    void writeFrontmatterValue(plugin, sourcePath, blockEl, field.key, value);
  });
}

let textSuggestionListSequence = 0;

function attachTextSuggestions(
  container: HTMLElement,
  input: HTMLInputElement,
  suggestions: PropsSelectOption[]
): void {
  const id = `para-zk-text-suggestions-${++textSuggestionListSequence}`;
  input.setAttr("list", id);
  input.setAttr("autocomplete", "off");
  input.addClass("para-zk-block__input--combobox");
  const list = container.createEl("datalist", { attr: { id } });
  for (const suggestion of suggestions) {
    list.createEl("option", {
      attr: {
        value: suggestion.value,
        label: suggestion.label
      }
    });
  }
}

function resourceKindSuggestions(plugin: ParaZkPluginContext): PropsSelectOption[] {
  const values = new Map<string, PropsSelectOption>();
  const add = (value: string, label = value): void => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const key = trimmed.toLocaleLowerCase();
    if (!values.has(key)) values.set(key, { value: trimmed, label });
  };

  for (const code of RESOURCE_KIND_CODES) {
    add(code, resourceKindLabel(code, plugin.settings.locale));
  }

  for (const kind of cachedResourceKinds(plugin)) add(kind);

  return Array.from(values.values());
}

function registerResourceKindCache(plugin: ParaZkPluginContext): void {
  ensureResourceKindCache(plugin);
  if (registeredResourceKindCaches.has(plugin)) return;
  registeredResourceKindCaches.add(plugin);

  plugin.registerEvent(
    plugin.app.metadataCache.on("changed", (file) => updateCachedResourceKind(plugin, file))
  );
  plugin.registerEvent(
    plugin.app.vault.on("delete", (file) => {
      if (file instanceof TFile) removeCachedResourceKind(plugin, file.path);
    })
  );
  plugin.registerEvent(
    plugin.app.vault.on("rename", (file, oldPath) => {
      removeCachedResourceKind(plugin, oldPath);
      if (file instanceof TFile) updateCachedResourceKind(plugin, file);
    })
  );
  plugin.register(() => {
    resourceKindCaches.delete(plugin);
    registeredResourceKindCaches.delete(plugin);
  });
}

function cachedResourceKinds(plugin: ParaZkPluginContext): string[] {
  const cache = ensureResourceKindCache(plugin);
  if (!cache.distinct) {
    const values = new Map<string, string>();
    for (const value of cache.byPath.values()) {
      const key = value.toLocaleLowerCase();
      if (!values.has(key)) values.set(key, value);
    }
    cache.distinct = Array.from(values.values())
      .sort((left, right) => left.localeCompare(right));
  }
  return cache.distinct;
}

function ensureResourceKindCache(plugin: ParaZkPluginContext): ResourceKindCache {
  const existing = resourceKindCaches.get(plugin);
  if (existing) return existing;

  const cache: ResourceKindCache = { byPath: new Map() };
  resourceKindCaches.set(plugin, cache);
  for (const file of plugin.app.vault.getMarkdownFiles()) {
    setCachedResourceKind(cache, file.path, resourceKindForFile(plugin, file));
  }
  return cache;
}

function updateCachedResourceKind(plugin: ParaZkPluginContext, file: TFile): void {
  const cache = ensureResourceKindCache(plugin);
  setCachedResourceKind(cache, file.path, resourceKindForFile(plugin, file));
}

function removeCachedResourceKind(plugin: ParaZkPluginContext, path: string): void {
  const cache = ensureResourceKindCache(plugin);
  if (!cache.byPath.delete(path)) return;
  cache.distinct = undefined;
}

function setCachedResourceKind(
  cache: ResourceKindCache,
  path: string,
  kind: string | undefined
): void {
  const previous = cache.byPath.get(path);
  if (kind === undefined) {
    if (!cache.byPath.delete(path)) return;
  } else {
    if (previous === kind) return;
    cache.byPath.set(path, kind);
  }
  cache.distinct = undefined;
}

function resourceKindForFile(plugin: ParaZkPluginContext, file: TFile): string | undefined {
  const frontmatter = fileFrontmatter(plugin, file);
  if (frontmatter.type !== "resource" || typeof frontmatter.kind !== "string") return undefined;
  return frontmatter.kind.trim() || undefined;
}

function renderUrlField(
  plugin: ParaZkPluginContext,
  field: PropsField,
  frontmatter: Frontmatter,
  container: HTMLElement,
  sourcePath: string | undefined,
  blockEl: HTMLElement,
  rerender: PropsRerender
): void {
  const url = valueText(readFieldValue(field, frontmatter));
  if (!isWebUrl(url)) {
    renderUrlEditInput(plugin, field, frontmatter, container, sourcePath, blockEl, rerender, false);
    return;
  }

  container.addClass("para-zk-block__control--url-link");
  const link = container.createEl("a", { cls: "para-zk-block__url-link", text: url });
  link.setAttr("href", url);
  link.setAttr("rel", "noopener");
  link.addEventListener("click", (event) => {
    event.preventDefault();
    window.open(url, "_blank", "noopener");
  });

  const editLabel = labelValue(localePack(plugin.settings.locale).labels.editUrl, "Edit URL");
  const editButton = container.createEl("button", { cls: "para-zk-block__url-edit" });
  editButton.type = "button";
  editButton.setAttr("aria-label", editLabel);
  editButton.setAttr("title", editLabel);
  editButton.disabled = !field.key || !sourcePath;
  setIcon(editButton, "pencil");
  editButton.addEventListener("click", () => {
    if (!field.key || !sourcePath) return;
    container.empty();
    renderUrlEditInput(plugin, field, frontmatter, container, sourcePath, blockEl, rerender, true);
  });
}

// An editable URL input that confirms on blur (Enter blurs to confirm) and reverts to the
// link display. The change event alone left the field stuck as an input: an unchanged edit
// fires no change, so nothing re-rendered it back to the link. Blur drives both — a changed
// value commits (the block re-renders to the link via its metadata listener), an unchanged
// value re-renders in place. Escape discards (reverts to the link even if a value was typed).
// An empty / not-yet-a-URL value has no link to revert to, so it stays an input to be filled in.
function renderUrlEditInput(
  plugin: ParaZkPluginContext,
  field: PropsField,
  frontmatter: Frontmatter,
  container: HTMLElement,
  sourcePath: string | undefined,
  blockEl: HTMLElement,
  rerender: PropsRerender,
  autoFocus: boolean
): void {
  const original = valueText(readFieldValue(field, frontmatter));
  const input = new TextComponent(container);
  input.inputEl.type = "text";
  input.inputEl.addClass("para-zk-block__input");
  input.setValue(original).setDisabled(!field.key || !sourcePath);

  let settled = false;
  input.inputEl.addEventListener("blur", () => {
    if (settled || !field.key || !sourcePath) return;
    const value = input.getValue();
    if (value !== original) {
      settled = true;
      void writeFrontmatterValue(plugin, sourcePath, blockEl, field.key, value);
    } else if (isWebUrl(original)) {
      settled = true;
      rerender();
    }
  });
  input.inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      input.inputEl.blur();
    } else if (event.key === "Escape" && !settled) {
      event.preventDefault();
      settled = true;
      rerender();
    }
  });

  if (autoFocus) {
    input.inputEl.focus();
    input.inputEl.select();
  }
}

function renderDateInput(
  plugin: ParaZkPluginContext,
  field: PropsField,
  frontmatter: Frontmatter,
  container: HTMLElement,
  sourcePath: string | undefined,
  blockEl: HTMLElement,
  type: "date" | "datetime-local"
): void {
  const input = new TextComponent(container);
  input.inputEl.type = type;
  input.inputEl.addClass("para-zk-block__input");
  const currentValue = valueText(readFieldValue(field, frontmatter));
  const inputValue = type === "datetime-local" ? toDateTimeInputValue(currentValue) : currentValue;
  input
    .setValue(inputValue)
    .setDisabled(!field.key || !sourcePath);
  input.inputEl.addEventListener("change", () => {
    if (!field.key) return;
    let value = input.getValue();
    if (type === "datetime-local") value = fromDateTimeInputValue(value);
    void writeFrontmatterValue(plugin, sourcePath, blockEl, field.key, value);
  });
}

function renderSelectInput(
  plugin: ParaZkPluginContext,
  field: PropsField,
  frontmatter: Frontmatter,
  container: HTMLElement,
  sourcePath: string | undefined,
  blockEl: HTMLElement
): void {
  const select = new DropdownComponent(container);
  select.selectEl.addClass("para-zk-block__select");
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
    if (field.key) void writeFrontmatterValue(plugin, sourcePath, blockEl, field.key, value);
  });
}

function renderAreaListInput(
  plugin: ParaZkPluginContext,
  field: PropsField,
  frontmatter: Frontmatter,
  container: HTMLElement,
  sourcePath: string | undefined,
  blockEl: HTMLElement,
  rerender: PropsRerender
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
        await writeFrontmatterValue(plugin, sourcePath, blockEl, key, values.filter((_, itemIndex) => itemIndex !== index));
        rerender(50);
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
        await writeFrontmatterValue(plugin, sourcePath, blockEl, key, [...values, area.link]);
        rerender(50);
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
    if (index > 0) container.createSpan({ cls: "para-zk-block__display", text: ", " });
    const link = parseDisplayLink(token);
    if (link) {
      renderInternalLink(plugin, container, link.target, link.label, sourcePath, "para-zk-block__display");
    } else if (token) {
      container.createSpan({ cls: "para-zk-block__display", text: token });
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
  blockEl: HTMLElement,
  mode: "source" | "preview"
): Promise<void> {
  const file = resolveBlockFile(plugin, sourcePath, blockEl);
  if (!file) throw new Error("current note not found");

  if (plugin.settings.rememberCursorPosition) {
    const { suppressNextPositionRestore } = await import("./position-memory");
    suppressNextPositionRestore(plugin, file.path);
  }

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
  const bodyStart = propsEnd >= 0 ? propsEnd + 1 : markdownBodyStartLine(lines);
  const headingLine = firstHeadingLineAfter(lines, bodyStart);
  if (headingLine === undefined) return { line: Math.min(lines.length, bodyStart), ch: 0 };
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

function markdownBodyStartLine(lines: string[]): number {
  if (!/^\uFEFF?---\s*$/.test(lines[0] ?? "")) return 0;
  for (let index = 1; index < lines.length; index += 1) {
    if (/^\s*---\s*$/.test(lines[index])) return Math.min(index + 1, lines.length);
  }
  return 0;
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

export async function writeFrontmatterValue(
  plugin: ParaZkPluginContext,
  sourcePath: string | undefined,
  blockEl: HTMLElement,
  key: string,
  value: string | string[]
): Promise<void> {
  const file = resolveBlockFile(plugin, sourcePath, blockEl);
  if (!file) {
    new Notice("PARA-ZK: current note not found");
    return;
  }

  try {
    const workflow = workflowContext(plugin);
    const rawType = await readFileTypeFresh(workflow, file);
    const type = normalizePropsWorkflowType(rawType);
    if (type === "subnote") {
      // Core child updates are addressed by root project/area plus child-title chain, while
      // a rendered subnote only has its own file path. Keep this direct write isolated here
      // until the core grows a path selector for child-note updates.
      await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
        const target = frontmatter as Record<string, unknown>;
        target[key] = value;
      });
      return;
    }

    if (!isWorkflowFrontmatterType(type)) throw new Error(`unsupported props frontmatter type: ${rawType}`);
    const update = FRONTMATTER_WORKFLOW_UPDATES[type];
    await update(workflow, {
      path: file.path,
      key: `frontmatter/${key}`,
      operation: "set",
      value
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    new Notice(`PARA-ZK: failed to update frontmatter: ${message}`);
  }
}

function normalizePropsWorkflowType(type: string): PropsViewType | undefined {
  const normalized = type.trim().toLowerCase();
  return parsePropsNoteType(normalized);
}

function isWorkflowFrontmatterType(type: PropsViewType | undefined): type is WorkflowFrontmatterType {
  return type !== undefined && type !== "subnote" && type !== "llm-wiki";
}

function latestPropsRerender(container: HTMLElement, render: () => void): PropsRerender {
  return (delayMs = 0) => {
    const state = propsRerenderState(container);
    const generation = ++state.generation;
    const apply = () => {
      if (propsRerenderStates.get(container)?.generation !== generation) return;
      if (!container.isConnected) return;
      render();
    };

    if (delayMs > 0) {
      window.setTimeout(apply, delayMs);
      return;
    }
    apply();
  };
}

function propsRerenderState(container: HTMLElement): PropsRerenderState {
  const existing = propsRerenderStates.get(container);
  if (existing) return existing;
  const state: PropsRerenderState = { generation: 0 };
  propsRerenderStates.set(container, state);
  return state;
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
  const folder = normalizeVaultPath(PARA_ZK_PATHS.areasFolder);
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
  private readonly areas: AreaSuggestion[];
  private readonly choose: (area: AreaSuggestion) => Promise<void>;

  constructor(
    app: App,
    areas: AreaSuggestion[],
    choose: (area: AreaSuggestion) => Promise<void>
  ) {
    super(app);
    this.areas = areas;
    this.choose = choose;
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

function resolveBlockFile(
  plugin: ParaZkPluginContext,
  sourcePath: string | undefined,
  blockEl: HTMLElement
): TFile | undefined {
  const direct = sourceFile(plugin, sourcePath);
  if (direct) return direct;

  // When an inline title edit blurs during a props click, Obsidian may retarget the
  // owning markdown leaf before the vault rename event reaches this render child.
  const leaf = plugin.app.workspace.getLeavesOfType("markdown")
    .find((leaf) => leaf.view instanceof MarkdownView && leaf.view.containerEl.contains(blockEl));
  const file = leaf?.view instanceof MarkdownView ? leaf.view.file : undefined;
  return file instanceof TFile ? file : undefined;
}

function fileFrontmatter(plugin: ParaZkPluginContext, file: TFile): Frontmatter {
  return plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
}

function parseInlineInputToken(value: string): InlineInputToken | undefined {
  const match = value.trim().match(/^PZ_INPUT\[([A-Za-z0-9_.-]+)\]$/);
  if (!match) return undefined;
  const [maybeType, maybeField] = match[1].split(".");
  if (maybeField) {
    const type = parsePropsViewType(maybeType);
    return type ? { type, fieldId: maybeField } : undefined;
  }
  return { fieldId: maybeType };
}

function valueText(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (value === null || value === undefined) return "";
  return String(value);
}

// Narrower than workflows' `isExternalReference` (which also accepts mailto:/tel: and any
// scheme): a props `url` field renders as a clickable web link only for http/https, so a
// stray non-web value stays an editable input rather than becoming an unopenable anchor.
function isWebUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
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
