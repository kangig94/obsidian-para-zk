import {
  ButtonComponent,
  DropdownComponent,
  Modal,
  Notice,
  Setting,
  TFile,
  type MarkdownPostProcessorContext
} from "obsidian";
import { localePack } from "../i18n";
import type { ParaZkPluginContext } from "../plugin-interface";
import { localDate } from "../time";
import {
  cycleTaskCheckbox,
  deleteRootTask,
  insertRootTask,
  readAllTaskItems,
  readRootTaskMap,
  reorderRootTasks,
  setRootTaskField,
  type TaskRead,
  type WorkflowContext
} from "../workflows";
import { promptText } from "./prompts";

type TaskBlockArgs = {
  root: "current" | "all";
  checkbox?: "open" | "done" | string;
  due?: "today" | "upcoming7" | "upcoming30";
  limit?: number;
  order?: TaskOrder;
};

type TaskOrder = "smart" | "manual" | "due" | "priority" | "status" | "name";
type TaskStatusFilter = "all" | "open" | "done";
type TaskDueFilter = "any" | "today" | "upcoming7" | "upcoming30" | "none";
type TaskPriorityFilter = "any" | "high";

type TaskToolbarState = {
  order: TaskOrder;
  status: TaskStatusFilter;
  due: TaskDueFilter;
  priority: TaskPriorityFilter;
};

type TaskBlockState = {
  toolbar: TaskToolbarState;
  generation: number;
  checkboxMutationSerial: number;
  pendingCheckboxTimer?: number;
  draggingTaskId?: string;
  summaryEl?: HTMLElement;
  items: RenderableTask[];
  visible: RenderableTask[];
};

type RenderableTask = {
  rootFile: TFile;
  rootTitle: string;
  id: string;
  task: TaskRead;
};

type TaskMetaChip = {
  kind: string;
  label: string;
};

type TaskEditValue = Pick<TaskRead, "name" | "priority" | "due" | "scheduled" | "start">;

type TaskDragOptions = {
  onDrop: (draggedId: string, targetId: string, placeAfter: boolean) => Promise<void>;
};

const CHECKBOX_RECONCILE_DELAY_MS = 1200;
const taskBlockStates = new WeakMap<HTMLElement, TaskBlockState>();
const taskWriteQueues = new Map<string, Promise<unknown>>();

export function registerTaskRenderers(plugin: ParaZkPluginContext): void {
  plugin.registerMarkdownCodeBlockProcessor("para-zk-tasks", (source, el, ctx) => {
    void renderTaskBlock(plugin, source, el, ctx).catch((error: unknown) => renderTaskError(el, error));
  });
}

async function renderTaskBlock(
  plugin: ParaZkPluginContext,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
): Promise<void> {
  const args = parseTaskBlockArgs(source);
  const blockState = beginTaskBlockRender(el, args);
  if (args.root === "all" && blockState.toolbar.order === "manual") blockState.toolbar.order = "smart";
  const generation = blockState.generation;
  el.empty();
  el.addClass("para-zk-tasks");

  try {
    const t = localePack(plugin.settings.locale);
    const rootFile = args.root === "current"
      ? plugin.app.vault.getFileByPath(ctx.sourcePath) ?? undefined
      : undefined;

    if (args.root === "current" && !(rootFile instanceof TFile)) {
      el.createDiv({ cls: "para-zk-task-empty", text: t.labels.taskRootUnavailable });
      return;
    }

    const items = args.root === "current" && rootFile
      ? await currentRootTasks(plugin, rootFile)
      : await allRootTasks(plugin);
    if (!isCurrentTaskBlockGeneration(el, generation)) return;

    const visible = filteredTasks(items, args, blockState.toolbar);
    blockState.items = items;
    blockState.visible = visible;
    const canReorder = canDragReorder(args, blockState.toolbar, items, visible);

    renderTaskToolbar(plugin, el, source, ctx, {
      args,
      rootFile,
      items,
      visible,
      blockState
    });

    if (visible.length === 0) {
      el.createDiv({ cls: "para-zk-task-empty", text: t.labels.noTasks });
      return;
    }

    const list = el.createDiv({ cls: "para-zk-task-list" });
    for (const item of visible) {
      renderTaskRow(plugin, list, item, {
        blockState,
        source,
        ctx,
        el,
        showRoot: args.root === "all",
        drag: canReorder && rootFile ? {
          onDrop: async (draggedId, targetId, placeAfter) => {
            const nextIds = reorderedTaskIds(blockState.visible, draggedId, targetId, placeAfter);
            if (!nextIds) return;
            await queueRootTaskWrite(
              rootFile,
              () => reorderRootTasks(taskContext(plugin), rootFile, nextIds)
            );
            await renderTaskBlock(plugin, source, el, ctx);
          }
        } : undefined,
        rerender: () => renderTaskBlock(plugin, source, el, ctx)
      });
    }
  } catch (error) {
    if (isCurrentTaskBlockGeneration(el, generation)) renderTaskError(el, error);
  }
}

