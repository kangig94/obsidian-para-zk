import { beforeEach, describe, expect, it } from "vitest";
import { createCliHarness, type CliHarness } from "../harness/cli";

let cli: CliHarness;

beforeEach(() => {
  cli = createCliHarness();
});

describe("zk notes", () => {
  it("creates spark and permanent notes and reads/updates maturity", async () => {
    const spark = await cli.run("para-zk:create-zk", { title: "Spark", kind: "spark", open: "false" });
    expect(spark.created).toBe(true);

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

  it("round-trips zk_digest frontmatter keys (first_author, url) through update and read", async () => {
    const digest = await cli.run("para-zk:create-zk", { title: "DDIM digest", kind: "digest", open: "false" });
    expect(digest.created).toBe(true);

    await cli.run("para-zk:update-zk", {
      title: "DDIM digest", kind: "digest", key: "frontmatter/first_author", op: "set", value: "Song"
    });
    await cli.run("para-zk:update-zk", {
      title: "DDIM digest", kind: "digest", key: "frontmatter/url", op: "set", value: "https://example.com/ddim"
    });

    const author = await cli.run("para-zk:read-zk", { title: "DDIM digest", kind: "digest", key: "frontmatter/first_author" });
    expect(author.value).toBe("Song");
    const url = await cli.run("para-zk:read-zk", { title: "DDIM digest", kind: "digest", key: "frontmatter/url" });
    expect(url.value).toBe("https://example.com/ddim");
  });

  it("normalizes permanent aliases updates to a one-item list", async () => {
    const permanent = await cli.run("para-zk:create-zk", {
      title: "Aliased Permanent",
      kind: "permanent",
      open: "false"
    });
    expect(permanent.created).toBe(true);

    const update = await cli.run("para-zk:update-zk", {
      title: "Aliased Permanent",
      kind: "permanent",
      key: "frontmatter/aliases",
      op: "set",
      value: "Foo"
    });
    expect(update.changed).toBe(true);

    const read = await cli.run("para-zk:read-zk", {
      title: "Aliased Permanent",
      kind: "permanent",
      key: "frontmatter/aliases"
    });
    expect(read.value).toEqual(["Foo"]);
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
      source_type: "project",
      source_title: "Alpha",
      date: "2026-06-02",
      open: "false"
    });
    expect(retro.created).toBe(true);

    const weekIso = await cli.run("para-zk:read-retro", { title: String(retro.path).split("/").pop()!.replace(/\.md$/, ""), key: "frontmatter/week_iso" });
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
        source_type: "project",
        source_title: "Alpha",
        date: "2026-06-02",
        open: "false"
      });

      const project = await cli.run("para-zk:read-retro", { title: String(retro.path).split("/").pop()!.replace(/\.md$/, ""), key: "frontmatter/project" });
      expect(project.value).toBe("[[PARA/Projects/Alpha/Alpha.md|Alpha]]");
    } finally {
      cli.app.metadataCache.getFileCache = originalGetFileCache;
    }
  });

  it("opens the existing project retro for the same source and week", async () => {
    await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });
    const created = await cli.run("para-zk:create-retro", {
      source_type: "project",
      source_title: "Alpha",
      date: "2026-06-02",
      open: "false"
    });
    expect(created.created).toBe(true);

    const original = cli.app.vault.getFileByPath(String(created.path));
    expect(original).toBeTruthy();
    await cli.app.fileManager.renameFile(original!, "PARA/Retros/2026_W23/Alpha weekly review.md");

    const reopened = await cli.run("para-zk:create-retro", {
      source_type: "project",
      source_title: "Alpha",
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
    const subarea = await cli.run("para-zk:create-area", {
      title: "Hiring",
      parent_title: "Ops",
      inherit_parent_tag: "true",
      open: "false"
    });
    expect(subarea.created).toBe(true);
    expect(cli.app.readPath(String(subarea.path))).toContain("type: area");

    const children = await cli.run("para-zk:read-area", { title: "Ops", key: "children" });
    const hiringChild = (children.value as Record<string, { path: string; type: string }>).Hiring;
    expect(hiringChild.path).toBe(subarea.path);
    // The child index reports the stored type — a nested area is `area`, not the dropped `subarea`.
    expect(hiringChild.type).toBe("area");

    // The nested area stores type=area (so type=area filters catch it) but is reached only
    // through its parent: a bare-title area lookup resolves root areas only (parent empty),
    // keeping name-based addressing unambiguous.
    expect(cli.app.readPath(String(subarea.path))).not.toContain("type: subarea");
    const byBareTitle = await cli.run("para-zk:read-area", { title: "Hiring" });
    expect(byBareTitle.ok).toBe(false);
    expect(String(byBareTitle.error)).toContain("area not found");

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

  it("creates and addresses a nested subarea and a subnote at depth via child drill", async () => {
    await cli.run("para-zk:create-area", { title: "Ops", open: "false" });
    const hiring = await cli.run("para-zk:create-area", { title: "Hiring", parent_title: "Ops", open: "false" });
    expect(hiring.path).toBe("PARA/Areas/Ops/Hiring/Hiring.md");

    // A nested area created under a nested area: parent is reached by root + child drill.
    const interviews = await cli.run("para-zk:create-area", {
      title: "Interviews",
      parent_title: "Ops",
      child: '["Hiring"]',
      open: "false"
    });
    expect(interviews.ok).toBe(true);
    expect(interviews.path).toBe("PARA/Areas/Ops/Hiring/Interviews/Interviews.md");

    // A subnote two levels deep, then read its body back through the same drill chain.
    const plan = await cli.run("para-zk:create-subnote", {
      title: "Plan",
      parent_type: "area",
      parent_title: "Ops",
      child: '["Hiring", "Interviews"]',
      subnote_type: "plan",
      body: "Hire two engineers.",
      open: "false"
    });
    expect(plan.ok).toBe(true);
    expect(plan.path).toBe("PARA/Areas/Ops/Hiring/Interviews/Plan.md");

    const read = await cli.run("para-zk:read-area", {
      title: "Ops",
      child: '["Hiring", "Interviews", "Plan"]',
      key: "body"
    });
    expect(String(read.value)).toContain("Hire two engineers.");
  });

  it("nests areas to arbitrary depth with uniform type, drill addressing, and child views", async () => {
    await cli.run("para-zk:create-area", { title: "AI", open: "false" });
    const gen = await cli.run("para-zk:create-area", { title: "Generation", parent_title: "AI", open: "false" });
    expect(gen.path).toBe("PARA/Areas/AI/Generation/Generation.md");
    const vision = await cli.run("para-zk:create-area", { title: "Vision", parent_title: "AI", child: '["Generation"]', open: "false" });
    expect(vision.path).toBe("PARA/Areas/AI/Generation/Vision/Vision.md");
    const llm = await cli.run("para-zk:create-area", { title: "LLM", parent_title: "AI", child: '["Generation"]', open: "false" });
    expect(llm.path).toBe("PARA/Areas/AI/Generation/LLM/LLM.md");

    // Every level stores type=area, so type=area filters and the area managed UI apply uniformly.
    for (const path of [gen.path, vision.path, llm.path]) {
      const content = cli.app.readPath(String(path)) ?? "";
      expect(content).toContain("type: area");
      expect(content).not.toContain("type: subarea");
    }

    // Reached only by drilling from the root; a bare-title lookup of a nested area fails.
    const deep = await cli.run("para-zk:read-area", { title: "AI", child: '["Generation", "Vision"]', key: "frontmatter/parent" });
    expect(deep.ok).toBe(true);
    expect(String(deep.value)).toContain("Generation");
    expect((await cli.run("para-zk:read-area", { title: "Vision" })).ok).toBe(false);

    // The parent's child-area view lists its area children at that level.
    const view = await cli.run("para-zk:read-area", { title: "AI", child: '["Generation"]', key: "children" });
    const kids = view.value as Record<string, { path: string; type: string }>;
    expect(kids.Vision.path).toBe(vision.path);
    expect(kids.LLM.path).toBe(llm.path);
    expect(kids.Vision.type).toBe("area");
    expect(kids.LLM.type).toBe("area");

    // The inherited tag namespace reflects the full path at depth (AI/Generation/Vision).
    expect(cli.app.readPath(String(vision.path)) ?? "").toContain("generation/vision");
  });

  it("inherit_parent_tag=false stores only the child namespace, not the parent's tag", async () => {
    await cli.run("para-zk:create-area", { title: "Ops", open: "false" });
    const solo = await cli.run("para-zk:create-area", {
      title: "Solo",
      parent_title: "Ops",
      inherit_parent_tag: "false",
      open: "false"
    });
    const content = cli.app.readPath(String(solo.path)) ?? "";
    expect(content).toMatch(/ops\/solo/); // child namespace present (locale-neutral slug chain)
    expect(content).not.toMatch(/\/ops\s*$/m); // the parent's own tag (…/ops) is not inherited
  });

  it("deletes a nested area along with its parent's folder-style container", async () => {
    await cli.run("para-zk:create-area", { title: "Ops", open: "false" });
    const nested = await cli.run("para-zk:create-area", { title: "Hiring", parent_title: "Ops", open: "false" });
    expect(cli.app.readPath(String(nested.path))).toBeDefined();

    const deleted = await cli.run("para-zk:delete-area", { title: "Ops", force: "true" });
    expect(deleted.ok).toBe(true);
    expect(cli.app.readPath("PARA/Areas/Ops/Ops.md")).toBeUndefined();
    expect(cli.app.readPath(String(nested.path))).toBeUndefined();
  });

  it("allocates a unique folder-style container for duplicate area titles", async () => {
    await cli.run("para-zk:create-area", { title: "Alpha", open: "false" });
    const duplicate = await cli.run("para-zk:create-area", { title: "Alpha", open: "false" });
    expect(duplicate.path).toBe("PARA/Areas/Alpha 1/Alpha 1.md");

    const subarea = await cli.run("para-zk:create-area", {
      title: "Nested",
      parent_title: "Alpha 1",
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
      parent_type: "project",
      parent_title: "Alpha",
      subnote_type: "free",
      open: "false"
    });
    const append = await cli.run("para-zk:update-project", {
      title: "Alpha",
      child: '["Notes"]',
      key: "body",
      op: "append",
      value: "Body addition"
    });
    expect(append.changed).toBe(true);

    const read = await cli.run("para-zk:read-project", { title: "Alpha", child: '["Notes"]', key: "body" });
    expect(String(read.value)).toContain("Body addition");
  });

  it("fills the free-form body inline on create", async () => {
    const zk = await cli.run("para-zk:create-zk", {
      title: "Body Spark",
      kind: "spark",
      body: "First line.\n\nSecond line.",
      open: "false"
    });
    const zkBody = await cli.run("para-zk:read-zk", { title: "Body Spark", kind: "spark", key: "body" });
    expect(String(zkBody.value)).toContain("First line.");
    expect(String(zkBody.value)).toContain("Second line.");

    // Subnote body via the inline arg is reachable through the parent's children key.
    await cli.run("para-zk:create-project", { title: "Beta", open: "false" });
    await cli.run("para-zk:create-subnote", {
      title: "Plan",
      parent_type: "project",
      parent_title: "Beta",
      subnote_type: "plan",
      body: "Step 1.",
      open: "false"
    });
    const subBody = await cli.run("para-zk:read-project", { title: "Beta", child: '["Plan"]', key: "body" });
    expect(String(subBody.value)).toContain("Step 1.");
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
    expect(resourceContent).toContain("Resource body\n\n```para-zk-managed\n```");
    expect(resourceContent).not.toContain("# Body");
    expect(resourceContent.match(/```para-zk-managed/g)).toHaveLength(1);

    await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });
    const retro = await cli.run("para-zk:create-retro", {
      source_type: "project",
      source_title: "Alpha",
      date: "2026-06-02",
      open: "false"
    });
    const retroUpdate = await cli.run("para-zk:update-retro", {
      title: String(retro.path).split("/").pop()!.replace(/\.md$/, ""),
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
  it("reads arbitrary heading-shaped Markdown as one free-form body", async () => {
    const body = [
      "# Free section",
      "Loose notes.",
      "## Detail",
      "Nested loose note.",
      "# Another section",
      "More prose."
    ].join("\n");
    await cli.app.vault.create("PARA/Resources/Free Resource.md", [
      "---",
      "type: resource",
      "---",
      "```para-zk-props",
      "type: resource",
      "```",
      body,
      "",
      "```para-zk-managed",
      "```",
      ""
    ].join("\n"));

    const exact = await cli.run("para-zk:read-resource", {
      title: "Free Resource",
      key: "body"
    });
    expect(exact.value).toBe(body);

    const compact = await cli.run("para-zk:read-resource", { title: "Free Resource" });
    expect(compact.body).toEqual({ chars: body.length });
    expect(compact).not.toHaveProperty("overview");
    expect(compact).not.toHaveProperty("untracked");
  });

  it("sets, appends, and replaces body text with top-level headings", async () => {
    await cli.run("para-zk:create-resource", { title: "Source", open: "false" });
    const initial = [
      "# First",
      "repeat",
      "repeat"
    ].join("\n");
    const set = await cli.run("para-zk:update-resource", {
      title: "Source",
      key: "body",
      op: "set",
      value: initial
    });
    expect(set.changed).toBe(true);

    const appendValue = [
      "# Second",
      "tail"
    ].join("\n");
    const append = await cli.run("para-zk:update-resource", {
      title: "Source",
      key: "body",
      op: "append",
      value: appendValue
    });
    expect(append.changed).toBe(true);

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

    const replace = await cli.run("para-zk:update-resource", {
      title: "Source",
      key: "body",
      op: "replace",
      match: "tail",
      with: "# Tail\nmore"
    });
    expect(replace.matches).toBe(1);

    const read = await cli.run("para-zk:read-resource", { title: "Source", key: "body" });
    expect(read.value).toBe([
      "# First",
      "done",
      "done",
      "# Second",
      "# Tail",
      "more"
    ].join("\n"));
  });

  it("keeps body reads and writes working after ZK template headings are removed", async () => {
    const created = await cli.run("para-zk:create-zk", {
      title: "Template Destroyed",
      kind: "digest",
      open: "false"
    });
    const path = String(created.path);
    const file = cli.app.vault.getFileByPath(path);
    expect(file).toBeTruthy();

    const body = [
      "# Arbitrary",
      "No enforced summary shape.",
      "# Notes",
      "Still prose."
    ].join("\n");
    await cli.app.vault.modify(file!, [
      "---",
      "type: zk_digest",
      "sourceTitle:",
      "url:",
      "first_author:",
      "published:",
      "---",
      "```para-zk-props",
      "type: zk_digest",
      "```",
      body,
      "",
      "```para-zk-managed",
      "```",
      ""
    ].join("\n"));

    const read = await cli.run("para-zk:read-zk", {
      title: "Template Destroyed",
      kind: "digest",
      key: "body"
    });
    expect(read.value).toBe(body);

    const append = await cli.run("para-zk:update-zk", {
      title: "Template Destroyed",
      kind: "digest",
      key: "body",
      op: "append",
      value: "# Replacement\nWorks"
    });
    expect(append.changed).toBe(true);

    const roundTrip = await cli.run("para-zk:read-zk", {
      title: "Template Destroyed",
      kind: "digest",
      key: "body"
    });
    expect(roundTrip.value).toBe(`${body}\n# Replacement\nWorks`);
  });
});

