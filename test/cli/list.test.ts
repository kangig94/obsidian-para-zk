import { beforeEach, describe, expect, it } from "vitest";
import { createCliHarness, type CliHarness } from "../harness/cli";

let cli: CliHarness;

beforeEach(() => {
  cli = createCliHarness();
});

describe("list", () => {
  it("lists notes of a type with title/type/path and a pagination envelope", async () => {
    await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });
    await cli.run("para-zk:create-project", { title: "Beta", open: "false" });
    await cli.run("para-zk:create-area", { title: "Ops", open: "false" });

    const res = await cli.run("para-zk:list", { type: "project" });
    const items = res.items as Array<{ title: string; type: string; path: string }>;
    expect(res).toMatchObject({ ok: true, count: 2, offset: 0, returned: 2, has_more: false });
    expect(items.map((i) => i.title).sort()).toEqual(["Alpha", "Beta"]);
    expect(items.every((i) => i.type === "project")).toBe(true);
    expect(items.every((i) => typeof i.path === "string")).toBe(true);
  });

  it("includes nested areas in `list type=area` (nested areas store type=area)", async () => {
    await cli.run("para-zk:create-area", { title: "AI", open: "false" });
    await cli.run("para-zk:create-child", { type: "area", root_type: "area", root_title: "AI", title: "Vision", open: "false" });

    const res = await cli.run("para-zk:list", { type: "area" });
    const items = res.items as Array<{ title: string; type: string }>;
    expect(items.map((i) => i.title).sort()).toEqual(["AI", "Vision"]);
    expect(items.every((i) => i.type === "area")).toBe(true);
  });

  it("treats zk as the family spanning all stored ZK kinds", async () => {
    await cli.run("para-zk:create-zk", { title: "S", kind: "spark", open: "false" });
    await cli.run("para-zk:create-zk", { title: "P", kind: "permanent", open: "false" });

    const res = await cli.run("para-zk:list", { type: "zk" });
    expect(res.count).toBe(2);
    expect((res.items as Array<{ type: string }>).map((i) => i.type).sort()).toEqual(["permanent", "spark"]);
  });

  it("filters by case-insensitive title query and paginates", async () => {
    await cli.run("para-zk:create-resource", { title: "Alpha Notes", open: "false" });
    await cli.run("para-zk:create-resource", { title: "Beta Notes", open: "false" });
    await cli.run("para-zk:create-resource", { title: "Gamma", open: "false" });

    const filtered = await cli.run("para-zk:list", { type: "resource", query: "notes" });
    expect(filtered.count).toBe(2);

    const page = await cli.run("para-zk:list", { type: "resource", offset: "1", limit: "1" });
    expect(page).toMatchObject({ count: 3, offset: 1, limit: 1, returned: 1, has_more: true });
  });

  it("excludes archived by default and lists archived with archived=true", async () => {
    await cli.run("para-zk:create-project", { title: "Live", open: "false" });
    await cli.run("para-zk:create-project", { title: "Old", open: "false" });
    await cli.run("para-zk:update-project", { title: "Old", key: "frontmatter/status", op: "set", value: "archived" });

    const active = await cli.run("para-zk:list", { type: "project" });
    expect((active.items as Array<{ title: string }>).map((i) => i.title)).toEqual(["Live"]);

    const archived = await cli.run("para-zk:list", { type: "project", archived: "true" });
    expect((archived.items as Array<{ title: string }>).map((i) => i.title)).toEqual(["Old"]);
  });

  it("excludes managed template files even though they carry a type frontmatter", async () => {
    await cli.run("para-zk:create-resource", { title: "Real", open: "false" });
    await cli.app.vault.create("Templates/para-zk/template_resource.md", "---\ntype: resource\n---\n# Template\n");

    const res = await cli.run("para-zk:list", { type: "resource" });
    const items = res.items as Array<{ title: string; path: string }>;
    expect(items.map((i) => i.title)).toEqual(["Real"]);
    expect(items.some((i) => i.path.startsWith("Templates/"))).toBe(false);
  });

  it("lists all PARA-ZK notes when type is omitted", async () => {
    await cli.run("para-zk:create-project", { title: "P", open: "false" });
    await cli.run("para-zk:create-area", { title: "A", open: "false" });
    await cli.run("para-zk:create-resource", { title: "R", open: "false" });

    const res = await cli.run("para-zk:list", {});
    expect(res.count).toBe(3);
  });
});
