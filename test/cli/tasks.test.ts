import { beforeEach, describe, expect, it } from "vitest";
import type { ParaZkPluginContext } from "../../src/plugin-interface";
import { workflowContext } from "../../src/vault/host";
import { readAllTaskItems, readRootTaskMap, readTaskShardFile } from "../../src/workflows/tasks";
import { createCliHarness, type CliHarness } from "../harness/cli";

let cli: CliHarness;

const ACTIVE_PROJECT = "PARA/Projects/Alpha/Alpha.md";
const ARCHIVED_PROJECT = "PARA/Archives/Projects/Alpha/Alpha.md";

type TaskPage = {
  count?: number;
  returned?: number;
  items?: Record<string, TaskItem>;
};

type TaskItem = {
  checkbox?: string;
  name?: string;
  [key: string]: unknown;
};

beforeEach(async () => {
  cli = createCliHarness();
  await cli.run("para-zk:create-project", { title: "Alpha", status: "in_progress", open: "false" });
});

function currentShard(): string {
  return cli.app.readPath(currentShardPath()) as string;
}

function currentShardPath(): string {
  return taskShardPathIn("Tasks/current/");
}

function archivedShardPath(): string {
  return taskShardPathIn("Tasks/archives/");
}

function taskShardPathIn(folder: string): string {
  const path = cli.app.listPaths().find((p) => p.startsWith(folder) && p.endsWith(".md"));
  expect(path, `expected a task shard in ${folder}`).toBeTruthy();
  return path as string;
}

function ctx() {
  return workflowContext({ app: cli.app, settings: cli.settings } as unknown as ParaZkPluginContext);
}

async function readTaskPage(archived = false): Promise<TaskPage> {
  const read = await cli.run("para-zk:read-project", {
    title: "Alpha",
    ...(archived ? { archived: "true" } : {}),
    key: "tasks",
    limit: "all"
  });
  return read.value as TaskPage;
}

async function readTaskItems(archived = false): Promise<Record<string, TaskItem>> {
  return (await readTaskPage(archived)).items ?? {};
}

function taskIdByName(items: Record<string, TaskItem>, name: string): string {
  const found = Object.entries(items).find(([, task]) => task.name === name);
  expect(found, `expected task named ${name}`).toBeDefined();
  return found?.[0] as string;
}

async function readTask(taskId: string): Promise<TaskItem> {
  const task = (await readTaskItems())[taskId];
  expect(task, `expected task ${taskId}`).toBeDefined();
  return task as TaskItem;
}

async function insertTask(name: string): Promise<string> {
  const insert = await cli.run("para-zk:update-project", {
    title: "Alpha",
    key: "tasks",
    op: "insert",
    value_json: JSON.stringify({ name })
  });
  expect(insert.changed).toBe(true);
  return taskIdByName(await readTaskItems(), name);
}

async function deleteTask(taskId: string, archived = false): Promise<Record<string, unknown>> {
  return cli.run("para-zk:update-project", {
    title: "Alpha",
    ...(archived ? { archived: "true" } : {}),
    key: `tasks/${taskId}`,
    op: "delete"
  });
}

async function setTaskField(taskId: string, field: string, value: string): Promise<Record<string, unknown>> {
  return cli.run("para-zk:update-project", {
    title: "Alpha",
    key: `tasks/${taskId}/${field}`,
    op: "set",
    value
  });
}

describe("structured task inserts", () => {
  it("stores tasks in the Tasks plugin emoji format", async () => {
    const insert = await cli.run("para-zk:update-project", {
      title: "Alpha",
      key: "tasks",
      op: "insert",
      value_json: JSON.stringify({ name: "Ship release", due: "2026-06-05", priority: "high" })
    });
    expect(insert.changed).toBe(true);

    const shard = currentShard();
    expect(shard.startsWith("# Tasks")).toBe(true);
    expect(shard).toContain("Ship release");
    expect(shard).toContain("\u{1F194}"); // 🆔 id
    expect(shard).toContain("\u{23EB}"); // ⏫ high priority
    expect(shard).toContain("\u{1F4C5} 2026-06-05"); // 📅 due
  });

  it("omits legacy id/metadata syntax and root frontmatter", async () => {
    await cli.run("para-zk:update-project", {
      title: "Alpha",
      key: "tasks",
      op: "insert",
      value_json: JSON.stringify({ name: "No legacy markers" })
    });
    const shard = currentShard();
    for (const legacy of ["[id::", "[priority::", "[due::", "pzt_", "type: para_zk_tasks", "root_id:"]) {
      expect(shard).not.toContain(legacy);
    }
  });

  it("rejects raw Markdown task lines", async () => {
    const rejected = await cli.run("para-zk:update-project", {
      title: "Alpha",
      key: "tasks",
      op: "insert",
      value: "- [ ] Raw task line"
    });
    expect(rejected.ok).toBe(false);
    expect(String(rejected.error)).toContain("value_json object");
  });
});

