import { beforeEach, describe, expect, it } from "vitest";
import { createCliHarness, type CliHarness } from "../harness/cli";

let cli: CliHarness;

beforeEach(() => {
  cli = createCliHarness();
});

describe("describe", () => {
  it("describes a single surface type with compact read keys and op-detailed write keys", async () => {
    const result = await cli.run("para-zk:describe", { type: "project" });

    expect(result.ok).toBe(true);
    expect(result).not.toHaveProperty("command");
    expect(result).not.toHaveProperty("pluginId");
    expect(result).not.toHaveProperty("locale");
    expect(result).not.toHaveProperty("types");

    const surfaces = result.surfaces as Array<Record<string, unknown>>;
    expect(surfaces).toHaveLength(1);
    const project = surfaces[0];
    expect(project.type).toBe("project");
    const addressing = project.addressing as { addressable: boolean; create: string; createInputs: string[] };
    expect(addressing.addressable).toBe(true);
    expect(addressing.create).toBe("para-zk:create-project");
    expect(addressing.createInputs).toEqual(expect.arrayContaining(["title", "alias"]));
    expect(project).not.toHaveProperty("body");
    expect(project).not.toHaveProperty("children");
    expect(project.frontmatterKeys).toEqual(expect.arrayContaining(["aliases", "status", "priority"]));
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
      "frontmatter/{aliases|status|priority|start_date|due_date|done_date}=set",
      "frontmatter/areas=set|append|prepend|delete",
      "summary=set|append|prepend|replace",
      "goals=set|append|prepend|replace",
      "tasks=insert",
      "tasks/<id>=delete",
      "tasks/<id>/<field>=set",
      "references=insert",
      "references/<i>=delete",
      "references/<i>/{link|description}=set"
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
    // scope sets the boundary: PARA-ZK's typed ops vs raw vault ops left to the host,
    // and names created/updated as not writable here.
    expect(String(all.scope)).toContain("optsidian");
    expect(String(all.scope)).toContain("created");
    // A cold caller learns the inline-citation convention from scope alone.
    expect(String(all.scope)).toContain("PZ[n]");
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
    expect(workflows.map((w) => w.command)).not.toContain("para-zk:add-reference");
    const createChild = workflows.find((w) => w.command === "para-zk:create-child");
    expect(createChild?.inputs).toEqual(expect.arrayContaining(["type", "root_type", "root_title", "relpath", "title"]));
    expect(workflows.map((w) => w.command)).toEqual(
      expect.arrayContaining(["para-zk:read-child", "para-zk:update-child", "para-zk:rename-child", "para-zk:delete-child", "para-zk:capture-journal", "para-zk:distill-spark", "para-zk:create-from-digest"])
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
    const resourceAddressing = resource.addressing as { createInputs: string[] };
    expect(resourceAddressing.createInputs).toEqual(expect.arrayContaining(["title", "alias"]));
    expect(resource.frontmatterKeys).toEqual(["aliases", "url", "first_author", "license", "kind"]);
    expect(resource.readKeys).toEqual(["frontmatter", "references", "backlinks", "body"]);
    expect(resource.writeKeys).toEqual([
      "frontmatter/{aliases|url|first_author|license|kind}=set",
      "references=insert",
      "references/<i>=delete",
      "references/<i>/{link|description}=set",
      "body=set|append|prepend|replace"
    ]);
    expect(resource.collections).toEqual({
      references: "reference",
      backlinks: "backlink"
    });
    expect(resource.readKeys).not.toEqual(expect.arrayContaining(["overview"]));

    const sourceResult = await cli.run("para-zk:describe", { type: "zk_digest" });
    const source = (sourceResult.surfaces as Array<Record<string, unknown>>)[0];
    const sourceAddressing = source.addressing as { createInputs: string[] };
    expect(sourceAddressing.createInputs).toEqual(expect.arrayContaining(["title", "alias", "kind"]));
    expect(source.frontmatterKeys).toEqual(["sourceTitle", "url", "first_author", "published"]);
    expect(source.readKeys).toEqual(["frontmatter", "references", "backlinks", "body"]);
    expect(source.writeKeys).toEqual([
      "frontmatter/{sourceTitle|url|first_author|published}=set",
      "references=insert",
      "references/<i>=delete",
      "references/<i>/{link|description}=set",
      "body=set|append|prepend|replace"
    ]);
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

    const permanentResult = await cli.run("para-zk:describe", { type: "zk_permanent" });
    const permanent = (permanentResult.surfaces as Array<Record<string, unknown>>)[0];
    const permanentAddressing = permanent.addressing as { createInputs: string[] };
    expect(permanentAddressing.createInputs).toEqual(expect.arrayContaining(["title", "alias", "kind"]));

    const sparkResult = await cli.run("para-zk:describe", { type: "zk_spark" });
    const spark = (sparkResult.surfaces as Array<Record<string, unknown>>)[0];
    const sparkAddressing = spark.addressing as { createInputs: string[] };
    expect(sparkAddressing.createInputs).toEqual(expect.arrayContaining(["title", "alias", "kind"]));
  });

  it("marks subnote as create-able but not directly addressable, and advertises area nesting", async () => {
    const result = await cli.run("para-zk:describe", { type: "subnote" });
    const subnote = (result.surfaces as Array<Record<string, unknown>>)[0];
    const addressing = subnote.addressing as { addressable: boolean; addressVia?: string; create: string; createInputs: string[] };
    expect(addressing.addressable).toBe(false);
    expect(addressing.addressVia).toContain("*-child commands");
    expect(addressing.addressVia).toContain("root_type");
    expect(addressing.addressVia).toContain("relpath");
    expect(addressing.create).toBe("para-zk:create-child");
    // createInputs come from the real create command's options (no obsidian help needed).
    expect(addressing.createInputs).toEqual(expect.arrayContaining(["type", "root_type", "root_title", "relpath", "title", "subnote_type", "body"]));
    // Subnotes carry a references registry (rendered as a managed block), so the surface
    // exposes it for read-child/update-child key=references, matching project/area/etc.
    expect(subnote.readKeys).toEqual(expect.arrayContaining(["references"]));
    expect(subnote.writeKeys).toEqual(expect.arrayContaining(["references=insert"]));
    expect(subnote.collections).toMatchObject({ references: "reference" });

    // A nested area is not a distinct type — it is an `area` child. The `area`
    // surface stays directly addressable for root areas and points nested-area
    // operations at the *-child commands.
    const area = (await cli.run("para-zk:describe", { type: "area" })).surfaces as Array<Record<string, unknown>>;
    const areaAddressing = area[0].addressing as { addressable: boolean; addressVia?: string; create: string; createInputs: string[]; selectors?: string[] };
    expect(areaAddressing.addressable).toBe(true);
    expect(areaAddressing.create).toBe("para-zk:create-area");
    expect(areaAddressing.createInputs).toEqual(expect.arrayContaining(["title"]));
    expect(areaAddressing.createInputs).not.toEqual(expect.arrayContaining(["parent_title"]));
    expect(areaAddressing.selectors).not.toEqual(expect.arrayContaining(["child"]));
    expect(areaAddressing.addressVia).toContain("Nested areas");
    expect(areaAddressing.addressVia).toContain("*-child");

    // `subarea` is no longer a stored/surface type.
    const bad = await cli.run("para-zk:describe", { type: "subarea" });
    expect(bad.ok).toBe(false);
    expect(String(bad.error)).toContain("unknown surface type");
  });
});
