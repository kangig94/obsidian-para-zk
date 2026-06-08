import { beforeEach, describe, expect, it } from "vitest";
import { createCliHarness, type CliHarness } from "../harness/cli";

let cli: CliHarness;

beforeEach(() => {
  cli = createCliHarness();
});

async function createBaseProject() {
  return cli.run("para-zk:create-project", {
    title: "Alpha",
    area_titles: JSON.stringify(["AI", "Software"]),
    status: "in_progress",
    priority: "high",
    open: "false"
  });
}

describe("create-project", () => {
  it("creates the note, resolves areas, and reuses existing ones", async () => {
    const first = await cli.run("para-zk:create-area", { title: "AI", open: "false" });
    expect(first.ok).toBe(true);

    const project = await createBaseProject();
    expect(project.ok).toBe(true);
    expect(project.created).toBe(true);
    expect(project.path).toBe("PARA/Projects/Alpha/Alpha.md");

    const areas = project.areas as Array<{ title: string; created: boolean }>;
    expect(areas.find((a) => a.title === "AI")?.created).toBe(false);
    expect(areas.find((a) => a.title === "Software")?.created).toBe(true);
  });

  it("creates notes with the current managed project template shape", async () => {
    const project = await cli.run("para-zk:create-project", {
      title: "Template Shape",
      open: "false"
    });
    expect(project.ok).toBe(true);

    const content = cli.app.readPath("PARA/Projects/Template Shape/Template Shape.md") ?? "";
    expect(content).toContain("# Summary\n```para-zk-latest-retro-summary\n```\n\n# Goals");
    expect(content).toContain("```para-zk-managed\n```");
    expect(content).not.toContain("```\n\n\n# Goals");
    expect(content.endsWith("\n\n")).toBe(false);

    const subnote = await cli.run("para-zk:create-subnote", {
      title: "Template Child",
      parent_type: "project",
      parent_title: "Template Shape",
      open: "false"
    });
    expect(subnote.ok).toBe(true);
    const subnoteContent = cli.app.readPath("PARA/Projects/Template Shape/Template Child.md") ?? "";
    expect(subnoteContent).toContain("```para-zk-props\ntype: subnote\n```");
    expect(subnoteContent).not.toContain("```para-zk-managed");
    expect(subnoteContent.endsWith("\n\n")).toBe(false);
  });

  it("sets a single alias at create time and leaves omitted aliases empty", async () => {
    const aliased = await cli.run("para-zk:create-project", {
      title: "Project Alias",
      alias: "PMG",
      open: "false"
    });
    expect(aliased.created).toBe(true);

    const read = await cli.run("para-zk:read-project", {
      title: "Project Alias",
      key: "frontmatter/aliases"
    });
    expect(read.value).toEqual(["PMG"]);
    expect(cli.app.readPath("PARA/Projects/Project Alias/Project Alias.md")).toContain("aliases:\n  - PMG");

    await cli.run("para-zk:create-project", { title: "No Project Alias", open: "false" });
    const omitted = await cli.run("para-zk:read-project", {
      title: "No Project Alias",
      key: "frontmatter/aliases"
    });
    expect(omitted.value).toBeNull();

    await cli.run("para-zk:create-project", { title: "Blank Project Alias", alias: "", open: "false" });
    const blank = await cli.run("para-zk:read-project", {
      title: "Blank Project Alias",
      key: "frontmatter/aliases"
    });
    expect(blank.value).toBeNull();
  });

  it("allocates a unique folder-style container for duplicate titles", async () => {
    await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });
    const duplicate = await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });
    expect(duplicate.path).toBe("PARA/Projects/Alpha 1/Alpha 1.md");

    const child = await cli.run("para-zk:create-subnote", {
      title: "Child",
      parent_type: "project",
      parent_title: "Alpha 1",
      open: "false"
    });
    expect(child.path).toBe("PARA/Projects/Alpha 1/Child.md");

    const renamed = await cli.run("para-zk:rename-project", {
      title: "Alpha 1",
      new_title: "Beta"
    });
    expect(renamed.path).toBe("PARA/Projects/Beta/Beta.md");
    expect(cli.app.readPath("PARA/Projects/Beta/Child.md")).toBeDefined();
    expect(cli.app.readPath("PARA/Projects/Alpha/Alpha 1.md")).toBeUndefined();
  });
});

