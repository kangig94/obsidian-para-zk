import {
  AbstractInputSuggest,
  ButtonComponent,
  MarkdownRenderChild,
  Modal,
  Notice,
  Setting,
  TFile,
  stripHeading,
  stripHeadingForLink,
  type MarkdownPostProcessorContext
} from "obsidian";
import { localePack } from "../i18n";
import type { ParaZkPluginContext } from "../plugin-interface";
import { workflowContext } from "../vault/host";
import {
  canonicalWikiLink,
  createResource,
  deleteReferenceItem,
  insertReferenceItem,
  isExternalReference,
  parseWikiLink,
  readReferenceItemsFresh,
  reorderReferenceItems,
  splitObsidianSubpath,
  updateReferenceItem,
  type ReferenceRead,
  type WorkflowContext
} from "../workflows";
import { promptText } from "./prompts";
import {
  beginRegistryBlockRender,
  canRegistryDragReorder,
  createRegistryDragReorder,
  isCurrentRegistryBlockGeneration,
  queueRegistryFileWrite,
  registryErrorMessage,
  renderRegistryBlockError,
  renderRegistryRow,
  runRegistryBlockAction,
  type RegistryBlockState,
  type RegistryDragOptions
} from "./registry-block";
import {
  renderBlockEmpty,
  renderBlockShell,
  renderShellAction
} from "./block-shell";
import { parseCodeBlockKeyValues } from "./code-block-args";
import { referenceTargetHint, referenceTitle, renderReferenceAnchor } from "./reference-link";

type ReferenceBlockArgs = {
  root: "current" | string;
  title?: string;
};

type ReferenceToolbarState = Record<string, never>;

type ReferenceBlockState = RegistryBlockState<ReferenceToolbarState, RenderableReference>;

type RenderableReference = {
  rootFile: TFile;
  index: number;
  reference: ReferenceRead;
};

type ReferenceEditValue = {
  target: string;
  anchor: string;
  description: string;
  originalLink?: string;
  prefilledTarget?: string;
  prefilledAnchor?: string;
};

type ReferenceEditModalOptions = {
  suppressInitialTargetFocus?: boolean;
};

type ReferenceAnchorSuggestion = {
  kind: "heading" | "block";
  value: string;
  label: string;
  detail: string;
  line: number;
  level?: number;
  searchText: string;
};

type ReferenceTargetSuggestion = {
  file: TFile;
  alias?: string;
};

const REFERENCE_GONE_MESSAGE = "reference no longer present — re-render";
const REFERENCE_RERENDER_DELAY_MS = 120;
const referenceBlockStates = new WeakMap<HTMLElement, ReferenceBlockState>();

export function registerReferenceRenderers(plugin: ParaZkPluginContext): void {
  plugin.registerMarkdownCodeBlockProcessor("para-zk-references", (source, el, ctx) => {
    ctx.addChild(new ReferenceBlockRenderChild(plugin, source, el, ctx));
  });
}

// References render from the host note's frontmatter, so a change made outside this
// block — reference updates / create-resource from the CLI, MCP, or another view — must
// re-render it; otherwise the list only refreshed when the note was reopened. Mirrors
// the vault-event subscription the retro-summary and dataview renderers already use.
class ReferenceBlockRenderChild extends MarkdownRenderChild {
  private renderTimer: number | undefined;
  private currentSourcePath: string | undefined;

  constructor(
    private readonly plugin: ParaZkPluginContext,
    private readonly source: string,
    containerEl: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ) {
    super(containerEl);
    this.currentSourcePath = ctx.sourcePath;
  }

  onload(): void {
    void this.render();
    this.registerEvent(this.plugin.app.vault.on("modify", (file) => this.onVaultFile(file)));
    this.registerEvent(this.plugin.app.vault.on("delete", (file) => this.onVaultFile(file)));
    this.registerEvent(this.plugin.app.vault.on("rename", (file, oldPath) => this.onVaultFile(file, oldPath)));
  }

  onunload(): void {
    if (this.renderTimer !== undefined) window.clearTimeout(this.renderTimer);
    this.renderTimer = undefined;
  }

