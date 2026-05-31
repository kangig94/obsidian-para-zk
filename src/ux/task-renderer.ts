import { DropdownComponent, Modal, Notice, Setting, setIcon, TFile, type MarkdownPostProcessorContext } from "obsidian";
import { localePack } from "../i18n";
import type { ParaZkPluginContext } from "../plugin-interface";
import { localDate } from "../time";
import {
  cycleTaskCheckbox,
  deleteRootTask,
  insertRootTask,
  readAllTaskItems,
  readRootTaskMap,
  setRootTaskField,
  type TaskRead,
  type WorkflowContext
} from "../workflows";
import { promptText } from "./prompts";

type TaskBlockArgs = {
  root: "current" | "all";
  checkbox?: "open" | "done" | string;
  due?: "today" | "upcoming7" | "upcoming30";
  query?: string;
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
  query: string;
  searchActive: boolean;
  searchComposing: boolean;
  searchTimer?: number;
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

const taskToolbarStates = new WeakMap<HTMLElement, TaskToolbarState>();

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
  const t = localePack(plugin.settings.locale);
  el.empty();
  el.addClass("para-zk-tasks");

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
  const state = taskToolbarState(el, args);
  const visible = filteredTasks(items, args, state);

  renderTaskToolbar(plugin, el, source, ctx, {
    args,
    rootFile,
    items,
    visible,
    state
  });

  if (visible.length === 0) {
    el.createDiv({ cls: "para-zk-task-empty", text: t.labels.noTasks });
    return;
  }

  const list = el.createDiv({ cls: "para-zk-task-list" });
  for (const item of visible) {
    renderTaskRow(plugin, list, item, {
      showRoot: args.root === "all",
      rerender: () => renderTaskBlock(plugin, source, el, ctx)
    });
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
    state: TaskToolbarState;
  }
): void {
  const labels = localePack(plugin.settings.locale).labels;
  const toolbar = el.createDiv({ cls: "para-zk-task-toolbar" });
  const heading = toolbar.createDiv({ cls: "para-zk-task-toolbar-heading" });
  heading.createDiv({ cls: "para-zk-task-toolbar-summary", text: taskSummaryText(options.items, options.visible, labels) });

  const controls = toolbar.createDiv({ cls: "para-zk-task-toolbar-controls" });
  if (options.args.root === "current" && options.rootFile) {
    const addButton = controls.createEl("button", {
      cls: "para-zk-task-toolbar-button para-zk-task-add"
    });
    addButton.type = "button";
    addButton.setAttr("aria-label", labels.addTask);
    addButton.setAttr("title", labels.addTask);
    setIcon(addButton, "plus");
    addButton.createSpan({ text: labels.addTask });
    addButton.addEventListener("click", async () => {
      await runTaskAction(plugin, addButton, async () => {
        const name = await promptText(
          plugin.app,
          labels.tasks,
          labels.title,
          "",
          labels.confirm,
          labels.cancel
        );
        if (!name || !options.rootFile) return;
        await insertRootTask(taskContext(plugin), options.rootFile, { name });
        await renderTaskBlock(plugin, source, el, ctx);
      });
    });
  }

  renderToolbarSelect(controls, {
    label: labels.taskOrder,
    value: options.state.order,
    options: taskOrderOptions(labels),
    onChange: (value) => {
      options.state.order = value as TaskOrder;
      void renderTaskBlock(plugin, source, el, ctx);
    }
  });
  renderToolbarSelect(controls, {
    label: labels.status,
    value: options.state.status,
    options: taskStatusOptions(labels),
    onChange: (value) => {
      options.state.status = value as TaskStatusFilter;
      void renderTaskBlock(plugin, source, el, ctx);
    }
  });
  renderToolbarSelect(controls, {
    label: labels.dueDate,
    value: options.state.due,
    options: taskDueOptions(labels),
    onChange: (value) => {
      options.state.due = value as TaskDueFilter;
      void renderTaskBlock(plugin, source, el, ctx);
    }
  });
  renderToolbarSelect(controls, {
    label: labels.priority,
    value: options.state.priority,
    options: taskPriorityOptions(labels),
    onChange: (value) => {
      options.state.priority = value as TaskPriorityFilter;
      void renderTaskBlock(plugin, source, el, ctx);
    }
  });
  renderTaskSearch(plugin, controls, el, source, ctx, options.state);
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
  dropdown.setValue(options.value);
  dropdown.onChange((value) => {
    dropdown.selectEl.blur();
    window.setTimeout(() => options.onChange(value), 0);
  });
}

