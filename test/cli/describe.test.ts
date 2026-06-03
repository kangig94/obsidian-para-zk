import { beforeEach, describe, expect, it } from "vitest";
import { createCliHarness, type CliHarness } from "../harness/cli";

let cli: CliHarness;

beforeEach(() => {
  cli = createCliHarness();
});

describe("describe", () => {
  it("describes a single surface type with compact read and write keys", async () => {
    const result = await cli.run("para-zk:describe", { type: "project" });

    expect(result.ok).toBe(true);
    expect(result.command).toBe("para-zk:describe");
    expect(result).not.toHaveProperty("pluginId");
    expect(result).not.toHaveProperty("locale");
    expect(result).not.toHaveProperty("types");

    const surfaces = result.surfaces as Array<Record<string, unknown>>;
    expect(surfaces).toHaveLength(1);
    const project = surfaces[0];
    expect(project.type).toBe("project");
    expect(project).not.toHaveProperty("body");
    expect(project).not.toHaveProperty("children");
    expect(project.frontmatterKeys).toEqual(expect.arrayContaining(["status", "priority"]));
    expect(project.readKeys).toEqual([
      "frontmatter",
      "summary",
      "goals",
      "tasks",
      "references",
      "backlinks",
      "children"
    ]);
    expect(project.writeKeys).toEqual([
      "frontmatter",
      "summary",
      "goals",
      "tasks",
      "references",
      "children"
    ]);
    expect(project.collections).toEqual({
      tasks: "task",
      references: "reference",
      backlinks: "backlink"
    });
  });

  it("reports collection filters and rejects unknown surface types", async () => {
    const all = await cli.run("para-zk:describe");
    expect(all.ok).toBe(true);
    expect((all.surfaces as unknown[]).length).toBeGreaterThan(1);
    expect(all.collectionFilters).toMatchObject({
      task: expect.arrayContaining(["due_before"]),
      backlink: expect.arrayContaining(["type"])
    });
    const resource = (all.surfaces as Array<Record<string, unknown>>)
      .find((surface) => surface.type === "resource");
    expect(resource).not.toHaveProperty("frontmatterKeys");

    const retro = await cli.run("para-zk:describe", { type: "retro" });
    expect(retro.collectionFilters).toEqual({
      backlink: ["offset", "limit", "query", "type"]
    });

    const bad = await cli.run("para-zk:describe", { type: "bad" });
    expect(bad.ok).toBe(false);
    expect(String(bad.error)).toContain("unknown surface type");
  });
});
