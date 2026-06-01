import {
  ButtonComponent,
  Modal,
  Notice,
  Setting,
  TFile,
  type MarkdownPostProcessorContext
} from "obsidian";
import { localePack } from "../i18n";
import type { ParaZkPluginContext } from "../plugin-interface";
import {
  deleteReferenceItem,
  insertReferenceItem,
  readReferenceItems,
  reorderReferenceItems,
  updateReferenceItem,
  type ReferenceRead,
  type WorkflowContext
} from "../workflows";
import {
  beginRegistryBlockRender,
  canRegistryDragReorder,
  createRegistryDragReorder,
  isCurrentRegistryBlockGeneration,
  queueRegistryFileWrite,
  registryErrorMessage,
  renderRegistryBlockError,
  renderRegistryRow,
  renderRegistryToolbar,
  runRegistryBlockAction,
  type RegistryBlockState,
  type RegistryDragOptions
} from "./registry-block";

type ReferenceBlockArgs = {
  root: "current" | string;
};

type ReferenceToolbarState = Record<string, never>;

type ReferenceBlockState = RegistryBlockState<ReferenceToolbarState, RenderableReference>;

type RenderableReference = {
  rootFile: TFile;
  index: number;
  reference: ReferenceRead;
};

type ReferenceEditValue = {
  link: string;
  label: string;
  note: string;
};

const REFERENCE_GONE_MESSAGE = "reference no longer present — re-render";
const referenceBlockStates = new WeakMap<HTMLElement, ReferenceBlockState>();

export function registerReferenceRenderers(plugin: ParaZkPluginContext): void {
  plugin.registerMarkdownCodeBlockProcessor("para-zk-references", (source, el, ctx) => {
    void renderReferenceBlock(plugin, source, el, ctx).catch((error: unknown) => renderReferenceError(el, error));
  });
}

async function renderReferenceBlock(
  plugin: ParaZkPluginContext,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
): Promise<void> {
  const args = parseReferenceBlockArgs(source);
  const blockState = beginReferenceBlockRender(el, args);
  const generation = blockState.generation;
  el.empty();
  el.addClass("para-zk-references");

  try {
    if (args.root !== "current") {
      throw new Error("PARA-ZK references block only supports root: current.");
    }

    const labels = localePack(plugin.settings.locale).labels;
    const rootFile = plugin.app.vault.getFileByPath(ctx.sourcePath) ?? undefined;
    if (!(rootFile instanceof TFile)) {
      el.createDiv({
        cls: "para-zk-reference-empty",
        text: labelValue(labels.referenceEmpty, "No references.")
      });
      return;
    }

    const items = currentReferences(plugin, rootFile);
    if (!isCurrentReferenceBlockGeneration(el, generation)) return;

    blockState.items = items;
    blockState.visible = items;
    const renderedLinks = items.map(referenceItemKey);
    const drag = canRegistryDragReorder(items, items, args.root === "current")
      ? createRegistryDragReorder<RenderableReference>({
        visibleItems: () => blockState.visible,
        itemKey: referenceItemKey,
        persistOrder: (nextLinks) => queueRegistryFileWrite(
          rootFile,
          () => persistReferenceOrder(plugin, rootFile, renderedLinks, nextLinks)
        ),
        rerender: () => renderReferenceBlock(plugin, source, el, ctx)
      })
      : undefined;

    renderReferenceToolbar(plugin, el, {
      rootFile,
      items,
      rerender: () => renderReferenceBlock(plugin, source, el, ctx)
    });

    if (items.length === 0) {
      el.createDiv({
        cls: "para-zk-reference-empty",
        text: labelValue(labels.referenceEmpty, "No references.")
      });
      return;
    }

    const list = el.createDiv({ cls: "para-zk-reference-list" });
    for (const item of items) {
      renderReferenceRow(plugin, list, item, {
        blockState,
        ctx,
        drag,
        rerender: () => renderReferenceBlock(plugin, source, el, ctx)
      });
    }
  } catch (error) {
    if (isCurrentReferenceBlockGeneration(el, generation)) renderReferenceError(el, error);
  }
}

