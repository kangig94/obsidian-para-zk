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
    expect((project.addressing as { addressable: boolean; create: string }).addressable).toBe(true);
    expect((project.addressing as { create: string }).create).toBe("para-zk:create-project");
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
      "references"
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
    // Orients a cold caller: the vault is a private, local, single-user store, so saved
    // content is personal use, not redistribution.
    expect(String(all.vault)).toContain("not redistribution");
    expect(all.surfaceTypes).toEqual(
      expect.arrayContaining(["project", "area", "resource", "retro", "note"])
    );
    expect((all.surfaceTypes as unknown[]).length).toBeGreaterThan(1);
    expect(all.collectionFilters).toMatchObject({
      task: expect.arrayContaining(["due_before"]),
      backlink: expect.arrayContaining(["type"])
    });

    // Named (non-surface) workflows are discoverable from the index, with inputs.
    const workflows = all.workflows as Array<{ command: string; inputs: string[] }>;
    const addReference = workflows.find((w) => w.command === "para-zk:add-reference");
    expect(addReference?.inputs).toEqual(expect.arrayContaining(["type", "title", "target"]));
    expect(workflows.map((w) => w.command)).toEqual(
      expect.arrayContaining(["para-zk:capture-journal", "para-zk:distill-spark", "para-zk:create-from-digest"])
    );

    const retro = await cli.run("para-zk:describe", { type: "retro" });
    expect(retro.collectionFilters).toEqual({
      backlink: ["offset", "limit", "query", "type"]
    });

    const bad = await cli.run("para-zk:describe", { type: "bad" });
    expect(bad.ok).toBe(false);
    expect(String(bad.error)).toContain("unknown surface type");
  });

  it("describes resource and ZK digest as free-form body surfaces", async () => {
    const resourceResult = await cli.run("para-zk:describe", { type: "resource" });
    const resource = (resourceResult.surfaces as Array<Record<string, unknown>>)[0];
    expect(resource.frontmatterKeys).toEqual(["url", "first_author", "license", "kind"]);
    expect(resource.readKeys).toEqual(["frontmatter", "references", "backlinks", "body"]);
    expect(resource.writeKeys).toEqual(["frontmatter", "references", "body"]);
    expect(resource.collections).toEqual({
      references: "reference",
      backlinks: "backlink"
    });
    expect(resource.readKeys).not.toEqual(expect.arrayContaining(["overview"]));

    const sourceResult = await cli.run("para-zk:describe", { type: "zk_digest" });
    const source = (sourceResult.surfaces as Array<Record<string, unknown>>)[0];
    expect(source.frontmatterKeys).toEqual(["sourceTitle", "url", "first_author", "published"]);
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

  it("marks subnote/subarea as create-able but not directly addressable", async () => {
    for (const type of ["subnote", "subarea"]) {
      const result = await cli.run("para-zk:describe", { type });
      const surface = (result.surfaces as Array<Record<string, unknown>>)[0];
      const addressing = surface.addressing as { addressable: boolean; addressVia?: string; create: string; createInputs: string[] };
      expect(addressing.addressable).toBe(false);
      expect(addressing.addressVia).toContain("child=");
      expect(addressing.create).toBe(`para-zk:create-${type}`);
      // createInputs come from the real create command's options (no obsidian help needed).
      expect(addressing.createInputs).toEqual(expect.arrayContaining(["title", "parent_title"]));
    }
    const subnote = (await cli.run("para-zk:describe", { type: "subnote" })).surfaces as Array<Record<string, unknown>>;
    expect((subnote[0].addressing as { createInputs: string[] }).createInputs).toEqual(
      expect.arrayContaining(["subnote_type", "body"])
    );
  });
});
