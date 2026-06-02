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