describe("read-project", () => {
  it("exposes stable frontmatter, children, and compact metadata", async () => {
    await createBaseProject();
    await cli.run("para-zk:create-subnote", {
      title: "Kickoff",
      parent_type: "project",
      parent_title: "Alpha",
      subnote_type: "meeting",
      open: "false"
    });

    const read = await cli.run("para-zk:read-project", { title: "Alpha" });
    expect(read.ok).toBe(true);
    expect((read.frontmatter as Record<string, unknown>).status).toBe("in_progress");
    expect((read.children as Record<string, { path: string }>).Kickoff.path).toBe(
      "PARA/Projects/Alpha/Kickoff.md"
    );
    expect("keys" in read).toBe(false);
    expect(read.mode).toBe("compact");
    expect(read).not.toHaveProperty("available_keys");
    expect(read).not.toHaveProperty("omits_empty");
    expect(read.tasks).toBeUndefined();
  });

  it("summarizes prose sections by character count in compact reads", async () => {
    await createBaseProject();
    const summary = "A concise project summary.";
    await cli.run("para-zk:update-project", { title: "Alpha", key: "summary", op: "set", value: summary });

    const compact = await cli.run("para-zk:read-project", { title: "Alpha" });
    expect(compact.summary).toEqual({ chars: summary.length });

    const exact = await cli.run("para-zk:read-project", { title: "Alpha", key: "summary" });
    expect(exact.value).toBe(summary);
  });

  it("keeps deeper sub-headings inside their section", async () => {
    const summary = [
      "Lead summary.",
      "## Detail",
      "Nested detail.",
      "### Evidence",
      "Nested evidence."
    ].join("\n");
    await cli.app.vault.create("PARA/Projects/Nested.md", [
      "---",
      "type: project",
      "---",
      "# Summary",
      summary,
      "# Goals",
      "Goal text.",
      ""
    ].join("\n"));

    const exact = await cli.run("para-zk:read-project", { title: "Nested", key: "summary" });
    expect(exact.value).toBe(summary);

    const compact = await cli.run("para-zk:read-project", { title: "Nested" });
    expect(compact.summary).toEqual({ chars: summary.length });
    expect(compact.goals).toEqual({ chars: "Goal text.".length });
  });

  it("reads scalar keys in exact mode", async () => {
    await createBaseProject();
    const status = await cli.run("para-zk:read-project", {
      title: "Alpha",
      key: "frontmatter/status"
    });
    expect(status.value).toBe("in_progress");
    expect(status.mode).toBe("exact");
  });

  it("reads a child frontmatter key by path", async () => {
    await createBaseProject();
    await cli.run("para-zk:create-subnote", {
      title: "Kickoff",
      parent_type: "project",
      parent_title: "Alpha",
      subnote_type: "meeting",
      open: "false"
    });
    const type = await cli.run("para-zk:read-project", {
      title: "Alpha",
      child: '["Kickoff"]',
      key: "frontmatter/subnote_type"
    });
    expect(type.value).toBe("meeting");
  });

  it("does not treat root siblings as children of a flat project note", async () => {
    await cli.app.vault.create("PARA/Projects/Alpha.md", [
      "---",
      "type: project",
      "---",
      "# Summary",
      ""
    ].join("\n"));
    await cli.app.vault.create("PARA/Projects/Beta.md", [
      "---",
      "type: project",
      "---",
      "# Summary",
      ""
    ].join("\n"));
    await cli.app.vault.create("PARA/Projects/Child.md", [
      "---",
      "type: subnote",
      "parent: \"[[PARA/Projects/Alpha.md|Alpha]]\"",
      "---",
      "Child body",
      ""
    ].join("\n"));

    const read = await cli.run("para-zk:read-project", {
      title: "Alpha",
      key: "children"
    });
    const children = read.value as Record<string, { path: string }>;
    expect(children.Child.path).toBe("PARA/Projects/Child.md");
    expect(children.Beta).toBeUndefined();

    const rejected = await cli.run("para-zk:read-project", {
      title: "Alpha",
      child: '["Beta"]',
      key: "summary"
    });
    expect(rejected.ok).toBe(false);
    expect(String(rejected.error)).toContain("child not found");
  });

  it("type-checks against fresh frontmatter when metadata cache lags", async () => {
    await createBaseProject();
    const originalGetFileCache = cli.app.metadataCache.getFileCache;
    cli.app.metadataCache.getFileCache = (file) => {
      if (file.path === "PARA/Projects/Alpha/Alpha.md") return { frontmatter: {} };
      return originalGetFileCache(file);
    };

    try {
      const read = await cli.run("para-zk:read-project", { title: "Alpha", key: "frontmatter/status" });
      expect(read.value).toBe("in_progress");
    } finally {
      cli.app.metadataCache.getFileCache = originalGetFileCache;
    }
  });
});