describe("structured task field updates", () => {
  it("sets checkbox values used by task status cycling", async () => {
    const taskId = await insertTask("Cycle status");

    for (const value of ["/", "x", "-", " "]) {
      const updated = await setTaskField(taskId, "checkbox", value);

      expect(updated.ok).toBe(true);
      expect(updated.changed).toBe(true);
      expect((await readTask(taskId)).checkbox).toBe(value);
    }
  });

  it("sets the task name", async () => {
    const taskId = await insertTask("Old name");

    const updated = await setTaskField(taskId, "name", "New name");

    expect(updated.ok).toBe(true);
    expect(updated.changed).toBe(true);
    const items = await readTaskItems();
    expect(items[taskId]?.name).toBe("New name");
    expect(Object.values(items).map((task) => task.name)).not.toContain("Old name");
  });

  it("sets every task date field", async () => {
    const taskId = await insertTask("Date fields");
    const dates: Record<string, string> = {
      due: "2026-06-12",
      scheduled: "2026-06-13",
      start: "2026-06-14",
      created: "2026-06-15",
      done: "2026-06-16",
      cancelled: "2026-06-17"
    };

    for (const [field, value] of Object.entries(dates)) {
      const updated = await setTaskField(taskId, field, value);
      expect(updated.ok).toBe(true);
      expect(updated.changed).toBe(true);
    }

    const task = await readTask(taskId);
    for (const [field, value] of Object.entries(dates)) {
      expect(task[field]).toBe(value);
    }
  });

  it("sets task priority", async () => {
    const taskId = await insertTask("Priority task");

    const updated = await setTaskField(taskId, "priority", "high");

    expect(updated.ok).toBe(true);
    expect(updated.changed).toBe(true);
    expect((await readTask(taskId)).priority).toBe("high");
    expect(currentShard()).toContain("\u{23EB}");
  });

  it("returns an error envelope for an invalid field value", async () => {
    const taskId = await insertTask("Invalid priority");

    const updated = await setTaskField(taskId, "priority", "urgent");

    expect(updated.ok).toBe(false);
    expect(String(updated.error)).toContain("task priority must be one of");
    expect((await readTask(taskId)).priority).toBeUndefined();
  });

  it("returns an error envelope when setting a nonexistent task id", async () => {
    const updated = await setTaskField("ghost-id", "due", "2026-06-12");

    expect(updated.ok).toBe(false);
    expect(String(updated.error)).toContain("task not found");
  });

  it("returns an error envelope for an unknown task field", async () => {
    const taskId = await insertTask("Unknown field");

    const updated = await setTaskField(taskId, "foobar", "value");

    expect(updated.ok).toBe(false);
    expect(String(updated.error)).toContain("unknown task field");
  });

  it("clears an optional metadata value", async () => {
    const taskId = await insertTask("Clear due date");
    await setTaskField(taskId, "due", "2026-06-12");

    const updated = await setTaskField(taskId, "due", "");

    expect(updated.ok).toBe(true);
    expect(updated.changed).toBe(true);
    expect((await readTask(taskId)).due).toBeUndefined();
    expect(currentShard()).not.toContain("\u{1F4C5} 2026-06-12");
  });

  it("returns changed false when setting the same value", async () => {
    const taskId = await insertTask("No-op due date");
    await setTaskField(taskId, "due", "2026-06-12");

    const updated = await setTaskField(taskId, "due", "2026-06-12");

    expect(updated.ok).toBe(true);
    expect(updated.changed).toBe(false);
    expect((await readTask(taskId)).due).toBe("2026-06-12");
  });
});

