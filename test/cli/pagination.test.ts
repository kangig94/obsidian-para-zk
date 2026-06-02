import { beforeEach, describe, expect, it } from "vitest";
import { createCliHarness, type CliHarness } from "../harness/cli";

let cli: CliHarness;

beforeEach(async () => {
  cli = createCliHarness();
  await cli.run("para-zk:create-project", { title: "Alpha", status: "in_progress", open: "false" });
});

describe("task collection paging", () => {
  it("summarizes large collections and pages exact reads", async () => {
    for (let i = 1; i <= 11; i += 1) {
      await cli.run("para-zk:update-project", {
        title: "Alpha",
        key: "tasks",
        op: "insert",
        value_json: JSON.stringify({ name: `Bulk ${i}` })
      });
    }

    const compact = await cli.run("para-zk:read-project", { title: "Alpha" });
    expect((compact.tasks as { count: number }).count).toBeGreaterThan(10);
    expect((compact.tasks as { preview?: unknown }).preview).toBeUndefined();

    const page = await cli.run("para-zk:read-project", { title: "Alpha", key: "tasks", offset: "5", limit: "3" });
    const value = page.value as { offset: number; limit: number; returned: number; has_more: boolean; items: Record<string, unknown> };
    expect(value.offset).toBe(5);
    expect(value.limit).toBe(3);
    expect(value.returned).toBe(3);
    expect(Object.keys(value.items).length).toBe(3);
    expect(value.has_more).toBe(true);
  });

  it("filters by query and deletes a task by id", async () => {
    for (let i = 1; i <= 3; i += 1) {
      await cli.run("para-zk:update-project", {
        title: "Alpha",
        key: "tasks",
        op: "insert",
        value_json: JSON.stringify({ name: `Item ${i}` })
      });
    }
    const query = await cli.run("para-zk:read-project", { title: "Alpha", key: "tasks", query: "Item 2" });
    const items = (query.value as { items: Record<string, unknown> }).items;
    expect(Object.keys(items).length).toBe(1);

    const id = Object.keys(items)[0];
    const del = await cli.run("para-zk:update-project", { title: "Alpha", key: `tasks/${id}`, op: "delete" });
    expect(del.changed).toBe(true);

    const after = await cli.run("para-zk:read-project", { title: "Alpha", key: "tasks", query: "Item 2" });
    expect((after.value as { count: number }).count).toBe(0);
  });
});