describe("update-project", () => {
  it("sets and replaces the summary", async () => {
    await createBaseProject();
    const set = await cli.run("para-zk:update-project", {
      title: "Alpha",
      key: "summary",
      op: "set",
      value: "Draft summary"
    });
    expect(set.changed).toBe(true);

    const replace = await cli.run("para-zk:update-project", {
      title: "Alpha",
      key: "summary",
      op: "replace",
      match: "Draft",
      with: "Final"
    });
    expect(replace.matches).toBe(1);

    const read = await cli.run("para-zk:read-project", { title: "Alpha", key: "summary" });
    expect(read.value).toBe("Final summary");

    const content = cli.app.readPath("PARA/Projects/Alpha/Alpha.md") ?? "";
    expect(content).toContain("# Summary\n```para-zk-latest-retro-summary\n```\nFinal summary\n\n# Goals");
    expect(content).not.toContain("Final summary\n\n\n# Goals");
  });

  it("rejects the operation alias", async () => {
    await createBaseProject();
    const rejected = await cli.run("para-zk:update-project", {
      title: "Alpha",
      key: "summary",
      operation: "set",
      value: "x"
    });
    expect(rejected.ok).toBe(false);
    expect(String(rejected.error)).toContain("Use op instead of operation");
  });

  it("rejects updates to the read-only children map", async () => {
    await createBaseProject();
    const rejected = await cli.run("para-zk:update-project", {
      title: "Alpha",
      key: "children",
      op: "set",
      value: "x"
    });
    expect(rejected.ok).toBe(false);
    expect(String(rejected.error)).toContain("read-only");
  });

  it("updates aliases frontmatter", async () => {
    await createBaseProject();
    const update = await cli.run("para-zk:update-project", {
      title: "Alpha",
      key: "frontmatter/aliases",
      op: "set",
      value_json: JSON.stringify([" Alpha Alias ", ""])
    });
    expect(update.changed).toBe(true);

    const read = await cli.run("para-zk:read-project", { title: "Alpha", key: "frontmatter/aliases" });
    expect(read.value).toEqual(["Alpha Alias"]);
  });

  it("normalizes scalar aliases updates to a one-item list and clears blank values", async () => {
    await createBaseProject();
    const update = await cli.run("para-zk:update-project", {
      title: "Alpha",
      key: "frontmatter/aliases",
      op: "set",
      value: "Alpha Alias"
    });
    expect(update.changed).toBe(true);

    const read = await cli.run("para-zk:read-project", { title: "Alpha", key: "frontmatter/aliases" });
    expect(read.value).toEqual(["Alpha Alias"]);

    const clear = await cli.run("para-zk:update-project", {
      title: "Alpha",
      key: "frontmatter/aliases",
      op: "set",
      value: ""
    });
    expect(clear.changed).toBe(true);

    const cleared = await cli.run("para-zk:read-project", { title: "Alpha", key: "frontmatter/aliases" });
    expect(cleared.value).toEqual([]);
  });
});

describe("update-project areas (list frontmatter)", () => {
  it("adds and removes one area by title without restating the whole list", async () => {
    await createBaseProject(); // Alpha: areas AI + Software
    await cli.run("para-zk:create-area", { title: "Photos", open: "false" });

    const added = await cli.run("para-zk:update-project", {
      title: "Alpha",
      key: "frontmatter/areas",
      op: "append",
      value: "Photos"
    });
    expect(added.ok).toBe(true);
    expect(added.changed).toBe(true);

    const afterAdd = await cli.run("para-zk:read-project", { title: "Alpha", key: "frontmatter/areas" });
    const links = afterAdd.value as string[];
    expect(links.length).toBe(3);
    // the title was resolved to a canonical link, not stored as the bare title
    expect(links.some((link) => link.includes("|Photos]]"))).toBe(true);
    expect(links).not.toContain("Photos");

    // append of an already-present area is idempotent
    const again = await cli.run("para-zk:update-project", {
      title: "Alpha",
      key: "frontmatter/areas",
      op: "append",
      value: "Photos"
    });
    expect(again.changed).toBe(false);

    // remove one by title, leaving the rest
    const removed = await cli.run("para-zk:update-project", {
      title: "Alpha",
      key: "frontmatter/areas",
      op: "delete",
      value: "Software"
    });
    expect(removed.changed).toBe(true);
    const afterDelete = await cli.run("para-zk:read-project", { title: "Alpha", key: "frontmatter/areas" });
    const remaining = afterDelete.value as string[];
    expect(remaining.length).toBe(2);
    expect(remaining.some((link) => link.includes("|Software]]"))).toBe(false);
  });

  it("rejects an unknown area title and a non-list op", async () => {
    await createBaseProject();
    const badTitle = await cli.run("para-zk:update-project", {
      title: "Alpha",
      key: "frontmatter/areas",
      op: "append",
      value: "Nope"
    });
    expect(badTitle.ok).toBe(false);
    expect(String(badTitle.error)).toContain("area not found");

    const badOp = await cli.run("para-zk:update-project", {
      title: "Alpha",
      key: "frontmatter/areas",
      op: "insert",
      value: "AI"
    });
    expect(badOp.ok).toBe(false);
    expect(String(badOp.error)).toContain("op=set|append|prepend|delete");
  });
});