describe("structured section split guard", () => {
  it("rejects section updates that would split the section", async () => {
    await cli.run("para-zk:create-area", { title: "Split Guard", open: "false" });

    const h1Value = "Intro\n# Split";
    const rejectedSet = await cli.run("para-zk:update-area", {
      title: "Split Guard",
      key: "overview",
      op: "set",
      value: h1Value
    });
    expect(rejectedSet.ok).toBe(false);
    expect(String(rejectedSet.error)).toContain("value contains a level-1 heading");
    expect(String(rejectedSet.error)).toContain("would split the \"overview\" section");
    expect(String(rejectedSet.error)).toContain("e.g. '##'");

    const rejectedAppend = await cli.run("para-zk:update-area", {
      title: "Split Guard",
      key: "overview",
      op: "append",
      value: h1Value
    });
    expect(rejectedAppend.ok).toBe(false);
    expect(String(rejectedAppend.error)).toContain("value contains a level-1 heading");

    const deeperValue = "Intro\n## Split";
    const allowed = await cli.run("para-zk:update-area", {
      title: "Split Guard",
      key: "overview",
      op: "set",
      value: deeperValue
    });
    expect(allowed.changed).toBe(true);
    const read = await cli.run("para-zk:read-area", { title: "Split Guard", key: "overview" });
    expect(read.value).toBe(deeperValue);

    const thematicBreak = await cli.run("para-zk:update-area", {
      title: "Split Guard",
      key: "overview",
      op: "set",
      value: "Intro\n---\nRest"
    });
    expect(thematicBreak.ok).toBe(false);
    expect(String(thematicBreak.error)).toContain("value contains a '---' line");
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