function renderTaskSearch(
  plugin: ParaZkPluginContext,
  parent: HTMLElement,
  el: HTMLElement,
  source: string,
  ctx: MarkdownPostProcessorContext,
  state: TaskToolbarState
): void {
  const labels = localePack(plugin.settings.locale).labels;
  const search = parent.createDiv({ cls: `para-zk-task-search${state.searchActive || state.query ? " is-active" : ""}` });
  const icon = search.createSpan({ cls: "para-zk-task-search-icon" });
  setIcon(icon, "search");
  const input = search.createEl("input", {
    attr: {
      "aria-label": labels.taskSearch,
      placeholder: labels.taskSearch,
      type: "search"
    }
  });
  input.value = state.query;
  input.addEventListener("focus", () => {
    state.searchActive = true;
  });
  input.addEventListener("blur", () => {
    state.searchActive = Boolean(state.query);
  });
  input.addEventListener("compositionstart", () => {
    state.searchComposing = true;
  });
  input.addEventListener("compositionend", () => {
    state.searchComposing = false;
    state.query = input.value;
    state.searchActive = true;
    scheduleTaskSearchRender(plugin, el, source, ctx, state);
  });
  input.addEventListener("input", () => {
    state.query = input.value;
    state.searchActive = true;
    if (!state.searchComposing) scheduleTaskSearchRender(plugin, el, source, ctx, state);
  });
  if (state.searchActive || state.query) {
    window.setTimeout(() => {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }, 0);
  }
}

