import { beforeEach, describe, expect, it } from "vitest";
import { createCliHarness, type CliHarness } from "../harness/cli";

let cli: CliHarness;

beforeEach(() => {
  cli = createCliHarness();
});

describe("describe", () => {
  it("returns conventions as a fetch-once command split from lean describe", async () => {
    const result = await cli.run("para-zk:conventions");

    expect(result.ok).toBe(true);
    expect(result.command).toBe("para-zk:conventions");
    expect(Object.keys(result).sort()).toEqual([
      "citation",
      "command",
      "compounding",
      "ok",
      "scope",
      "vault"
    ]);
    expect(String(result.vault)).toContain("LLM-maintained PARA + Zettelkasten wiki");
    expect(String(result.scope)).toContain("host's file/search tools");
    expect(String(result.scope)).toContain("created/updated");
    expect(String(result.citation)).toContain("PZ[<id>]");
    expect(String(result.citation)).toContain("PZ[<id>#<section>]");
    expect(String(result.citation)).toContain("Bare PZ[...] text");
    expect(String(result.citation)).toContain("positional `PZ[0]` are not supported");
    expect(String(result.compounding)).toContain("propose filing it back");
    expect(String(result.compounding)).toContain("write only on the user's confirmation");
  });

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
      "references=insert|backfill",
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
    expect(Object.keys(all).sort()).toEqual([
      "collectionFilters",
      "conventions",
      "ok",
      "safety",
      "surfaceTypes",
      "workflows"
    ]);
    expect(all).not.toHaveProperty("surfaces");
    expect(all).not.toHaveProperty("vault");
    expect(all).not.toHaveProperty("scope");
    expect(all.conventions).toBe("para-zk:conventions");
    expect(String(all.safety)).toContain("translating");
    expect(String(all.safety)).toContain("storing full source texts");
    expect(String(all.safety)).toContain("do NOT refuse");
    expect(String(all.safety)).toContain("copyright");
    expect(all.surfaceTypes).toEqual(
      expect.arrayContaining(["project", "area", "resource", "llm-wiki", "retro", "note"])
    );
    expect((all.surfaceTypes as unknown[]).length).toBeGreaterThan(1);
    expect(all.collectionFilters).toMatchObject({
      task: expect.arrayContaining(["due_before"]),
      backlink: expect.arrayContaining(["type"])
    });

    // Named (non-surface) workflows are discoverable from the index, with inputs.
    const workflows = all.workflows as Array<{ command: string; inputs: string[] }>;
    expect(workflows.find((w) => w.command === "para-zk:conventions")?.inputs).toEqual([]);
    expect(workflows.map((w) => w.command)).not.toContain("para-zk:add-reference");
    const audit = workflows.find((w) => w.command === "para-zk:audit");
    expect(audit?.inputs).toEqual(expect.arrayContaining(["check", "severity", "type", "offset", "limit", "fix"]));
    const createChild = workflows.find((w) => w.command === "para-zk:create-child");
    expect(createChild?.inputs).toEqual(expect.arrayContaining(["type", "root_type", "root_title", "relpath", "title"]));
    expect(workflows.map((w) => w.command)).toEqual(
      expect.arrayContaining(["para-zk:audit", "para-zk:read-child", "para-zk:update-child", "para-zk:rename-child", "para-zk:delete-child", "para-zk:capture-journal", "para-zk:distill-spark", "para-zk:create-from-digest"])
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
    const resourceAddressing = resource.addressing as { addressVia?: string; createInputs: string[] };
    expect(resourceAddressing.createInputs).toEqual(expect.arrayContaining(["title", "alias"]));
    expect(resourceAddressing.addressVia).toContain("Resources-relative path");
    expect(resourceAddressing.addressVia).toContain("title=\"AI/Foo\"");
    expect(resourceAddressing.addressVia).toContain("ambiguous if duplicated");
    expect(resource.frontmatterKeys).toEqual(["aliases", "url", "first_author", "license", "kind"]);
    expect(resource.readKeys).toEqual(["frontmatter", "references", "backlinks", "body"]);
    expect(resource.writeKeys).toEqual([
      "frontmatter/{aliases|url|first_author|license|kind}=set",
      "references=insert|backfill",
      "references/<i>=delete",
      "references/<i>/{link|description}=set",
      "body=set|append|prepend|replace"
    ]);
    expect(resource.collections).toEqual({
      references: "reference",
      backlinks: "backlink"
    });
    expect(resource.readKeys).not.toEqual(expect.arrayContaining(["overview"]));

    const wikiResult = await cli.run("para-zk:describe", { type: "llm-wiki" });
    const wiki = (wikiResult.surfaces as Array<Record<string, unknown>>)[0];
    const wikiAddressing = wiki.addressing as {
      selectors: string[];
      create: string;
      read: string;
      update: string;
      createInputs: string[];
      rename: boolean;
      addressVia?: string;
    };
    expect(wikiAddressing.selectors).toEqual(["title"]);
    expect(wikiAddressing.create).toBe("para-zk:create-llm-wiki");
    expect(wikiAddressing.read).toBe("para-zk:read-llm-wiki");
    expect(wikiAddressing.update).toBe("para-zk:update-llm-wiki");
    expect(wikiAddressing.createInputs).toEqual(expect.arrayContaining(["title", "alias", "body", "by"]));
    expect(wikiAddressing.rename).toBe(true);
    expect(wikiAddressing.addressVia).toContain("LLM-Wiki-relative path");
    expect(wikiAddressing.addressVia).toContain("title=\"AI/Foo\"");
    expect(wiki.frontmatterKeys).toEqual(["aliases", "created_by", "updated_by"]);
    expect(wiki.readKeys).toEqual(["frontmatter", "references", "backlinks", "body"]);
    expect(wiki.writeKeys).toEqual([
      "frontmatter/{aliases}=set",
      "references=insert|backfill",
      "references/<i>=delete",
      "references/<i>/{link|description}=set",
      "body=set|append|prepend|replace"
    ]);
    expect(wiki.collections).toEqual({
      references: "reference",
      backlinks: "backlink"
    });

    const sourceResult = await cli.run("para-zk:describe", { type: "digest" });
    const source = (sourceResult.surfaces as Array<Record<string, unknown>>)[0];
    const sourceAddressing = source.addressing as { createInputs: string[] };
    expect(sourceAddressing.createInputs).toEqual(expect.arrayContaining(["title", "alias", "kind"]));
    expect(source.frontmatterKeys).toEqual(["sourceTitle", "url", "first_author", "published"]);
    expect(source.readKeys).toEqual(["frontmatter", "references", "backlinks", "body"]);
    expect(source.writeKeys).toEqual([
      "frontmatter/{sourceTitle|url|first_author|published}=set",
      "references=insert|backfill",
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

    const permanentResult = await cli.run("para-zk:describe", { type: "permanent" });
    const permanent = (permanentResult.surfaces as Array<Record<string, unknown>>)[0];
    const permanentAddressing = permanent.addressing as { createInputs: string[] };
    expect(permanentAddressing.createInputs).toEqual(expect.arrayContaining(["title", "alias", "kind"]));

    const sparkResult = await cli.run("para-zk:describe", { type: "spark" });
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
    expect(subnote.writeKeys).toEqual(expect.arrayContaining(["references=insert|backfill"]));
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
