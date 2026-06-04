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
  it("creates a project retro and reads week_iso without managed task/reference UI", async () => {
    await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });
    const retro = await cli.run("para-zk:create-retro", {
      path: "PARA/Projects/Alpha/Alpha.md",
      date: "2026-06-02",
      open: "false"
    });
    expect(retro.created).toBe(true);

    const weekIso = await cli.run("para-zk:read-retro", { path: String(retro.path), key: "frontmatter/week_iso" });
    expect(String(weekIso.value).length).toBeGreaterThan(0);

    const content = cli.app.readPath(String(retro.path)) ?? "";
    expect(content).not.toContain("```para-zk-managed");
    expect(content).not.toContain("```para-zk-tasks");
    expect(content).not.toContain("```para-zk-references");

    const described = await cli.run("para-zk:describe", { type: "retro" });
    const retroSurface = (described.surfaces as Array<{ type: string; readKeys: string[] }>)[0];
    expect(retroSurface.readKeys).not.toContain("tasks");
    expect(retroSurface.readKeys).not.toContain("references");
  });

  it("links a project retro even when metadata cache has not caught up", async () => {
    await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });

    const originalGetFileCache = cli.app.metadataCache.getFileCache;
    cli.app.metadataCache.getFileCache = (file) => {
      if (file.path === "PARA/Projects/Alpha/Alpha.md") return { frontmatter: {} };
      return originalGetFileCache(file);
    };

    try {
      const retro = await cli.run("para-zk:create-retro", {
        path: "PARA/Projects/Alpha/Alpha.md",
        date: "2026-06-02",
        open: "false"
      });

      const project = await cli.run("para-zk:read-retro", { path: String(retro.path), key: "frontmatter/project" });
      expect(project.value).toBe("[[PARA/Projects/Alpha/Alpha.md|Alpha]]");
    } finally {
      cli.app.metadataCache.getFileCache = originalGetFileCache;
    }
  });

  it("opens the existing project retro for the same source and week", async () => {
    await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });
    const created = await cli.run("para-zk:create-retro", {
      path: "PARA/Projects/Alpha/Alpha.md",
      date: "2026-06-02",
      open: "false"
    });
    expect(created.created).toBe(true);

    const original = cli.app.vault.getFileByPath(String(created.path));
    expect(original).toBeTruthy();
    await cli.app.fileManager.renameFile(original!, "PARA/Retros/2026_W23/Alpha weekly review.md");

    const reopened = await cli.run("para-zk:create-retro", {
      path: "PARA/Projects/Alpha/Alpha.md",
      date: "2026-06-02",
      open: "true"
    });

    expect(reopened.created).toBe(false);
    expect(reopened.path).toBe("PARA/Retros/2026_W23/Alpha weekly review.md");
    expect(cli.app.readPath(String(created.path))).toBeUndefined();
    expect(cli.app.opened.at(-1)).toBe("PARA/Retros/2026_W23/Alpha weekly review.md");
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

    const described = await cli.run("para-zk:describe", { type: "area" });
    const areaSurface = (described.surfaces as Array<{ type: string; readKeys: string[] }>)[0];
    expect(areaSurface.readKeys).toEqual(expect.arrayContaining([
      "frontmatter",
      "overview",
      "tasks",
      "references",
      "backlinks",
      "children"
    ]));
    expect(areaSurface.readKeys).not.toContain("children/<title>/<key>");
  });

  it("allocates a unique folder-style container for duplicate area titles", async () => {
    await cli.run("para-zk:create-area", { title: "Alpha", open: "false" });
    const duplicate = await cli.run("para-zk:create-area", { title: "Alpha", open: "false" });
    expect(duplicate.path).toBe("PARA/Areas/Alpha 1/Alpha 1.md");

    const subarea = await cli.run("para-zk:create-subarea", {
      title: "Nested",
      path: "PARA/Areas/Alpha 1/Alpha 1.md",
      open: "false"
    });
    expect(subarea.path).toBe("PARA/Areas/Alpha 1/Nested/Nested.md");

    const renamed = await cli.run("para-zk:rename-area", {
      title: "Alpha 1",
      new_title: "Beta"
    });
    expect(renamed.path).toBe("PARA/Areas/Beta/Beta.md");
    expect(cli.app.readPath("PARA/Areas/Beta/Nested/Nested.md")).toBeDefined();
    expect(cli.app.readPath("PARA/Areas/Alpha/Alpha 1.md")).toBeUndefined();
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

describe("managed UI preservation", () => {
  it("keeps the managed UI block when updating final human sections", async () => {
    await cli.run("para-zk:create-area", { title: "Ops", open: "false" });
    const areaUpdate = await cli.run("para-zk:update-area", {
      title: "Ops",
      key: "overview",
      op: "set",
      value: "Area overview"
    });
    expect(areaUpdate.changed).toBe(true);
    const areaContent = cli.app.readPath("PARA/Areas/Ops/Ops.md") ?? "";
    expect(areaContent).toContain("# Overview\nArea overview\n\n```para-zk-managed\n```");
    expect(areaContent.match(/```para-zk-managed/g)).toHaveLength(1);

    await cli.run("para-zk:create-resource", { title: "Source", open: "false" });
    const resourceUpdate = await cli.run("para-zk:update-resource", {
      title: "Source",
      key: "body",
      op: "set",
      value: "Resource body"
    });
    expect(resourceUpdate.changed).toBe(true);
    const resourceContent = cli.app.readPath("PARA/Resources/Source.md") ?? "";
    expect(resourceContent).toContain("# Body\nResource body\n\n```para-zk-managed\n```");
    expect(resourceContent.match(/```para-zk-managed/g)).toHaveLength(1);

    await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });
    const retro = await cli.run("para-zk:create-retro", {
      path: "PARA/Projects/Alpha/Alpha.md",
      date: "2026-06-02",
      open: "false"
    });
    const retroUpdate = await cli.run("para-zk:update-retro", {
      path: String(retro.path),
      key: "retro_summary",
      op: "set",
      value: "Retro summary text"
    });
    expect(retroUpdate.changed).toBe(true);
    const retroContent = cli.app.readPath(String(retro.path)) ?? "";
    expect(retroContent).toContain("# Retro summary (required)\nRetro summary text\n");
    expect(retroContent).not.toContain("```para-zk-managed");
    expect(retroContent).not.toContain("```para-zk-tasks");
    expect(retroContent).not.toContain("```para-zk-references");
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

describe("date arguments", () => {
  it("rejects invalid calendar dates", async () => {
    const journal = await cli.run("para-zk:capture-journal", {
      content: "Bad date",
      date: "2026-02-31"
    });
    expect(journal.ok).toBe(false);
    expect(String(journal.error)).toContain("date must be a valid YYYY-MM-DD");

    const retro = await cli.run("para-zk:create-retro", {
      title: "Bad date retro",
      date: "not-a-date"
    });
    expect(retro.ok).toBe(false);
    expect(String(retro.error)).toContain("date must be YYYY-MM-DD");
  });
});
