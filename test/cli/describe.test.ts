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

  it("lists surface types and global collection filters; rejects unknown types", async () => {
    const all = await cli.run("para-zk:describe");
    expect(all.ok).toBe(true);
    expect(all).not.toHaveProperty("surfaces");
    expect(all.surfaceTypes).toEqual(
      expect.arrayContaining(["project", "area", "resource", "retro", "note"])
    );
    expect((all.surfaceTypes as unknown[]).length).toBeGreaterThan(1);
    expect(all.collectionFilters).toMatchObject({
      task: expect.arrayContaining(["due_before"]),
      backlink: expect.arrayContaining(["type"])
    });

    const retro = await cli.run("para-zk:describe", { type: "retro" });
    expect(retro.collectionFilters).toEqual({
      backlink: ["offset", "limit", "query", "type"]
    });

    const bad = await cli.run("para-zk:describe", { type: "bad" });
    expect(bad.ok).toBe(false);
    expect(String(bad.error)).toContain("unknown surface type");
  });

  it("describes resource and ZK source as free-form body surfaces", async () => {
    const resourceResult = await cli.run("para-zk:describe", { type: "resource" });
    const resource = (resourceResult.surfaces as Array<Record<string, unknown>>)[0];
    expect(resource.readKeys).toEqual(["references", "backlinks", "body"]);
    expect(resource.writeKeys).toEqual(["references", "body"]);
    expect(resource.collections).toEqual({
      references: "reference",
      backlinks: "backlink"
    });
    expect(resource.readKeys).not.toEqual(expect.arrayContaining(["overview"]));

    const sourceResult = await cli.run("para-zk:describe", { type: "zk_source" });
    const source = (sourceResult.surfaces as Array<Record<string, unknown>>)[0];
    expect(source.frontmatterKeys).toEqual(["sourceTitle", "authors", "published", "url"]);
    expect(source.readKeys).toEqual(["frontmatter", "references", "backlinks", "body"]);
    expect(source.writeKeys).toEqual(["frontmatter", "references", "body"]);
    expect(source.collections).toEqual({
      references: "reference",
      backlinks: "backlink"
    });
    expect(source.readKeys).not.toEqual(expect.arrayContaining([
      "highlight_block",
      "summary",
      "insight",
      "evidence"
    ]));
  });
});