describe("structured task deletes", () => {
  it("trashes the current shard when deleting its only task", async () => {
    const taskId = await insertTask("Only task");
    const shardPath = currentShardPath();

    const deleted = await deleteTask(taskId);

    expect(deleted.changed).toBe(true);
    expect(cli.app.vault.getFileByPath(shardPath)).toBeNull();
    expect(cli.app.vault.getAbstractFileByPath(shardPath)).toBeNull();
    expect(cli.app.trashed).toContainEqual({ path: shardPath, system: false });
    expect(cli.app.deleted).not.toContain(shardPath);

    const read = await readTaskPage();
    expect(read.count).toBe(0);
    expect(read.returned).toBe(0);
    expect(read.items).toEqual({});

    const context = ctx();
    const rootFile = context.host.getFile(ACTIVE_PROJECT);
    expect(rootFile).not.toBeNull();
    if (!rootFile) throw new Error("expected active project file");
    await expect(readTaskShardFile(context, rootFile)).resolves.toBeUndefined();
    await expect(readRootTaskMap(context, rootFile)).resolves.toEqual({});
    await expect(readAllTaskItems(context)).resolves.toEqual([]);
  });

  it("keeps the shard when another task line remains", async () => {
    await insertTask("Keep task");
    const removedTaskId = await insertTask("Drop task");
    const shardPath = currentShardPath();

    const deleted = await deleteTask(removedTaskId);

    expect(deleted.changed).toBe(true);
    expect(cli.app.vault.getFileByPath(shardPath)).not.toBeNull();
    expect(cli.app.readPath(shardPath)).toContain("Keep task");
    expect(cli.app.readPath(shardPath)).not.toContain("Drop task");
    expect(cli.app.trashed).not.toContainEqual({ path: shardPath, system: false });
    expect(cli.app.deleted).not.toContain(shardPath);
  });

  it("keeps the shard when deleting the only task would leave user prose", async () => {
    const taskId = await insertTask("Managed task");
    const shardPath = currentShardPath();
    const shardFile = cli.app.vault.getFileByPath(shardPath);
    expect(shardFile).not.toBeNull();
    if (!shardFile) throw new Error("expected current task shard file");
    await cli.app.vault.modify(shardFile, `${cli.app.readPath(shardPath) ?? ""}\n\nUser prose stays.\n`);

    const deleted = await deleteTask(taskId);

    expect(deleted.changed).toBe(true);
    expect(cli.app.vault.getFileByPath(shardPath)).not.toBeNull();
    expect(cli.app.readPath(shardPath)).toContain("User prose stays.");
    expect(cli.app.readPath(shardPath)).not.toContain("Managed task");
    expect(cli.app.trashed).not.toContainEqual({ path: shardPath, system: false });
    expect(cli.app.deleted).not.toContain(shardPath);
  });

  it("keeps the shard when deleting the only task would leave user headings", async () => {
    const taskId = await insertTask("Managed task");
    const shardPath = currentShardPath();
    const shardFile = cli.app.vault.getFileByPath(shardPath);
    expect(shardFile).not.toBeNull();
    if (!shardFile) throw new Error("expected current task shard file");
    await cli.app.vault.modify(shardFile, `${cli.app.readPath(shardPath) ?? ""}\n## Done\n## Backlog\n`);

    const deleted = await deleteTask(taskId);

    expect(deleted.changed).toBe(true);
    expect(cli.app.vault.getFileByPath(shardPath)).not.toBeNull();
    expect(cli.app.readPath(shardPath)).toContain("## Done");
    expect(cli.app.readPath(shardPath)).toContain("## Backlog");
    expect(cli.app.readPath(shardPath)).not.toContain("Managed task");
    expect(cli.app.trashed).not.toContainEqual({ path: shardPath, system: false });
    expect(cli.app.deleted).not.toContain(shardPath);
  });

  it("returns an error envelope when deleting a task id that does not exist", async () => {
    await insertTask("Existing task");

    const deleted = await deleteTask("missing-task-id");

    expect(deleted.ok).toBe(false);
    expect(String(deleted.error)).toContain("task not found");
    expect(currentShard()).toContain("Existing task");
  });

  it("trashes the archives shard for the last task of an archived project", async () => {
    const taskId = await insertTask("Archived task");
    const currentPath = currentShardPath();
    await cli.run("para-zk:update-project", {
      title: "Alpha",
      key: "frontmatter/status",
      op: "set",
      value: "archived"
    });
    const archivePath = archivedShardPath();

    const deleted = await deleteTask(taskId, true);

    expect(deleted.changed).toBe(true);
    expect(cli.app.readPath(ARCHIVED_PROJECT)).toBeDefined();
    expect(cli.app.vault.getFileByPath(archivePath)).toBeNull();
    expect(cli.app.vault.getFileByPath(currentPath)).toBeNull();
    expect(cli.app.trashed).toContainEqual({ path: archivePath, system: false });
    expect(cli.app.deleted).not.toContain(archivePath);
    expect(cli.app.deleted).not.toContain(currentPath);
  });
});
