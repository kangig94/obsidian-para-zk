import { Modal, Notice, Setting, setIcon, TFile, type MarkdownPostProcessorContext } from "obsidian";
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
    ? plugin.app.vault.getFileByPath(ctx.sourcePath)
    : undefined;

  if (args.root === "current" && !(rootFile instanceof TFile)) {
    el.createDiv({ cls: "para-zk-task-empty", text: t.labels.taskRootUnavailable });
    return;
  }

  if (args.root === "current" && rootFile) {
    const controls = el.createDiv({ cls: "para-zk-task-controls" });
    const addButton = controls.createEl("button", {
      cls: "para-zk-task-add",
      text: t.labels.addTask
    });
    addButton.type = "button";
    addButton.addEventListener("click", async () => {
      await runTaskAction(plugin, addButton, async () => {
        const name = await promptText(
          plugin.app,
          t.labels.tasks,
          t.labels.title,
          "",
          t.labels.confirm,
          t.labels.cancel
        );
        if (!name) return;
        await insertRootTask(taskContext(plugin), rootFile, { name });
        await renderTaskBlock(plugin, source, el, ctx);
      });
    });
  }

  const items = args.root === "current" && rootFile
    ? await currentRootTasks(plugin, rootFile)
    : await allRootTasks(plugin);
  const visible = filteredTasks(items, args);

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

function filteredTasks(items: RenderableTask[], args: TaskBlockArgs): RenderableTask[] {
  const query = args.query?.toLocaleLowerCase();
  return items
    .filter((item) => checkboxMatches(item.task.checkbox, args.checkbox))
    .filter((item) => dueMatches(item.task.due, args.due))
    .filter((item) => !query || taskSearchText(item).toLocaleLowerCase().includes(query))
    .sort(compareTasks)
    .slice(0, args.limit);
}

function checkboxMatches(value: string, filter: TaskBlockArgs["checkbox"]): boolean {
  if (!filter) return true;
  const normalized = filter.trim().toLocaleLowerCase();
  if (normalized === "open") return value.toLocaleLowerCase() !== "x";
  if (normalized === "done") return value.toLocaleLowerCase() === "x";
  if (normalized === "space" || normalized === "blank" || normalized === "todo") return value === " ";
  return value === filter;
}

function dueMatches(value: string | undefined, filter: TaskBlockArgs["due"]): boolean {
  if (!filter) return true;
  const due = value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (!due) return false;
  const today = localDate(new Date());
  if (filter === "today") return due === today;
  if (filter === "upcoming7") return due > today && due <= addDays(today, 7);
  return due > addDays(today, 7) && due <= addDays(today, 30);
}

function compareTasks(left: RenderableTask, right: RenderableTask): number {
  return priorityRank(right.task.priority) - priorityRank(left.task.priority)
    || stringCompare(left.task.due, right.task.due)
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
    limit: Number.isInteger(limit) && limit > 0 ? limit : 50
  };
}

function parseDueFilter(value: string | undefined): TaskBlockArgs["due"] {
  const normalized = value?.trim();
  if (normalized === "today" || normalized === "upcoming7" || normalized === "upcoming30") return normalized;
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