function renderReferenceToolbar(
  plugin: ParaZkPluginContext,
  el: HTMLElement,
  options: {
    rootFile: TFile;
    items: RenderableReference[];
    rerender: () => Promise<void>;
  }
): void {
  const labels = localePack(plugin.settings.locale).labels;
  renderRegistryToolbar(el, {
    toolbarClass: "para-zk-reference-toolbar",
    headingClass: "para-zk-reference-toolbar-heading",
    summaryClass: "para-zk-reference-toolbar-summary",
    controlsClass: "para-zk-reference-toolbar-controls",
    summaryText: referenceSummaryText(options.items, labels),
    renderControls: (controls) => {
      const add = new ButtonComponent(controls);
      const addButton = add.buttonEl;
      const addLabel = labelValue(labels.referenceAdd, labelValue(labels.addReference, "Add reference"));
      addButton.addClass("para-zk-reference-toolbar-button", "para-zk-reference-add");
      addButton.setAttr("aria-label", addLabel);
      add
        .setIcon("plus")
        .setButtonText(addLabel)
        .setTooltip(addLabel)
        .onClick(() => {
          new ReferenceEditModal(
            plugin,
            addLabel,
            { link: "", label: "", note: "" },
            async (value) => {
              await queueRegistryFileWrite(
                options.rootFile,
                () => insertReferenceFromEditor(plugin, options.rootFile, value)
              );
              await options.rerender();
            }
          ).open();
        });
    }
  });
}

function renderReferenceRow(
  plugin: ParaZkPluginContext,
  list: HTMLElement,
  item: RenderableReference,
  options: {
    blockState: ReferenceBlockState;
    ctx: MarkdownPostProcessorContext;
    drag?: RegistryDragOptions;
    rerender: () => Promise<void>;
  }
): void {
  const labels = localePack(plugin.settings.locale).labels;
  renderRegistryRow(list, item, {
    rowClass: "para-zk-reference-row",
    dataset: {
      referenceIndex: String(item.index),
      referenceLink: item.reference.link,
      referenceKind: item.reference.kind
    },
    reorderableClass: "is-reorderable",
    drag: options.drag ? {
      state: options.blockState,
      itemKey: referenceItemKey,
      handleClass: "para-zk-reference-drag",
      label: "Reorder reference",
      rowSelector: ".para-zk-reference-row",
      drag: options.drag
    } : undefined,
    renderBody: (row) => {
      const body = row.createDiv({ cls: "para-zk-reference-body" });
      const main = body.createDiv({ cls: "para-zk-reference-main" });
      const link = main.createEl("a", {
        cls: "para-zk-reference-link",
        text: referenceDisplayLabel(item.reference)
      });
      link.setAttr("href", referenceHref(item.reference));
      link.setAttr("title", referenceTargetHint(item.reference));
      link.addEventListener("click", (event) => {
        event.preventDefault();
        void openReferenceLink(plugin, item.reference, options.ctx.sourcePath).catch((error: unknown) => {
          new Notice(registryErrorMessage(error));
        });
      });
      if (item.reference.note) {
        body.createDiv({
          cls: "para-zk-reference-note",
          text: item.reference.note
        });
      }

      const actions = row.createDiv({ cls: "para-zk-reference-actions" });
      const editAction = new ButtonComponent(actions);
      const edit = editAction.buttonEl;
      const editLabel = labelValue(labels.referenceEdit, "Edit reference");
      edit.addClass("para-zk-reference-edit");
      edit.setAttr("aria-label", editLabel);
      editAction
        .setIcon("pencil")
        .setTooltip(editLabel)
        .onClick(() => {
          new ReferenceEditModal(
            plugin,
            editLabel,
            {
              link: item.reference.link,
              label: item.reference.label ?? "",
              note: item.reference.note ?? ""
            },
            async (value) => {
              await updateReferenceFromEditor(plugin, item, value);
              await options.rerender();
            }
          ).open();
        });

      const removeAction = new ButtonComponent(actions);
      const remove = removeAction.buttonEl;
      const deleteLabel = labelValue(labels.referenceDelete, "Delete reference");
      remove.addClass("para-zk-reference-delete");
      remove.setAttr("aria-label", deleteLabel);
      removeAction
        .setIcon("trash")
        .setTooltip(deleteLabel)
        .onClick(async () => {
          await runRegistryBlockAction(remove, async () => {
            await deleteReferenceFromRow(plugin, item);
            await options.rerender();
          });
        });
    }
  });
}

function currentReferences(plugin: ParaZkPluginContext, rootFile: TFile): RenderableReference[] {
  return readReferenceItems(referenceContext(plugin), rootFile).map((reference, index) => ({
    rootFile,
    index,
    reference
  }));
}