function renderTaskToolbar(
  plugin: ParaZkPluginContext,
  el: HTMLElement,
  source: string,
  ctx: MarkdownPostProcessorContext,
  options: {
    args: TaskBlockArgs;
    rootFile?: TFile;
    items: RenderableTask[];
    visible: RenderableTask[];
    blockState: TaskBlockState;
  }
): void {
  const labels = localePack(plugin.settings.locale).labels;
  const toolbar = el.createDiv({ cls: "para-zk-task-toolbar" });
  const heading = toolbar.createDiv({ cls: "para-zk-task-toolbar-heading" });
  options.blockState.summaryEl = heading.createDiv({
    cls: "para-zk-task-toolbar-summary",
    text: taskSummaryText(options.items, options.visible, labels)
  });

  const controls = toolbar.createDiv({ cls: "para-zk-task-toolbar-controls" });
  const rootFile = options.rootFile;
  if (options.args.root === "current" && rootFile) {
    const add = new ButtonComponent(controls);
    const addButton = add.buttonEl;
    addButton.addClass("para-zk-task-toolbar-button", "para-zk-task-add");
    addButton.setAttr("aria-label", labels.addTask);
    add
      .setIcon("plus")
      .setButtonText(labels.addTask)
      .setTooltip(labels.addTask)
      .onClick(async () => {
        await runTaskAction(plugin, addButton, async () => {
          const name = await promptText(
            plugin.app,
            labels.tasks,
            labels.title,
            "",
            labels.confirm,
            labels.cancel
          );
          if (!name) return;
          await queueRootTaskWrite(rootFile, () => insertRootTask(taskContext(plugin), rootFile, { name }));
          await renderTaskBlock(plugin, source, el, ctx);
        });
      });
  }

  renderToolbarSelect(controls, {
    label: labels.taskOrder,
    value: options.blockState.toolbar.order,
    options: taskOrderOptions(labels, options.args.root === "current"),
    onChange: (value) => {
      options.blockState.toolbar.order = value as TaskOrder;
      void renderTaskBlock(plugin, source, el, ctx);
    }
  });
  renderToolbarSelect(controls, {
    label: labels.status,
    value: options.blockState.toolbar.status,
    options: taskStatusOptions(labels),
    onChange: (value) => {
      options.blockState.toolbar.status = value as TaskStatusFilter;
      void renderTaskBlock(plugin, source, el, ctx);
    }
  });
  renderToolbarSelect(controls, {
    label: labels.priority,
    value: options.blockState.toolbar.priority,
    options: taskPriorityOptions(labels),
    onChange: (value) => {
      options.blockState.toolbar.priority = value as TaskPriorityFilter;
      void renderTaskBlock(plugin, source, el, ctx);
    }
  });
}

