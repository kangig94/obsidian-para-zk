import { beforeEach, describe, expect, it } from "vitest";
import { createCliHarness, type CliHarness } from "../harness/cli";

const ACTIVE = "PARA/Projects/Alpha/Alpha.md";
const ARCHIVED = "PARA/Archives/Projects/Alpha/Alpha.md";

let cli: CliHarness;

beforeEach(async () => {
  cli = createCliHarness();
  await cli.run("para-zk:create-project", { title: "Alpha", status: "in_progress", open: "false" });
  await cli.run("para-zk:update-project", {
    title: "Alpha",
    key: "tasks",
    op: "insert",
    value_json: JSON.stringify({ name: "Archive flow task" })
  });
});

describe("archive on status change", () => {
  it("moves the project into PARA/Archives/Projects and back", async () => {
    const move = await cli.run("para-zk:update-project", {
      title: "Alpha",
      key: "frontmatter/status",
      op: "set",
      value: "archived"
    });
    expect(move.moved).toBe(true);
    expect(move.fromPath).toBe(ACTIVE);
    expect(move.toPath).toBe(ARCHIVED);
    expect(cli.app.readPath(ARCHIVED)).toBeDefined();
    expect(cli.app.readPath(ACTIVE)).toBeUndefined();

    const archivedTasks = await cli.run("para-zk:read-project", {
      title: "Alpha",
      archived: "true",
      key: "tasks",
      query: "Archive flow task"
    });
    expect((archivedTasks.value as { count?: number }).count).toBe(1);
    expect(cli.app.listPaths().some((p) => p.startsWith("Tasks/archives/"))).toBe(true);
    expect(cli.app.listPaths().some((p) => p.startsWith("Tasks/current/"))).toBe(false);

    const restore = await cli.run("para-zk:update-project", {
      title: "Alpha",
      archived: "true",
      key: "frontmatter/status",
      op: "set",
      value: "in_progress"
    });
    expect(restore.moved).toBe(true);
    expect(restore.fromPath).toBe(ARCHIVED);
    expect(restore.toPath).toBe(ACTIVE);
    expect(cli.app.readPath(ACTIVE)).toBeDefined();
    expect(cli.app.readPath(ARCHIVED)).toBeUndefined();
    expect(cli.app.listPaths().some((p) => p.startsWith("Tasks/current/"))).toBe(true);
  });
});