function referenceItemKey(item: RenderableReference): string {
  return item.reference.link;
}

async function insertReferenceFromEditor(
  plugin: ParaZkPluginContext,
  rootFile: TFile,
  value: ReferenceEditValue
): Promise<void> {
  await insertReferenceItem(referenceContext(plugin), rootFile, {
    link: value.link,
    ...(value.label.trim() ? { label: value.label } : {}),
    ...(value.note.trim() ? { note: value.note } : {})
  });
}

async function updateReferenceFromEditor(
  plugin: ParaZkPluginContext,
  item: RenderableReference,
  value: ReferenceEditValue
): Promise<void> {
  await queueRegistryFileWrite(item.rootFile, async () => {
    const workflow = referenceContext(plugin);
    const index = currentReferenceIndex(
      workflow,
      item.rootFile,
      item.reference.link,
      referenceGoneMessage(plugin)
    );
    await updateReferenceItem(workflow, item.rootFile, index, {
      link: value.link,
      label: value.label,
      note: value.note
    });
  });
}

async function deleteReferenceFromRow(plugin: ParaZkPluginContext, item: RenderableReference): Promise<void> {
  await queueRegistryFileWrite(item.rootFile, async () => {
    const workflow = referenceContext(plugin);
    const index = currentReferenceIndex(
      workflow,
      item.rootFile,
      item.reference.link,
      referenceGoneMessage(plugin)
    );
    await deleteReferenceItem(workflow, item.rootFile, index);
  });
}

async function persistReferenceOrder(
  plugin: ParaZkPluginContext,
  rootFile: TFile,
  renderedLinks: string[],
  nextLinks: string[]
): Promise<void> {
  const workflow = referenceContext(plugin);
  const currentLinks = readReferenceItems(workflow, rootFile).map((item) => item.link);
  const goneMessage = referenceGoneMessage(plugin);
  assertSameReferenceLinkSet(renderedLinks, currentLinks, goneMessage);
  assertSameReferenceLinkSet(renderedLinks, nextLinks, goneMessage);
  await reorderReferenceItems(workflow, rootFile, nextLinks);
}

function currentReferenceIndex(
  workflow: WorkflowContext,
  rootFile: TFile,
  link: string,
  goneMessage: string
): number {
  const matches = readReferenceItems(workflow, rootFile)
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.link === link);
  if (matches.length !== 1) throw new Error(goneMessage);
  return matches[0].index;
}

function assertSameReferenceLinkSet(left: string[], right: string[], goneMessage: string): void {
  if (left.length !== right.length) throw new Error(goneMessage);
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size !== left.length || rightSet.size !== right.length) throw new Error(goneMessage);
  for (const link of leftSet) {
    if (!rightSet.has(link)) throw new Error(goneMessage);
  }
}

function referenceContext(plugin: ParaZkPluginContext): WorkflowContext {
  return {
    app: plugin.app,
    settings: plugin.settings
  };
}

function renderReferenceError(el: HTMLElement, error: unknown): void {
  renderRegistryBlockError(el, error, {
    blockClass: "para-zk-references",
    emptyClass: "para-zk-reference-empty"
  });
}

class ReferenceEditModal extends Modal {
  private value: ReferenceEditValue;
  private saving = false;

  constructor(
    private readonly plugin: ParaZkPluginContext,
    private readonly heading: string,
    value: ReferenceEditValue,
    private readonly save: (value: ReferenceEditValue) => Promise<void>
  ) {
    super(plugin.app);
    this.value = { ...value };
  }