function renderToolbarSelect(
  parent: HTMLElement,
  options: {
    label: string;
    value: string;
    options: Array<{ value: string; label: string }>;
    onChange: (value: string) => void;
  }
): void {
  const wrap = parent.createDiv({ cls: "para-zk-task-toolbar-select" });
  const dropdown = new DropdownComponent(wrap);
  dropdown.selectEl.setAttr("aria-label", options.label);
  dropdown.selectEl.setAttr("title", options.label);
  for (const item of options.options) {
    dropdown.addOption(item.value, item.label);
  }
  dropdown
    .setValue(options.value)
    .onChange(options.onChange);
}

async function currentRootTasks(plugin: ParaZkPluginContext, rootFile: TFile): Promise<RenderableTask[]> {
  const taskMap = await readRootTaskMap({ app: plugin.app, settings: plugin.settings }, rootFile);
  return Object.entries(taskMap).map(([id, task]) => ({
    rootFile,
    rootTitle: rootFile.basename,
    id,
    task
  }));
}

async function allRootTasks(plugin: ParaZkPluginContext): Promise<RenderableTask[]> {
  const items = await readAllTaskItems({ app: plugin.app, settings: plugin.settings });
  return items.flatMap((item) => {
    const rootFile = plugin.app.vault.getFileByPath(item.rootPath);
    if (!(rootFile instanceof TFile)) return [];
    return [{
      rootFile,
      rootTitle: item.rootTitle,
      id: item.id,
      task: item.task
    }];
  });
}

