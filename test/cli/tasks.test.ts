import { beforeEach, describe, expect, it } from "vitest";
import { createCliHarness, type CliHarness } from "../harness/cli";

let cli: CliHarness;

beforeEach(async () => {
  cli = createCliHarness();
  await cli.run("para-zk:create-project", { title: "Alpha", status: "in_progress", open: "false" });
});

function currentShard(): string {
  const path = cli.app.listPaths().find((p) => p.startsWith("Tasks/current/") && p.endsWith(".md"));
  expect(path, "expected a current task shard").toBeTruthy();
  return cli.app.readPath(path as string) as string;
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