  private onVaultFile(file: unknown, oldPath?: string): void {
    if (!(file instanceof TFile)) return;
    if (oldPath !== undefined && oldPath === this.currentSourcePath) {
      this.currentSourcePath = file.path;
      this.scheduleRender();
      return;
    }
    if (file.path !== this.currentSourcePath) return;
    this.scheduleRender();
  }

  private scheduleRender(): void {
    if (this.renderTimer !== undefined) window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = undefined;
      void this.render();
    }, REFERENCE_RERENDER_DELAY_MS);
  }

  private render(): Promise<void> {
    return renderReferenceBlock(this.plugin, this.source, this.containerEl, this.currentSourcePath)
      .catch((error: unknown) => renderReferenceError(this.containerEl, error));
  }
}

async function renderReferenceBlock(
  plugin: ParaZkPluginContext,
  source: string,
  el: HTMLElement,
  sourcePath: string | undefined
): Promise<void> {
  const args = parseReferenceBlockArgs(source);
  const blockState = beginReferenceBlockRender(el, args);
  const generation = blockState.generation;
  el.empty();

  try {
    if (args.root !== "current") {
      throw new Error("PARA-ZK references block only supports root: current.");
    }

    const labels = localePack(plugin.settings.locale).labels;
    const rootFile = sourcePath ? plugin.app.vault.getFileByPath(sourcePath) ?? undefined : undefined;
    if (!(rootFile instanceof TFile)) {
      renderBlockEmpty(
        renderBlockShell(el, { kind: "references", title: args.title }).body,
        labelValue(labels.referenceEmpty, "No references.")
      );
      return;
    }

    const items = await currentReferences(plugin, rootFile);
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
        rerender: () => renderReferenceBlock(plugin, source, el, sourcePath)
      })
      : undefined;

    const body = renderReferenceShell(plugin, el, {
      rootFile,
      title: args.title,
      items,
      rerender: () => renderReferenceBlock(plugin, source, el, sourcePath)
    });

    if (items.length === 0) {
      renderBlockEmpty(body, labelValue(labels.referenceEmpty, "No references."));
      return;
    }

    const list = body.createDiv({ cls: "para-zk-block__list" });
    for (const item of items) {
      renderReferenceRow(plugin, list, item, {
        blockState,
        sourcePath,
        drag,
        rerender: () => renderReferenceBlock(plugin, source, el, sourcePath)
      });
    }
  } catch (error) {
    if (isCurrentReferenceBlockGeneration(el, generation)) renderReferenceError(el, error);
  }
}

function renderReferenceShell(
  plugin: ParaZkPluginContext,
  el: HTMLElement,
  options: {
    rootFile: TFile;
    title?: string;
    items: RenderableReference[];
    rerender: () => Promise<void>;
  }
): HTMLElement {
  const labels = localePack(plugin.settings.locale).labels;
  return renderBlockShell(el, {
    kind: "references",
    title: options.title,
    summary: referenceSummaryText(options.items, labels),
    renderActions: (actions) => {
      const addLabel = labelValue(labels.referenceAdd, labelValue(labels.addReference, "Add reference"));
      renderShellAction(actions, {
        label: addLabel,
        icon: "plus",
        cta: true,
        variant: "add",
        onClick: () => {
          new ReferenceEditModal(
            plugin,
            addLabel,
            options.rootFile.path,
            { target: "", anchor: "", description: "" },
            async (value) => {
              await queueRegistryFileWrite(
                options.rootFile,
                () => insertReferenceFromEditor(plugin, options.rootFile, value)
              );
              await options.rerender();
            }
          ).open();
        }
      });

      const createResourceLabel = labelValue(labels.createResource, "Create resource");
      renderShellAction(actions, {
        label: createResourceLabel,
        icon: "file-plus",
        cta: true,
        variant: "create-resource",
        onClick: async (createResourceButtonEl) => {
          await runRegistryBlockAction(createResourceButtonEl, async () => {
            const title = await promptText(
              plugin.app,
              labelValue(labels.createResourceCommandName, createResourceLabel),
              labelValue(labels.promptResourceTitle, "Resource title"),
              "",
              labels.confirm,
              labels.cancel
            );
            if (!title) return;

            await queueRegistryFileWrite(
              options.rootFile,
              () => createResource(workflowContext(plugin), {
                title,
                sourcePath: options.rootFile.path,
                linkToSource: true,
                open: true
              })
            );
            await options.rerender();
          });
        }
      });
    }
  }).body;
}

