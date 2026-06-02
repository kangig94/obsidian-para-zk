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
      path: "PARA/Projects/Template Shape/Template Shape.md",
      open: "false"
    });
    expect(subnote.ok).toBe(true);
    const subnoteContent = cli.app.readPath("PARA/Projects/Template Shape/Template Child.md") ?? "";
    expect(subnoteContent).toContain("```para-zk-props\ntype: subnote\n```");
    expect(subnoteContent).not.toContain("```para-zk-managed");
    expect(subnoteContent.endsWith("\n\n")).toBe(false);
  });

  it("allocates a unique folder-style container for duplicate titles", async () => {
    await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });
    const duplicate = await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });
    expect(duplicate.path).toBe("PARA/Projects/Alpha 1/Alpha 1.md");

    const child = await cli.run("para-zk:create-subnote", {
      title: "Child",
      path: "PARA/Projects/Alpha 1/Alpha 1.md",
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
      path: "PARA/Projects/Alpha/Alpha.md",
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
    expect(read.available_keys).toEqual(expect.arrayContaining([
      "frontmatter",
      "summary",
      "goals",
      "tasks",
      "references",
      "backlinks",
      "children"
    ]));
    expect(read.available_keys).not.toContain("tasks/<id>");
    expect(read.tasks).toBeUndefined();
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
      path: "PARA/Projects/Alpha/Alpha.md",
      subnote_type: "meeting",
      open: "false"
    });
    const type = await cli.run("para-zk:read-project", {
      title: "Alpha",
      key: "children/Kickoff/frontmatter/subnote_type"
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
      "type: doc",
      "parent: \"[[PARA/Projects/Alpha.md|Alpha]]\"",
      "---",
      "Child body",
      ""
    ].join("\n"));

    const read = await cli.run("para-zk:read-project", {
      path: "PARA/Projects/Alpha.md",
      key: "children"
    });
    const children = read.value as Record<string, { path: string }>;
    expect(children.Child.path).toBe("PARA/Projects/Child.md");
    expect(children.Beta).toBeUndefined();

    const rejected = await cli.run("para-zk:read-project", {
      path: "PARA/Projects/Alpha.md",
      key: "children/Beta/summary"
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
});
