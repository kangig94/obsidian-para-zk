import { beforeEach, describe, expect, it } from "vitest";
import { createCliHarness, type CliHarness } from "../harness/cli";

let cli: CliHarness;

beforeEach(() => {
  cli = createCliHarness();
});

describe("zk notes", () => {
  it("creates fleeting and permanent notes and reads/updates maturity", async () => {
    const fleeting = await cli.run("para-zk:create-zk", { title: "Spark", kind: "fleeting", open: "false" });
    expect(fleeting.created).toBe(true);

    const permanent = await cli.run("para-zk:create-zk", {
      title: "Evergreen",
      kind: "permanent",
      maturity: "refined",
      open: "false"
    });
    expect(permanent.created).toBe(true);

    const read = await cli.run("para-zk:read-zk", {
      title: "Evergreen",
      kind: "permanent",
      key: "frontmatter/maturity"
    });
    expect(read.value).toBe("refined");

    const update = await cli.run("para-zk:update-zk", {
      title: "Evergreen",
      kind: "permanent",
      key: "frontmatter/maturity",
      op: "set",
      value: "evergreen"
    });
    expect(update.changed).toBe(true);
  });

  it("renames and deletes a permanent note", async () => {
    await cli.run("para-zk:create-zk", { title: "Old idea", kind: "permanent", maturity: "draft", open: "false" });
    const renamed = await cli.run("para-zk:rename-zk", { title: "Old idea", kind: "permanent", new_title: "New idea" });
    expect(renamed.path).toBe("ZK/Permanent/New idea.md");
    expect(cli.app.readPath("ZK/Permanent/Old idea.md")).toBeUndefined();

    const deleted = await cli.run("para-zk:delete-zk", { title: "New idea", kind: "permanent" });
    expect(deleted.ok).toBe(true);
    expect(cli.app.readPath("ZK/Permanent/New idea.md")).toBeUndefined();
  });
});

describe("journal", () => {
  it("captures, reads, and updates the quick memo and tasks", async () => {
    const capture = await cli.run("para-zk:capture-journal", {
      content: "Morning memo",
      date: "2026-06-02",
      time: "09:01",
      energy: "high",
      open: "false"
    });
    expect(capture.ok).toBe(true);

    const read = await cli.run("para-zk:read-journal", { date: "2026-06-02", key: "quick_memo" });
    expect(String(read.value)).toContain("Morning memo");

    const update = await cli.run("para-zk:update-journal", {
      date: "2026-06-02",
      key: "quick_memo",
      op: "append",
      value: "Afternoon note"
    });
    expect(update.changed).toBe(true);

    const taskUpdate = await cli.run("para-zk:update-journal", {
      date: "2026-06-02",
      key: "tasks",
      op: "insert",
      value_json: JSON.stringify({ name: "Journal task" })
    });
    expect(taskUpdate.changed).toBe(true);

    const tasks = await cli.run("para-zk:read-journal", { date: "2026-06-02", key: "tasks" });
    const items = (tasks.value as { items?: Record<string, { name?: string }> }).items ?? {};
    expect(Object.values(items).some((t) => t.name === "Journal task")).toBe(true);
  });

  it("deletes a journal note", async () => {
    const capture = await cli.run("para-zk:capture-journal", { content: "Disposable", date: "2026-01-15" });
    expect(capture.ok).toBe(true);
    const deleted = await cli.run("para-zk:delete-journal", { date: "2026-01-15" });
    expect(deleted.ok).toBe(true);
    expect(deleted.trashed).toBe(true);
    expect(cli.app.readPath(String(capture.path))).toBeUndefined();
  });
});

describe("retro", () => {
  it("creates a project retro, reads week_iso, and inserts tasks", async () => {
    await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });
    const retro = await cli.run("para-zk:create-retro", {
      path: "PARA/Projects/Alpha/Alpha.md",
      date: "2026-06-02",
      open: "false"
    });
    expect(retro.created).toBe(true);

    const weekIso = await cli.run("para-zk:read-retro", { path: String(retro.path), key: "frontmatter/week_iso" });
    expect(String(weekIso.value).length).toBeGreaterThan(0);

    const update = await cli.run("para-zk:update-retro", {
      path: String(retro.path),
      key: "tasks",
      op: "insert",
      value_json: JSON.stringify({ name: "Retro action" })
    });
    expect(update.changed).toBe(true);
  });
});

describe("subarea and child bodies", () => {
  it("creates a subarea under an area and reads it as a child", async () => {
    const area = await cli.run("para-zk:create-area", { title: "Ops", open: "false" });
    const subarea = await cli.run("para-zk:create-subarea", {
      title: "Hiring",
      path: String(area.path),
      inheritParentTag: "true",
      open: "false"
    });
    expect(subarea.created).toBe(true);

    const children = await cli.run("para-zk:read-area", { title: "Ops", key: "children" });
    expect((children.value as Record<string, { path: string }>).Hiring.path).toBe(subarea.path);
  });

  it("appends to and reads a subnote body", async () => {
    await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });
    await cli.run("para-zk:create-subnote", {
      title: "Notes",
      path: "PARA/Projects/Alpha/Alpha.md",
      subnote_type: "free",
      open: "false"
    });
    const append = await cli.run("para-zk:update-project", {
      title: "Alpha",
      key: "children/Notes/body",
      op: "append",
      value: "Body addition"
    });
    expect(append.changed).toBe(true);

    const read = await cli.run("para-zk:read-project", { title: "Alpha", key: "children/Notes/body" });
    expect(String(read.value)).toContain("Body addition");
  });
});

describe("resource body updates", () => {
  it("sets, replaces all matches, and rejects ambiguous replace", async () => {
    await cli.run("para-zk:create-resource", { title: "Source", open: "false" });
    const set = await cli.run("para-zk:update-resource", {
      title: "Source",
      key: "body",
      op: "set",
      value: "repeat\\nrepeat"
    });
    expect(set.changed).toBe(true);

    const ambiguous = await cli.run("para-zk:update-resource", {
      title: "Source",
      key: "body",
      op: "replace",
      match: "repeat",
      with: "done"
    });
    expect(ambiguous.ok).toBe(false);
    expect(String(ambiguous.error)).toContain("matched 2 times");

    const all = await cli.run("para-zk:update-resource", {
      title: "Source",
      key: "body",
      op: "replace",
      match: "repeat",
      with: "done",
      all: "true"
    });
    expect(all.matches).toBe(2);
  });
});
