import { describe, expect, it } from "vitest";
import { createProject, deleteRootTask, insertRootTask, readRootTaskMap, setRootTaskField } from "../../src/workflows";
import { createTestContext } from "../harness/vault";

describe("task workflow cleanup", () => {
  it("trashes the shard when deleting the only managed task", async () => {
    const { ctx, app } = createTestContext();
    const project = await createProject(ctx, {
      title: "Alpha",
      status: "in_progress",
      open: false
    });
    const rootFile = ctx.host.getFile(project.path);
    expect(rootFile).not.toBeNull();
    if (!rootFile) throw new Error("expected project root file");
    const taskId = await insertRootTask(ctx, rootFile, { name: "Only task" });
    const shardPath = app.listPaths().find((path) => path.startsWith("Tasks/current/") && path.endsWith(".md"));
    expect(shardPath).toBeDefined();
    if (!shardPath) throw new Error("expected current task shard path");

    const trashPaths: string[] = [];
    ctx.host.trashFile = async (file) => {
      trashPaths.push(file.path);
      await app.vault.trash(file, false);
    };

    const changed = await deleteRootTask(ctx, rootFile, taskId);

    expect(changed).toBe(true);
    expect(trashPaths).toEqual([shardPath]);
    expect(app.vault.getFileByPath(shardPath)).toBeNull();
  });

  it("serializes concurrent inserts into the same root shard", async () => {
    const { ctx } = createTestContext();
    const project = await createProject(ctx, {
      title: "Alpha",
      status: "in_progress",
      open: false
    });
    const rootFile = ctx.host.getFile(project.path);
    expect(rootFile).not.toBeNull();
    if (!rootFile) throw new Error("expected project root file");

    await Promise.all([
      insertRootTask(ctx, rootFile, { name: "First task" }),
      insertRootTask(ctx, rootFile, { name: "Second task" })
    ]);

    const tasks = await readRootTaskMap(ctx, rootFile);
    expect(Object.values(tasks).map((task) => task.name).sort()).toEqual(["First task", "Second task"]);
  });

  it("serializes concurrent field updates to different tasks in one shard", async () => {
    const { ctx } = createTestContext();
    const project = await createProject(ctx, {
      title: "Alpha",
      status: "in_progress",
      open: false
    });
    const rootFile = ctx.host.getFile(project.path);
    expect(rootFile).not.toBeNull();
    if (!rootFile) throw new Error("expected project root file");
    const firstId = await insertRootTask(ctx, rootFile, { name: "First task" });
    const secondId = await insertRootTask(ctx, rootFile, { name: "Second task" });

    await Promise.all([
      setRootTaskField(ctx, rootFile, firstId, "due", "2026-06-12"),
      setRootTaskField(ctx, rootFile, secondId, "priority", "high")
    ]);

    const tasks = await readRootTaskMap(ctx, rootFile);
    expect(tasks[firstId]).toMatchObject({ name: "First task", due: "2026-06-12" });
    expect(tasks[secondId]).toMatchObject({ name: "Second task", priority: "high" });
  });

  it("serializes mixed insert and delete operations on one shard", async () => {
    const { ctx } = createTestContext();
    const project = await createProject(ctx, {
      title: "Alpha",
      status: "in_progress",
      open: false
    });
    const rootFile = ctx.host.getFile(project.path);
    expect(rootFile).not.toBeNull();
    if (!rootFile) throw new Error("expected project root file");
    const deleteId = await insertRootTask(ctx, rootFile, { name: "Remove task" });

    await Promise.all([
      insertRootTask(ctx, rootFile, { name: "Added task" }),
      deleteRootTask(ctx, rootFile, deleteId)
    ]);

    const tasks = await readRootTaskMap(ctx, rootFile);
    expect(Object.values(tasks).map((task) => task.name)).toEqual(["Added task"]);
  });
});