function scheduleTaskSearchRender(
  plugin: ParaZkPluginContext,
  el: HTMLElement,
  source: string,
  ctx: MarkdownPostProcessorContext,
  state: TaskToolbarState
): void {
  if (state.searchTimer !== undefined) window.clearTimeout(state.searchTimer);
  state.searchTimer = window.setTimeout(() => {
    state.searchTimer = undefined;
    void renderTaskBlock(plugin, source, el, ctx);
  }, 120);
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

function renderTaskRow(
  plugin: ParaZkPluginContext,
  list: HTMLElement,
  item: RenderableTask,
  options: { showRoot: boolean; rerender: () => Promise<void> }
): void {
  const row = list.createDiv({ cls: "para-zk-task-row" });

  const checkbox = row.createEl("button", {
    cls: `para-zk-task-checkbox ${taskCheckboxClass(item.task.checkbox)}`,
    text: taskCheckboxText(item.task.checkbox)
  });
  checkbox.type = "button";
  checkbox.setAttr("aria-label", `Task status ${item.task.checkbox.trim() || "open"}`);
  checkbox.setAttr("title", "Cycle task status");
  checkbox.addEventListener("click", async () => {
    await runTaskAction(plugin, checkbox, async () => {
      await setRootTaskField(
        taskContext(plugin),
        item.rootFile,
        item.id,
        "checkbox",
        cycleTaskCheckbox(item.task.checkbox)
      );
      await options.rerender();
    });
  });

  const body = row.createDiv({ cls: "para-zk-task-body" });
  body.createDiv({ cls: "para-zk-task-name", text: item.task.name });

  const meta = taskMeta(item.task);
  if (options.showRoot || meta.length > 0) {
    const metaEl = body.createDiv({ cls: "para-zk-task-meta" });
    if (options.showRoot) {
      const rootLink = metaEl.createEl("button", {
        cls: "para-zk-task-root",
        text: item.rootTitle
      });
      rootLink.type = "button";
      rootLink.addEventListener("click", async () => {
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
  const edit = actions.createEl("button", { cls: "para-zk-task-edit" });
  edit.type = "button";
  edit.setAttr("aria-label", "Edit task");
  edit.setAttr("title", "Edit task");
  setIcon(edit, "pencil");
  edit.addEventListener("click", () => {
    new TaskEditModal(plugin, item.task, async (value) => {
      await updateTaskFromEditor(plugin, item, value);
      await options.rerender();
    }).open();
  });

  const remove = actions.createEl("button", { cls: "para-zk-task-delete" });
  remove.type = "button";
  remove.setAttr("aria-label", "Delete task");
  remove.setAttr("title", "Delete task");
  setIcon(remove, "trash");
  remove.addEventListener("click", async () => {
    await runTaskAction(plugin, remove, async () => {
      await deleteRootTask(taskContext(plugin), item.rootFile, item.id);
      await options.rerender();
    });
  });
}

async function updateTaskFromEditor(plugin: ParaZkPluginContext, item: RenderableTask, value: TaskEditValue): Promise<void> {
  const fields: Array<keyof TaskEditValue> = ["name", "priority", "due", "scheduled", "start"];
  for (const field of fields) {
    if ((item.task[field] ?? "") === (value[field] ?? "")) continue;
    await setRootTaskField(taskContext(plugin), item.rootFile, item.id, field, value[field] ?? "");
  }
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

function taskToolbarState(el: HTMLElement, args: TaskBlockArgs): TaskToolbarState {
  const existing = taskToolbarStates.get(el);
  if (existing) return existing;

  const state: TaskToolbarState = {
    order: args.order ?? "smart",
    status: initialStatusFilter(args.checkbox),
    due: args.due ?? "any",
    priority: "any",
    query: args.query ?? "",
    searchActive: Boolean(args.query),
    searchComposing: false
  };
  taskToolbarStates.set(el, state);
  return state;
}

function initialStatusFilter(value: TaskBlockArgs["checkbox"]): TaskStatusFilter {
  if (value === "done") return "done";
  if (value === "open") return "open";
  return "all";
}

function filteredTasks(items: RenderableTask[], args: TaskBlockArgs, state: TaskToolbarState): RenderableTask[] {
  const query = state.query.trim().toLocaleLowerCase();
  return items
    .filter((item) => statusMatches(item.task.checkbox, state.status))
    .filter((item) => dueMatches(item.task.due, state.due))
    .filter((item) => priorityMatches(item.task.priority, state.priority))
    .filter((item) => !query || taskSearchText(item).toLocaleLowerCase().includes(query))
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

function taskOrderOptions(labels: Record<string, string>): Array<{ value: TaskOrder; label: string }> {
  return [
    { value: "smart", label: labels.taskOrderSmart },
    { value: "manual", label: labels.taskOrderManual },
    { value: "due", label: labels.taskOrderDue },
    { value: "priority", label: labels.taskOrderPriority },
    { value: "status", label: labels.taskOrderStatus },
    { value: "name", label: labels.taskOrderName }
  ];
}

function taskStatusOptions(labels: Record<string, string>): Array<{ value: TaskStatusFilter; label: string }> {
  return [
    { value: "open", label: labels.taskFilterOpen },
    { value: "all", label: labels.taskFilterAll },
    { value: "done", label: labels.taskFilterDone }
  ];
}

function taskDueOptions(labels: Record<string, string>): Array<{ value: TaskDueFilter; label: string }> {
  return [
    { value: "any", label: labels.taskDueAny },
    { value: "today", label: labels.today },
    { value: "upcoming7", label: labels.upcoming7 },
    { value: "upcoming30", label: labels.upcoming30 },
    { value: "none", label: labels.taskDueNone }
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

function taskSearchText(item: RenderableTask): string {
  return [
    item.rootTitle,
    item.task.name,
    item.task.priority,
    item.task.due,
    item.task.scheduled,
    item.task.start
  ].filter(Boolean).join("\n");
}

function parseTaskBlockArgs(source: string): TaskBlockArgs {
  const raw = parseCodeBlockKeyValues(source);
  const root = raw.root === "all" ? "all" : "current";
  const limit = Number(raw.limit ?? "50");
  if (!Number.isInteger(limit) || limit < 1) {
    new Notice("PARA-ZK task block limit must be a positive integer.");
  }
  return {
    root,
    checkbox: raw.checkbox,
    due: parseDueFilter(raw.due),
    query: raw.query?.trim() || undefined,
    limit: Number.isInteger(limit) && limit > 0 ? limit : 50,
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
