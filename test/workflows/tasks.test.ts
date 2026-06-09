import { describe, expect, it } from "vitest";
import { createProject, deleteRootTask, insertRootTask } from "../../src/workflows";
import { createTestContext } from "../harness/vault";

describe("task workflow cleanup", () => {
  it("permanently deletes (not trashes) the shard when deleting the only managed task", async () => {
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

    const deletePaths: string[] = [];
    const trashPaths: string[] = [];
    ctx.host.delete = async (file) => {
      deletePaths.push(file.path);
      await app.vault.delete(file);
    };
    ctx.host.trash = async (file, system) => {
      trashPaths.push(file.path);
      await app.vault.trash(file, system);
    };
    ctx.host.trashFile = async (file) => {
      trashPaths.push(file.path);
      await app.vault.trash(file, false);
    };

    const changed = await deleteRootTask(ctx, rootFile, taskId);

    expect(changed).toBe(true);
    expect(deletePaths).toEqual([shardPath]);
    expect(trashPaths).toEqual([]);
    expect(app.vault.getFileByPath(shardPath)).toBeNull();
  });
});