function attachTaskDragHandle(
  plugin: ParaZkPluginContext,
  list: HTMLElement,
  row: HTMLElement,
  item: RenderableTask,
  state: TaskBlockState,
  drag: TaskDragOptions
): void {
  const labels = localePack(plugin.settings.locale).labels;
  const handle = new ButtonComponent(row);
  const button = handle.buttonEl;
  button.addClass("para-zk-task-drag");
  button.draggable = true;
  button.setAttr("aria-label", labels.reorderTask);
  handle
    .setIcon("grip-vertical")
    .setTooltip(labels.reorderTask);

  button.addEventListener("dragstart", (event) => {
    state.draggingTaskId = item.id;
    row.addClass("is-dragging");
    event.dataTransfer?.setData("text/plain", item.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  });
  button.addEventListener("dragend", () => {
    state.draggingTaskId = undefined;
    cleanupTaskDragMarks(list);
  });

  row.addEventListener("dragover", (event) => {
    const draggedId = state.draggingTaskId;
    if (!draggedId || draggedId === item.id) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    markTaskDropPosition(list, row, isTaskDropAfter(event, row));
  });
  row.addEventListener("dragleave", (event) => {
    if (event.relatedTarget instanceof Node && row.contains(event.relatedTarget)) return;
    row.removeClass("is-drop-before", "is-drop-after");
  });
  row.addEventListener("drop", (event) => {
    const draggedId = state.draggingTaskId ?? event.dataTransfer?.getData("text/plain");
    if (!draggedId || draggedId === item.id) return;
    event.preventDefault();
    const placeAfter = isTaskDropAfter(event, row);
    state.draggingTaskId = undefined;
    cleanupTaskDragMarks(list);
    void drag.onDrop(draggedId, item.id, placeAfter).catch((error: unknown) => {
      new Notice(errorMessage(error));
    });
  });
}

function renderTaskRow(
  plugin: ParaZkPluginContext,
  list: HTMLElement,
  item: RenderableTask,
  options: {
    blockState: TaskBlockState;
    source: string;
    ctx: MarkdownPostProcessorContext;
    el: HTMLElement;
    showRoot: boolean;
    drag?: TaskDragOptions;
    rerender: () => Promise<void>;
  }
): void {
  const row = list.createDiv({ cls: "para-zk-task-row" });
  row.dataset.taskId = item.id;
  if (options.drag) {
    row.addClass("is-reorderable");
    attachTaskDragHandle(plugin, list, row, item, options.blockState, options.drag);
  }

  const checkboxAction = new ButtonComponent(row);
  const checkbox = checkboxAction.buttonEl;
  checkbox.addClass("para-zk-task-checkbox", taskCheckboxClass(item.task.checkbox));
  checkbox.setAttr("aria-label", `Task status ${item.task.checkbox.trim() || "open"}`);
  checkboxAction
    .setButtonText(taskCheckboxText(item.task.checkbox))
    .setTooltip("Cycle task status")
    .onClick(async () => {
      await runTaskAction(plugin, checkbox, async () => {
        const clickGeneration = options.blockState.generation;
        const mutationSerial = options.blockState.checkboxMutationSerial + 1;
        options.blockState.checkboxMutationSerial = mutationSerial;
        cancelPendingCheckboxReconcile(options.blockState);

        const previous = item.task.checkbox;
        const next = cycleTaskCheckbox(previous);
        setRenderableTaskCheckbox(item, checkboxAction, checkbox, next);
        updateTaskSummary(plugin, options.blockState);
        try {
          await queueRootTaskWrite(
            item.rootFile,
            () => setRootTaskField(
              taskContext(plugin),
              item.rootFile,
              item.id,
              "checkbox",
              next
            )
          );
        } catch (error) {
          setRenderableTaskCheckbox(item, checkboxAction, checkbox, previous);
          updateTaskSummary(plugin, options.blockState);
          if (
            options.el.isConnected
            && isCurrentTaskBlockGeneration(options.el, clickGeneration)
            && options.blockState.checkboxMutationSerial === mutationSerial
          ) {
            scheduleCheckboxReconcile(
              plugin,
              options.source,
              options.el,
              options.ctx,
              options.blockState,
              clickGeneration
            );
          }
          throw error;
        }

        if (!options.el.isConnected) return;
        if (!isCurrentTaskBlockGeneration(options.el, clickGeneration)) {
          await renderTaskBlock(plugin, options.source, options.el, options.ctx);
          return;
        }
        if (options.blockState.checkboxMutationSerial !== mutationSerial) return;
        scheduleCheckboxReconcile(plugin, options.source, options.el, options.ctx, options.blockState, clickGeneration);
      });
    });

  const body = row.createDiv({ cls: "para-zk-task-body" });
  body.createDiv({ cls: "para-zk-task-name", text: item.task.name });

  const meta = taskMeta(item.task);
  if (options.showRoot || meta.length > 0) {
    const metaEl = body.createDiv({ cls: "para-zk-task-meta" });
    if (options.showRoot) {
      const rootLink = new ButtonComponent(metaEl);
      rootLink.buttonEl.addClass("para-zk-task-root");
      rootLink
        .setButtonText(item.rootTitle)
        .onClick(async () => {
          await plugin.app.workspace.getLeaf(false).openFile(item.rootFile);
        });
    }
    for (const chip of meta) {
      metaEl.createSpan({
        cls: `para-zk-task-chip para-zk-task-chip-${chip.kind}`,
        text: chip.label
      });
    }
  }

  const actions = row.createDiv({ cls: "para-zk-task-actions" });
  const editAction = new ButtonComponent(actions);
  const edit = editAction.buttonEl;
  edit.addClass("para-zk-task-edit");
  edit.setAttr("aria-label", "Edit task");
  editAction
    .setIcon("pencil")
    .setTooltip("Edit task")
    .onClick(() => {
      new TaskEditModal(plugin, item.task, async (value) => {
        await updateTaskFromEditor(plugin, item, value);
        await options.rerender();
      }).open();
    });

  const removeAction = new ButtonComponent(actions);
  const remove = removeAction.buttonEl;
  remove.addClass("para-zk-task-delete");
  remove.setAttr("aria-label", "Delete task");
  removeAction
    .setIcon("trash")
    .setTooltip("Delete task")
    .onClick(async () => {
      await runTaskAction(plugin, remove, async () => {
        await queueRootTaskWrite(item.rootFile, () => deleteRootTask(taskContext(plugin), item.rootFile, item.id));
        await options.rerender();
      });
    });
}

async function updateTaskFromEditor(plugin: ParaZkPluginContext, item: RenderableTask, value: TaskEditValue): Promise<void> {
  await queueRootTaskWrite(item.rootFile, async () => {
    const fields: Array<keyof TaskEditValue> = ["name", "priority", "due", "scheduled", "start"];
    for (const field of fields) {
      if ((item.task[field] ?? "") === (value[field] ?? "")) continue;
      await setRootTaskField(taskContext(plugin), item.rootFile, item.id, field, value[field] ?? "");
    }
  });
}

function taskContext(plugin: ParaZkPluginContext): WorkflowContext {
  return {
    app: plugin.app,
    settings: plugin.settings
  };
}

async function runTaskAction(plugin: ParaZkPluginContext, button: HTMLButtonElement, action: () => Promise<void>): Promise<void> {
  button.disabled = true;
  try {
    await action();
  } catch (error) {
    new Notice(errorMessage(error));
  } finally {
    button.disabled = false;
  }
}

function renderTaskError(el: HTMLElement, error: unknown): void {
  el.empty();
  el.addClass("para-zk-tasks");
  el.createDiv({ cls: "para-zk-task-empty", text: errorMessage(error) });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class TaskEditModal extends Modal {
  private value: TaskEditValue;
  private saving = false;

  constructor(
    private readonly plugin: ParaZkPluginContext,
    task: TaskRead,
    private readonly save: (value: TaskEditValue) => Promise<void>
  ) {
    super(plugin.app);
    this.value = {
      name: task.name,
      priority: task.priority,
      due: task.due,
      scheduled: task.scheduled,
      start: task.start
    };
  }

  onOpen(): void {
    const labels = localePack(this.plugin.settings.locale).labels;
    this.contentEl.empty();
    this.contentEl.addClass("para-zk-task-edit-modal");
    this.contentEl.createEl("h2", { text: labels.editTask });

    new Setting(this.contentEl)
      .setName(labels.title)
      .addText((text) => {
        text
          .setValue(this.value.name)
          .onChange((value) => {
            this.value.name = value;
          });
        text.inputEl.addClass("para-zk-task-edit-title");
      });

    new Setting(this.contentEl)
      .setName(labels.priority)
      .addDropdown((dropdown) => {
        dropdown
          .addOption("", "")
          .addOption("highest", "highest")
          .addOption("high", "high")
          .addOption("medium", "medium")
          .addOption("low", "low")
          .addOption("lowest", "lowest")
          .setValue(this.value.priority ?? "")
          .onChange((value) => {
            this.value.priority = value || undefined;
          });
      });

    this.addDateSetting(labels.dueDate, "due");
    this.addDateSetting(labels.scheduledDate, "scheduled");
    this.addDateSetting(labels.startDate, "start");

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

  private addDateSetting(label: string, field: "due" | "scheduled" | "start"): void {
    new Setting(this.contentEl)
      .setName(label)
      .addText((text) => {
        text.inputEl.type = "date";
        text
          .setValue(this.value[field] ?? "")
          .onChange((value) => {
            this.value[field] = value || undefined;
          });
      });
  }

  private async submit(): Promise<void> {
    if (this.saving) return;
    const name = this.value.name.trim();
    if (!name) {
      new Notice(localePack(this.plugin.settings.locale).labels.title);
      return;
    }

    this.saving = true;
    try {
      await this.save({
        ...this.value,
        name
      });
      this.close();
    } catch (error) {
      new Notice(errorMessage(error));
    } finally {
      this.saving = false;
    }
  }
}

function beginTaskBlockRender(el: HTMLElement, args: TaskBlockArgs): TaskBlockState {
  const state = taskBlockState(el, args);
  state.generation += 1;
  state.draggingTaskId = undefined;
  cancelPendingCheckboxReconcile(state);
  return state;
}

function taskBlockState(el: HTMLElement, args: TaskBlockArgs): TaskBlockState {
  const existing = taskBlockStates.get(el);
  if (existing) return existing;

  const state: TaskBlockState = {
    toolbar: {
      order: args.order ?? "smart",
      status: initialStatusFilter(args.checkbox),
      due: args.due ?? "any",
      priority: "any"
    },
    generation: 0,
    checkboxMutationSerial: 0,
    items: [],
    visible: []
  };
  taskBlockStates.set(el, state);
  return state;
}

function cancelPendingCheckboxReconcile(state: TaskBlockState): void {
  if (state.pendingCheckboxTimer === undefined) return;
  window.clearTimeout(state.pendingCheckboxTimer);
  state.pendingCheckboxTimer = undefined;
}

function isCurrentTaskBlockGeneration(el: HTMLElement, generation: number): boolean {
  return taskBlockStates.get(el)?.generation === generation;
}

function scheduleCheckboxReconcile(
  plugin: ParaZkPluginContext,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  state: TaskBlockState,
  generation: number
): void {
  cancelPendingCheckboxReconcile(state);
  state.pendingCheckboxTimer = window.setTimeout(() => {
    state.pendingCheckboxTimer = undefined;
    if (!el.isConnected) return;
    if (!isCurrentTaskBlockGeneration(el, generation)) return;
    void renderTaskBlock(plugin, source, el, ctx);
  }, CHECKBOX_RECONCILE_DELAY_MS);
}

async function queueRootTaskWrite<T>(rootFile: TFile, write: () => Promise<T>): Promise<T> {
  const key = rootFile.path;
  const previous = taskWriteQueues.get(key) ?? Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(write);
  taskWriteQueues.set(key, current);
  try {
    return await current;
  } finally {
    if (taskWriteQueues.get(key) === current) {
      taskWriteQueues.delete(key);
    }
  }
}

function updateTaskSummary(plugin: ParaZkPluginContext, state: TaskBlockState): void {
  if (!state.summaryEl) return;
  state.summaryEl.textContent = taskSummaryText(
    state.items,
    state.visible,
    localePack(plugin.settings.locale).labels
  );
}

function canDragReorder(
  args: TaskBlockArgs,
  state: TaskToolbarState,
  items: RenderableTask[],
  visible: RenderableTask[]
): boolean {
  return args.root === "current"
    && state.order === "manual"
    && state.status === "all"
    && state.due === "any"
    && state.priority === "any"
    && visible.length === items.length
    && items.length > 1;
}

function reorderedTaskIds(
  visible: RenderableTask[],
  draggedId: string,
  targetId: string,
  placeAfter: boolean
): string[] | undefined {
  const ids = visible.map((item) => item.id);
  const from = ids.indexOf(draggedId);
  const target = ids.indexOf(targetId);
  if (from === -1 || target === -1 || from === target) return undefined;

  const [moved] = ids.splice(from, 1);
  const targetAfterRemoval = ids.indexOf(targetId);
  const insertAt = targetAfterRemoval + (placeAfter ? 1 : 0);
  ids.splice(insertAt, 0, moved);
  return ids;
}

function isTaskDropAfter(event: DragEvent, row: HTMLElement): boolean {
  const rect = row.getBoundingClientRect();
  return event.clientY > rect.top + rect.height / 2;
}

function markTaskDropPosition(list: HTMLElement, row: HTMLElement, placeAfter: boolean): void {
  cleanupTaskDropMarks(list);
  row.addClass(placeAfter ? "is-drop-after" : "is-drop-before");
}

function cleanupTaskDropMarks(list: HTMLElement): void {
  for (const row of list.querySelectorAll(".para-zk-task-row")) {
    row.removeClass("is-drop-before", "is-drop-after");
  }
}

function cleanupTaskDragMarks(list: HTMLElement): void {
  for (const row of list.querySelectorAll(".para-zk-task-row")) {
    row.removeClass("is-dragging", "is-drop-before", "is-drop-after");
  }
}

function setRenderableTaskCheckbox(
  item: RenderableTask,
  component: ButtonComponent,
  button: HTMLButtonElement,
  value: string
): void {
  item.task.checkbox = value;
  button.classList.remove("is-open", "is-active", "is-done", "is-cancelled");
  button.addClass(taskCheckboxClass(value));
  button.setAttr("aria-label", `Task status ${value.trim() || "open"}`);
  component.setButtonText(taskCheckboxText(value));
}

function initialStatusFilter(value: TaskBlockArgs["checkbox"]): TaskStatusFilter {
  if (value === "done") return "done";
  if (value === "open") return "open";
  return "all";
}

function filteredTasks(items: RenderableTask[], args: TaskBlockArgs, state: TaskToolbarState): RenderableTask[] {
  return items
    .filter((item) => statusMatches(item.task.checkbox, state.status))
    .filter((item) => dueMatches(item.task.due, state.due))
    .filter((item) => priorityMatches(item.task.priority, state.priority))
    .sort((left, right) => compareTasks(left, right, state.order))
    .slice(0, args.limit);
}

function statusMatches(value: string, filter: TaskStatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "done") return value.toLocaleLowerCase() === "x";
  return value.toLocaleLowerCase() !== "x" && value !== "-";
}

function dueMatches(value: string | undefined, filter: TaskDueFilter): boolean {
  if (filter === "any") return true;
  const due = value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (filter === "none") return !due;
  if (!due) return false;
  const today = localDate(new Date());
  if (filter === "today") return due === today;
  if (filter === "upcoming7") return due > today && due <= addDays(today, 7);
  return due > addDays(today, 7) && due <= addDays(today, 30);
}

function priorityMatches(value: string | undefined, filter: TaskPriorityFilter): boolean {
  if (filter === "any") return true;
  return value === "high" || value === "highest";
}

function compareTasks(left: RenderableTask, right: RenderableTask, order: TaskOrder): number {
  if (order === "manual") return 0;
  if (order === "due") {
    return stringCompare(left.task.due, right.task.due)
      || priorityRank(right.task.priority) - priorityRank(left.task.priority)
      || left.task.name.localeCompare(right.task.name);
  }
  if (order === "priority") {
    return priorityRank(right.task.priority) - priorityRank(left.task.priority)
      || stringCompare(left.task.due, right.task.due)
      || left.task.name.localeCompare(right.task.name);
  }
  if (order === "status") {
    return statusRank(left.task.checkbox) - statusRank(right.task.checkbox)
      || stringCompare(left.task.due, right.task.due)
      || priorityRank(right.task.priority) - priorityRank(left.task.priority)
      || left.task.name.localeCompare(right.task.name);
  }
  if (order === "name") {
    return left.task.name.localeCompare(right.task.name)
      || stringCompare(left.task.due, right.task.due);
  }
  return priorityRank(right.task.priority) - priorityRank(left.task.priority)
    || stringCompare(left.task.due, right.task.due)
    || statusRank(left.task.checkbox) - statusRank(right.task.checkbox)
    || left.rootTitle.localeCompare(right.rootTitle)
    || left.task.name.localeCompare(right.task.name);
}

function priorityRank(value: string | undefined): number {
  switch (value) {
    case "highest": return 5;
    case "high": return 4;
    case "medium": return 3;
    case "low": return 2;
    case "lowest": return 1;
    default: return 0;
  }
}

function stringCompare(left: string | undefined, right: string | undefined): number {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right);
}

function statusRank(value: string): number {
  const normalized = value.trim().toLocaleLowerCase();
  if (!normalized) return 0;
  if (normalized === "/" || normalized === ">") return 1;
  if (normalized === "x") return 2;
  if (normalized === "-") return 3;
  return 1;
}

function taskSummaryText(items: RenderableTask[], visible: RenderableTask[], labels: Record<string, string>): string {
  const open = items.filter((item) => statusMatches(item.task.checkbox, "open")).length;
  const dueToday = items.filter((item) => statusMatches(item.task.checkbox, "open") && dueMatches(item.task.due, "today")).length;
  const summary = [
    `${open} ${labels.taskOpenCount}`,
    `${dueToday} ${labels.taskTodayCount}`
  ];
  if (visible.length !== items.length) summary.push(`${visible.length}/${items.length} ${labels.taskShownCount}`);
  return summary.join(" · ");
}

function taskOrderOptions(labels: Record<string, string>, includeManual: boolean): Array<{ value: TaskOrder; label: string }> {
  const options: Array<{ value: TaskOrder; label: string }> = [
    { value: "smart", label: labels.taskOrderSmart },
    { value: "due", label: labels.taskOrderDue },
    { value: "priority", label: labels.taskOrderPriority },
    { value: "status", label: labels.taskOrderStatus },
    { value: "name", label: labels.taskOrderName }
  ];
  if (includeManual) options.splice(1, 0, { value: "manual", label: labels.taskOrderManual });
  return options;
}

function taskStatusOptions(labels: Record<string, string>): Array<{ value: TaskStatusFilter; label: string }> {
  return [
    { value: "all", label: labels.taskFilterAll },
    { value: "open", label: labels.taskFilterOpen },
    { value: "done", label: labels.taskFilterDone }
  ];
}

function taskPriorityOptions(labels: Record<string, string>): Array<{ value: TaskPriorityFilter; label: string }> {
  return [
    { value: "any", label: labels.taskPriorityAny },
    { value: "high", label: labels.taskPriorityHigh }
  ];
}

function taskMeta(task: TaskRead): TaskMetaChip[] {
  return [
    task.priority ? { kind: "priority", label: task.priority } : undefined,
    task.due ? { kind: "due", label: `due ${task.due}` } : undefined,
    task.scheduled ? { kind: "scheduled", label: `scheduled ${task.scheduled}` } : undefined,
    task.start ? { kind: "start", label: `start ${task.start}` } : undefined
  ].filter(isTaskMetaChip);
}

function isTaskMetaChip(value: TaskMetaChip | undefined): value is TaskMetaChip {
  return value !== undefined;
}

function taskCheckboxClass(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "x") return "is-done";
  if (normalized === "-") return "is-cancelled";
  if (normalized === "/" || normalized === ">") return "is-active";
  return "is-open";
}