  onOpen(): void {
    const labels = localePack(this.plugin.settings.locale).labels;
    const linkLabel = labelValue(labels.referenceLinkPlaceholder, "Reference link");
    const labelLabel = labelValue(labels.referenceLabelPlaceholder, "Label");
    const noteLabel = labelValue(labels.referenceNotePlaceholder, "Note");
    this.contentEl.empty();
    this.contentEl.addClass("para-zk-reference-edit-modal");
    this.contentEl.createEl("h2", { text: this.heading });

    new Setting(this.contentEl)
      .setName(linkLabel)
      .addText((text) => {
        text
          .setPlaceholder(linkLabel)
          .setValue(this.value.link)
          .onChange((value) => {
            this.value.link = value;
          });
        text.inputEl.addClass("para-zk-reference-edit-link");
      });

    new Setting(this.contentEl)
      .setName(labelLabel)
      .addText((text) => {
        text
          .setPlaceholder(labelLabel)
          .setValue(this.value.label)
          .onChange((value) => {
            this.value.label = value;
          });
        text.inputEl.addClass("para-zk-reference-edit-label");
      });

    new Setting(this.contentEl)
      .setName(noteLabel)
      .addTextArea((text) => {
        text
          .setPlaceholder(noteLabel)
          .setValue(this.value.note)
          .onChange((value) => {
            this.value.note = value;
          });
        text.inputEl.addClass("para-zk-reference-edit-note");
      });

    new Setting(this.contentEl)
      .addButton((button) => {
        button
          .setButtonText(labels.confirm)
          .setCta()
          .onClick(() => {
            void this.submit();
          });
      })
      .addButton((button) => {
        button
          .setButtonText(labels.cancel)
          .onClick(() => this.close());
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async submit(): Promise<void> {
    if (this.saving) return;
    const labels = localePack(this.plugin.settings.locale).labels;
    const link = this.value.link.trim();
    if (!link) {
      new Notice(labelValue(labels.referenceLinkPlaceholder, "Reference link"));
      return;
    }

    this.saving = true;
    try {
      await this.save({
        link,
        label: this.value.label,
        note: this.value.note
      });
      this.close();
    } catch (error) {
      new Notice(registryErrorMessage(error));
    } finally {
      this.saving = false;
    }
  }
}

async function openReferenceLink(
  plugin: ParaZkPluginContext,
  reference: ReferenceRead,
  sourcePath: string
): Promise<void> {
  if (isExternalHref(reference.link)) {
    window.open(reference.link, "_blank", "noopener");
    return;
  }
  await plugin.app.workspace.openLinkText(referenceOpenText(reference), sourcePath);
}

function referenceHref(reference: ReferenceRead): string {
  return isExternalHref(reference.link) ? reference.link : "#";
}

function referenceOpenText(reference: ReferenceRead): string {
  return wikiTarget(reference.link) ?? reference.link;
}

function referenceTargetHint(reference: ReferenceRead): string {
  return reference.path ?? reference.target ?? reference.link;
}

function referenceDisplayLabel(reference: ReferenceRead): string {
  if (reference.label) return reference.label;
  if (reference.kind === "url") return reference.target ?? reference.link;

  const target = reference.path ?? reference.target ?? wikiTarget(reference.link) ?? reference.link;
  const base = stripObsidianSubpath(target);
  return pathBasenameWithoutExtension(base) || target;
}

function wikiTarget(link: string): string | undefined {
  const match = link.trim().match(/^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/);
  const target = match?.[1]?.trim();
  return target || undefined;
}

function stripObsidianSubpath(value: string): string {
  const index = value.indexOf("#");
  return index === -1 ? value : value.slice(0, index);
}

function pathBasenameWithoutExtension(path: string): string {
  const last = path.split("/").filter(Boolean).pop() ?? path;
  return last.replace(/\.md$/i, "");
}

function isExternalHref(link: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(link);
}

function referenceSummaryText(items: RenderableReference[], labels: Record<string, string>): string {
  return `${items.length} ${labelValue(labels.references, "References")}`;
}

function referenceGoneMessage(plugin: ParaZkPluginContext): string {
  return labelValue(localePack(plugin.settings.locale).labels.referenceGone, REFERENCE_GONE_MESSAGE);
}

function labelValue(value: string | undefined, fallback: string): string {
  return value?.trim() ? value : fallback;
}

function beginReferenceBlockRender(el: HTMLElement, args: ReferenceBlockArgs): ReferenceBlockState {
  return beginRegistryBlockRender(referenceBlockStates, el, args, () => ({
    toolbar: {},
    generation: 0,
    items: [],
    visible: []
  }));
}

function isCurrentReferenceBlockGeneration(el: HTMLElement, generation: number): boolean {
  return isCurrentRegistryBlockGeneration(referenceBlockStates, el, generation);
}

function parseReferenceBlockArgs(source: string): ReferenceBlockArgs {
  const raw = parseCodeBlockKeyValues(source);
  return {
    root: raw.root?.trim() || "current"
  };
}

function parseCodeBlockKeyValues(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/);
    if (match) result[match[1]] = match[2];
  }
  return result;
}