function renderReferenceRow(
  plugin: ParaZkPluginContext,
  list: HTMLElement,
  item: RenderableReference,
  options: {
    blockState: ReferenceBlockState;
    sourcePath: string | undefined;
    drag?: RegistryDragOptions;
    rerender: () => Promise<void>;
  }
): void {
  const labels = localePack(plugin.settings.locale).labels;
  renderRegistryRow(list, item, {
    dataset: {
      referenceIndex: String(item.index),
      referenceLink: item.reference.link,
      referenceKind: item.reference.kind
    },
    drag: options.drag ? {
      state: options.blockState,
      itemKey: referenceItemKey,
      label: "Reorder reference",
      drag: options.drag
    } : undefined,
    renderBody: (row) => {
      const body = row.createDiv({ cls: "para-zk-block__rowbody" });
      renderReferenceAnchor(plugin, body, item.reference, {
        text: referenceTitle(item.reference),
        title: referenceTargetHint(item.reference),
        cls: "para-zk-reference-link",
        hoverParent: body,
        sourcePath: options.sourcePath ?? ""
      });
      const description = item.reference.description;
      if (description) {
        body.createDiv({
          cls: "para-zk-reference-description",
          text: description
        });
      }

      const actions = row.createDiv({ cls: "para-zk-block__rowactions" });
      const editAction = new ButtonComponent(actions);
      const edit = editAction.buttonEl;
      const editLabel = labelValue(labels.referenceEdit, "Edit reference");
      edit.addClass("para-zk-block__action", "is-edit");
      edit.setAttr("aria-label", editLabel);
      editAction
        .setIcon("pencil")
        .setTooltip(editLabel)
        .onClick(() => {
          new ReferenceEditModal(
            plugin,
            editLabel,
            item.rootFile.path,
            referenceEditValue(item.reference),
            async (value) => {
              await updateReferenceFromEditor(plugin, item, value);
              await options.rerender();
            },
            { suppressInitialTargetFocus: true }
          ).open();
        });

      const removeAction = new ButtonComponent(actions);
      const remove = removeAction.buttonEl;
      const deleteLabel = labelValue(labels.referenceDelete, "Delete reference");
      remove.addClass("para-zk-block__action", "is-delete");
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

async function currentReferences(plugin: ParaZkPluginContext, rootFile: TFile): Promise<RenderableReference[]> {
  const items = await readReferenceItemsFresh(workflowContext(plugin), rootFile);
  return items.map((reference, index) => ({
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
  await insertReferenceItem(workflowContext(plugin), rootFile, {
    link: buildReferenceLinkInput(value.target, value.anchor),
    ...(value.description.trim() ? { description: value.description } : {})
  });
}

async function updateReferenceFromEditor(
  plugin: ParaZkPluginContext,
  item: RenderableReference,
  value: ReferenceEditValue
): Promise<void> {
  await queueRegistryFileWrite(item.rootFile, async () => {
    const workflow = workflowContext(plugin);
    const index = await currentReferenceIndex(
      workflow,
      item.rootFile,
      item.reference.link,
      referenceGoneMessage(plugin)
    );
    // When the user left target and anchor untouched, update only the description so the
    // stored link keeps its exact form (passing link would re-canonicalize, e.g. rewriting
    // a short `[[Foo]]` to a full path or a text reference into a wikilink). Rebuild the link
    // only when target/anchor actually changed.
    const linkUnchanged = value.originalLink !== undefined
      && value.target === value.prefilledTarget
      && value.anchor === value.prefilledAnchor;
    await updateReferenceItem(
      workflow,
      item.rootFile,
      index,
      linkUnchanged
        ? { description: value.description }
        : { link: buildReferenceLinkInput(value.target, value.anchor), description: value.description }
    );
  });
}

async function deleteReferenceFromRow(plugin: ParaZkPluginContext, item: RenderableReference): Promise<void> {
  await queueRegistryFileWrite(item.rootFile, async () => {
    const workflow = workflowContext(plugin);
    const index = await currentReferenceIndex(
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
  const workflow = workflowContext(plugin);
  const currentLinks = (await readReferenceItemsFresh(workflow, rootFile)).map((item) => item.link);
  const goneMessage = referenceGoneMessage(plugin);
  assertSameReferenceLinkSet(renderedLinks, currentLinks, goneMessage);
  assertSameReferenceLinkSet(renderedLinks, nextLinks, goneMessage);
  await reorderReferenceItems(workflow, rootFile, nextLinks);
}

async function currentReferenceIndex(
  workflow: WorkflowContext,
  rootFile: TFile,
  link: string,
  goneMessage: string
): Promise<number> {
  const matches = (await readReferenceItemsFresh(workflow, rootFile))
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

function renderReferenceError(el: HTMLElement, error: unknown): void {
  renderRegistryBlockError(el, error, "references");
}

function buildReferenceLinkInput(target: string, anchor: string): string {
  const trimmedTarget = target.trim();
  if (isExternalReference(trimmedTarget)) return trimmedTarget;

  const normalizedAnchor = normalizeReferenceAnchor(anchor);
  const wiki = parseWikiLink(trimmedTarget);
  if (wiki) {
    // Target may arrive pre-wrapped from file suggestions; unwrap before applying anchor changes.
    const split = splitObsidianSubpath(wiki.target);
    const nextTarget = normalizedAnchor ? `${split.base}#${normalizedAnchor}` : wiki.target;
    return canonicalWikiLink(nextTarget, wiki.alias);
  }

  return canonicalWikiLink(normalizedAnchor ? `${trimmedTarget}#${normalizedAnchor}` : trimmedTarget);
}

function referenceEditValue(reference: ReferenceRead): ReferenceEditValue {
  const description = reference.description ?? "";
  if (reference.kind === "url" || reference.kind === "text") {
    return {
      target: reference.link,
      anchor: "",
      description,
      originalLink: reference.link,
      prefilledTarget: reference.link,
      prefilledAnchor: ""
    };
  }

  const innerTarget = parseWikiLink(reference.link)?.target ?? reference.target ?? reference.link;
  const split = splitObsidianSubpath(innerTarget);
  const target = reference.path ?? split.base;
  const anchor = normalizeReferenceAnchor(split.subpath);
  return {
    target,
    anchor,
    description,
    originalLink: reference.link,
    prefilledTarget: target,
    prefilledAnchor: anchor
  };
}

class ReferenceEditModal extends Modal {
  private value: ReferenceEditValue;
  private saving = false;
  private targetSuggest?: ReferenceTargetSuggest;
  private targetInputEl?: HTMLInputElement;
  private anchorSuggest?: ReferenceAnchorSuggest;
  private anchorInputEl?: HTMLInputElement;
  private anchorSuggestions: ReferenceAnchorSuggestion[] = [];
  private anchorLineCache = new Map<string, string[]>();
  private anchorRefreshGeneration = 0;
  private readonly suppressInitialTargetFocus: boolean;

  constructor(
    private readonly plugin: ParaZkPluginContext,
    private readonly heading: string,
    private readonly sourcePath: string,
    value: ReferenceEditValue,
    private readonly save: (value: ReferenceEditValue) => Promise<void>,
    options: ReferenceEditModalOptions = {}
  ) {
    super(plugin.app);
    this.value = {
      ...value,
      prefilledTarget: value.prefilledTarget ?? value.target,
      prefilledAnchor: normalizeReferenceAnchor(value.prefilledAnchor ?? value.anchor)
    };
    this.suppressInitialTargetFocus = options.suppressInitialTargetFocus === true;
  }

  onOpen(): void {
    const labels = localePack(this.plugin.settings.locale).labels;
    const targetLabel = labelValue(labels.referenceTargetPlaceholder, "Path or URL");
    const anchorLabel = labelValue(labels.referenceAnchorPlaceholder, "Section or block (optional)");
    const descriptionLabel = labelValue(labels.referenceDescriptionPlaceholder, "Description");
    this.contentEl.empty();
    this.contentEl.addClass("para-zk-reference-edit-modal");
    this.contentEl.createEl("h2", { text: this.heading });

    new Setting(this.contentEl)
      .setName(targetLabel)
      .addText((text) => {
        text
          .setPlaceholder(targetLabel)
          .setValue(this.value.target)
          .onChange((value) => {
            this.value.target = value;
            void this.refreshAnchorSuggestions();
          });
        text.inputEl.addClass("para-zk-reference-edit-target");
        this.targetInputEl = text.inputEl;
        this.targetSuggest = new ReferenceTargetSuggest(this.plugin, text.inputEl, (file) => {
          this.value.target = text.inputEl.value || file.path;
          void this.refreshAnchorSuggestions();
        });
      });

    new Setting(this.contentEl)
      .setName(anchorLabel)
      .addText((text) => {
        text
          .setPlaceholder(anchorLabel)
          .setValue(this.value.anchor)
          .onChange((value) => {
            if (!text.inputEl.disabled) this.value.anchor = value;
          });
        this.anchorInputEl = text.inputEl;
        text.inputEl.addClass("para-zk-reference-edit-anchor");
        this.anchorSuggest = new ReferenceAnchorSuggest(
          this.plugin,
          text.inputEl,
          () => this.anchorSuggestions,
          (suggestion) => {
            this.value.anchor = suggestion.value;
          }
        );
      });

    new Setting(this.contentEl)
      .setName(descriptionLabel)
      .addTextArea((text) => {
        text
          .setPlaceholder(descriptionLabel)
          .setValue(this.value.description)
          .onChange((value) => {
            this.value.description = value;
          });
        text.inputEl.addClass("para-zk-reference-edit-description");
      });

    void this.refreshAnchorSuggestions();

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

    this.suppressInitialTargetAutoFocus();
  }

  onClose(): void {
    this.anchorRefreshGeneration += 1;
    this.targetSuggest?.close();
    this.anchorSuggest?.close();
    this.targetSuggest = undefined;
    this.targetInputEl = undefined;
    this.anchorSuggest = undefined;
    this.anchorInputEl = undefined;
    this.contentEl.empty();
  }

  private suppressInitialTargetAutoFocus(): void {
    if (!this.suppressInitialTargetFocus || !this.targetInputEl) return;

    this.contentEl.tabIndex = -1;
    window.setTimeout(() => {
      if (!this.targetInputEl || !this.contentEl.isConnected) return;
      if (this.targetInputEl.ownerDocument.activeElement !== this.targetInputEl) return;

      this.targetSuggest?.close();
      this.targetInputEl.blur();
      this.contentEl.focus();
    }, 0);
  }

  private async submit(): Promise<void> {
    if (this.saving) return;
    const labels = localePack(this.plugin.settings.locale).labels;
    const target = this.value.target.trim();
    if (!target) {
      new Notice(labelValue(labels.referenceTargetPlaceholder, "Path or URL"));
      return;
    }

    this.saving = true;
    try {
      const anchor = normalizeReferenceAnchor(this.value.anchor);
      const saveValue: ReferenceEditValue = {
        target,
        anchor,
        description: this.value.description,
        prefilledTarget: this.value.prefilledTarget,
        prefilledAnchor: this.value.prefilledAnchor
      };
      if (
        this.value.originalLink !== undefined
        && target === this.value.prefilledTarget
        && anchor === this.value.prefilledAnchor
      ) {
        saveValue.originalLink = this.value.originalLink;
      }
      await this.save(saveValue);
      this.close();
    } catch (error) {
      new Notice(registryErrorMessage(error));
    } finally {
      this.saving = false;
    }
  }

  private async refreshAnchorSuggestions(): Promise<void> {
    const generation = ++this.anchorRefreshGeneration;
    const file = this.resolveAnchorTargetFile(this.value.target);
    if (!isMarkdownFile(file)) {
      this.anchorSuggestions = [];
      this.clearAnchorValue();
      this.setAnchorInputEnabled(false);
      return;
    }

    try {
      const suggestions = await this.anchorSuggestionsForFile(file);
      if (generation !== this.anchorRefreshGeneration) return;
      this.anchorSuggestions = suggestions;
      this.dropUnresolvedAnchor(suggestions);
      this.setAnchorInputEnabled(true);
    } catch (error) {
      if (generation !== this.anchorRefreshGeneration) return;
      this.anchorSuggestions = [];
      this.setAnchorInputEnabled(false);
      new Notice(registryErrorMessage(error));
    }
  }

  private clearAnchorValue(): void {
    this.value.anchor = "";
    if (this.anchorInputEl) this.anchorInputEl.value = "";
  }

  private dropUnresolvedAnchor(suggestions: ReferenceAnchorSuggestion[]): void {
    const anchor = normalizeReferenceAnchor(this.value.anchor);
    if (!anchor) return;
    if (suggestions.some((suggestion) => normalizeReferenceAnchor(suggestion.value) === anchor)) return;
    this.clearAnchorValue();
  }

  private setAnchorInputEnabled(enabled: boolean): void {
    if (!this.anchorInputEl) return;
    this.anchorInputEl.disabled = !enabled;
    this.anchorInputEl.classList.toggle("is-disabled", !enabled);
    if (enabled) {
      this.anchorInputEl.value = this.value.anchor;
    }
  }

  private resolveAnchorTargetFile(targetValue: string): TFile | undefined {
    const target = parseWikiLink(targetValue.trim())?.target ?? targetValue.trim();
    if (!target || isExternalReference(target)) return undefined;

    const linked = this.plugin.app.metadataCache.getFirstLinkpathDest(target, this.sourcePath);
    if (linked instanceof TFile) return linked;

    if (!looksLikeVaultPath(target)) return undefined;
    const file = this.plugin.app.vault.getAbstractFileByPath(splitObsidianSubpath(target).base.replace(/\\/g, "/"));
    return file instanceof TFile ? file : undefined;
  }

  private async anchorSuggestionsForFile(file: TFile): Promise<ReferenceAnchorSuggestion[]> {
    const cache = this.plugin.app.metadataCache.getFileCache(file);
    if (!cache) return [];

    const blocks = Object.entries(cache.blocks ?? {});
    const lines = blocks.length > 0 ? await this.cachedTargetLines(file) : [];
    const suggestions: ReferenceAnchorSuggestion[] = [];

    for (const heading of cache.headings ?? []) {
      // stripHeadingForLink drops link-illegal chars like `|`, but keeps `[`/`]`/backtick.
      // A heading that still contains those cannot be stored as a valid
      // `[[file#anchor]]` wikilink, so skip it.
      const value = stripHeadingForLink(heading.heading);
      if (/[[\]`]/.test(value)) continue;
      suggestions.push({
        kind: "heading",
        value,
        label: stripHeading(heading.heading),
        detail: `H${heading.level}`,
        line: heading.position.start.line,
        level: heading.level,
        searchText: stripHeading(heading.heading)
      });
    }

    for (const [id, block] of blocks) {
      const snippet = blockLineSnippet(lines, block.position.start.line);
      suggestions.push({
        kind: "block",
        value: `^${id}`,
        label: `^${id}`,
        detail: snippet,
        line: block.position.start.line,
        searchText: `^${id} ${snippet}`
      });
    }

    return suggestions.sort((left, right) => {
      if (left.line !== right.line) return left.line - right.line;
      return left.kind.localeCompare(right.kind);
    });
  }

  private async cachedTargetLines(file: TFile): Promise<string[]> {
    const cached = this.anchorLineCache.get(file.path);
    if (cached) return cached;

    const lines = (await this.plugin.app.vault.cachedRead(file)).split(/\r?\n/);
    this.anchorLineCache.set(file.path, lines);
    return lines;
  }
}

class ReferenceTargetSuggest extends AbstractInputSuggest<ReferenceTargetSuggestion> {
  constructor(
    private readonly plugin: ParaZkPluginContext,
    inputEl: HTMLInputElement,
    private readonly onSelectFile: (file: TFile) => void
  ) {
    super(plugin.app, inputEl);
    this.limit = 20;
  }

  protected getSuggestions(query: string): ReferenceTargetSuggestion[] {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return [];
    const files = this.plugin.app.vault.getFiles();
    const matches = new Map<string, ReferenceTargetSuggestion>();
    for (const file of files) {
      const alias = this.matchingAlias(file, normalized);
      const pathMatches = file.path.toLocaleLowerCase().includes(normalized)
        || file.basename.toLocaleLowerCase().includes(normalized);
      if (!pathMatches && !alias) continue;

      const suggestion: ReferenceTargetSuggestion = {
        file,
        ...(alias ? { alias } : {})
      };
      const existing = matches.get(file.path);
      if (!existing || (!existing.alias && suggestion.alias)) {
        matches.set(file.path, suggestion);
      }
    }
    return Array.from(matches.values()).slice(0, 20);
  }

  renderSuggestion(suggestion: ReferenceTargetSuggestion, el: HTMLElement): void {
    el.addClass("para-zk-reference-suggestion");
    const { file, alias } = suggestion;
    el.createDiv({ cls: "para-zk-reference-suggestion-title", text: file.basename });
    el.createDiv({ cls: "para-zk-reference-suggestion-path", text: file.path });
    if (alias) {
      const labels = localePack(this.plugin.settings.locale).labels;
      el.createDiv({
        cls: "para-zk-reference-suggestion-detail",
        text: `${labelValue(labels.aliases, "Aliases")}: ${alias}`
      });
    }
  }

  selectSuggestion(suggestion: ReferenceTargetSuggestion, _evt: MouseEvent | KeyboardEvent): void {
    const { file, alias } = suggestion;
    this.setValue(alias ? canonicalWikiLink(file.path, alias) : file.path);
    this.onSelectFile(file);
    this.close();
  }

  private matchingAlias(file: TFile, normalizedQuery: string): string | undefined {
    return frontmatterAliases(this.plugin.app.metadataCache.getFileCache(file)?.frontmatter?.aliases)
      .find((alias) => alias.toLocaleLowerCase().includes(normalizedQuery));
  }
}

function frontmatterAliases(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

class ReferenceAnchorSuggest extends AbstractInputSuggest<ReferenceAnchorSuggestion> {
  constructor(
    plugin: ParaZkPluginContext,
    inputEl: HTMLInputElement,
    // NOTE: do not name this `suggestions` — that shadows an internal member of the
    // AbstractInputSuggest/PopoverSuggest base used to render the popup, which silently
    // breaks rendering (getSuggestions runs but renderSuggestion is never called).
    private readonly getItems: () => ReferenceAnchorSuggestion[],
    private readonly onSelectAnchor: (suggestion: ReferenceAnchorSuggestion) => void
  ) {
    super(plugin.app, inputEl);
    this.limit = 20;
  }

  protected getSuggestions(query: string): ReferenceAnchorSuggestion[] {
    const normalized = normalizeReferenceAnchor(query).toLocaleLowerCase();
    const matches = normalized
      ? this.getItems().filter((suggestion) => suggestion.searchText.toLocaleLowerCase().includes(normalized))
      : this.getItems();
    return matches.slice(0, 20);
  }

  renderSuggestion(suggestion: ReferenceAnchorSuggestion, el: HTMLElement): void {
    el.addClass("para-zk-reference-suggestion");
    const title = el.createDiv({ cls: "para-zk-reference-suggestion-title", text: suggestion.label });
    if (suggestion.kind === "heading") {
      title.addClass("para-zk-reference-suggestion-heading");
      title.style.paddingLeft = `${Math.max(0, (suggestion.level ?? 1) - 1) * 10}px`;
    }
    if (suggestion.detail) {
      el.createDiv({ cls: "para-zk-reference-suggestion-detail", text: suggestion.detail });
    }
  }

  selectSuggestion(suggestion: ReferenceAnchorSuggestion, _evt: MouseEvent | KeyboardEvent): void {
    this.setValue(suggestion.value);
    this.onSelectAnchor(suggestion);
    this.close();
  }
}

function normalizeReferenceAnchor(anchor: string): string {
  return anchor.trim().replace(/^#/, "").trim();
}

function isMarkdownFile(file: TFile | undefined): file is TFile {
  return file instanceof TFile && file.extension.toLocaleLowerCase() === "md";
}

function looksLikeVaultPath(value: string): boolean {
  return value.includes("/") || value.toLocaleLowerCase().endsWith(".md");
}

function blockLineSnippet(lines: string[], line: number): string {
  const text = (lines[line] ?? "").trim().replace(/\s+/g, " ");
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
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
    root: raw.root?.trim() || "current",
    title: raw.title?.trim() || undefined
  };
}