function taskCheckboxText(value: string): string {
  const normalized = value.trim();
  return normalized || "";
}

function parseTaskBlockArgs(source: string): TaskBlockArgs {
  const raw = parseCodeBlockKeyValues(source);
  const root = raw.root === "all" ? "all" : "current";
  const rawLimit = raw.limit;
  const limit = rawLimit === undefined ? undefined : Number(rawLimit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    new Notice("PARA-ZK task block limit must be a positive integer.");
  }
  return {
    root,
    checkbox: raw.checkbox,
    due: parseDueFilter(raw.due),
    limit: limit !== undefined && Number.isInteger(limit) && limit > 0 ? limit : root === "all" ? 50 : undefined,
    order: parseTaskOrder(raw.order)
  };
}

function parseDueFilter(value: string | undefined): TaskBlockArgs["due"] {
  const normalized = value?.trim();
  if (normalized === "today" || normalized === "upcoming7" || normalized === "upcoming30") return normalized;
  return undefined;
}

function parseTaskOrder(value: string | undefined): TaskOrder | undefined {
  const normalized = value?.trim();
  if (
    normalized === "smart"
    || normalized === "manual"
    || normalized === "due"
    || normalized === "priority"
    || normalized === "status"
    || normalized === "name"
  ) {
    return normalized;
  }
  return undefined;
}

function parseCodeBlockKeyValues(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/);
    if (match) result[match[1]] = match[2];
  }
  return result;
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
}
