import { beforeEach, describe, expect, it } from "vitest";
import { createCliHarness, type CliHarness } from "../harness/cli";

let cli: CliHarness;

beforeEach(() => {
  cli = createCliHarness();
});

describe("list", () => {
  it("lists a single type as root-relative names with the root stated once", async () => {
    await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });
    await cli.run("para-zk:create-project", { title: "Beta", open: "false" });
    await cli.run("para-zk:create-area", { title: "Ops", open: "false" });

    const res = await cli.run("para-zk:list", { type: "project" });
    expect(res).toMatchObject({ ok: true, count: 2, offset: 0, returned: 2, has_more: false, type: "project", root: "PARA/Projects" });
    // Folder-style notes (PARA/Projects/Alpha/Alpha.md) collapse to their address name.
    expect((res.items as string[]).slice().sort()).toEqual(["Alpha", "Beta"]);
  });

  it("includes nested areas as tree-relative names (nested areas store type=area)", async () => {
    await cli.run("para-zk:create-area", { title: "AI", open: "false" });
    await cli.run("para-zk:create-child", { type: "area", root_type: "area", root_title: "AI", title: "Vision", open: "false" });

    const res = await cli.run("para-zk:list", { type: "area" });
    expect(res.root).toBe("PARA/Areas");
    expect((res.items as string[]).slice().sort()).toEqual(["AI", "AI/Vision"]);
  });

  it("treats zk as a multi-root family, keeping {name,type} per item", async () => {
    await cli.run("para-zk:create-zk", { title: "S", kind: "spark", open: "false" });
    await cli.run("para-zk:create-zk", { title: "P", kind: "permanent", open: "false" });

    const res = await cli.run("para-zk:list", { type: "zk" });
    expect(res.count).toBe(2);
    expect(res.root).toBeUndefined();
    const items = res.items as Array<{ name: string; type: string }>;
    expect(items.map((i) => i.type).sort()).toEqual(["permanent", "spark"]);
    expect(items.every((i) => i.name.startsWith("ZK/"))).toBe(true);
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

  it("query matches the address path so query=<subpath>/ scopes to a subfolder", async () => {
    await cli.run("para-zk:create-llm-wiki", { title: "AI/Diffusion Policy" });
    await cli.run("para-zk:create-llm-wiki", { title: "AI/PPO" });
    await cli.run("para-zk:create-llm-wiki", { title: "Robotics/TWIST" });

    const scoped = await cli.run("para-zk:list", { type: "llm-wiki", query: "AI/" });
    const items = scoped.items as string[];
    // AI/ scopes to that domain (Diffusion Policy, PPO, and the auto-minted index).
    expect(scoped.count).toBe(3);
    expect(items).toContain("AI/index");
    expect(items.some((name) => name.startsWith("Robotics/"))).toBe(false);

    // A bare title substring still matches (basename is part of the address path).
    const byTitle = await cli.run("para-zk:list", { type: "llm-wiki", query: "policy" });
    expect((byTitle.items as string[])).toContain("AI/Diffusion Policy");
  });

  it("excludes archived by default; archived notes list under their archive location", async () => {
    await cli.run("para-zk:create-project", { title: "Live", open: "false" });
    await cli.run("para-zk:create-project", { title: "Old", open: "false" });
    await cli.run("para-zk:update-project", { title: "Old", key: "frontmatter/status", op: "set", value: "archived" });

    const active = await cli.run("para-zk:list", { type: "project" });
    expect(active.items).toEqual(["Live"]);

    // Archived notes move under archivesFolder (not the type root), so they list as {name,type}.
    const archived = await cli.run("para-zk:list", { type: "project", archived: "true" });
    expect(archived.archived).toBe(true);
    expect(archived.root).toBeUndefined();
    const old = (archived.items as Array<{ name: string; type: string }>)[0];
    expect(old.type).toBe("project");
    expect(old.name.startsWith("PARA/Archives")).toBe(true);
    expect(old.name.split("/").pop()).toBe("Old");
  });

  it("excludes managed template files even though they carry a type frontmatter", async () => {
    await cli.run("para-zk:create-resource", { title: "Real", open: "false" });
    await cli.app.vault.create("Templates/para-zk/template_resource.md", "---\ntype: resource\n---\n# Template\n");

    const res = await cli.run("para-zk:list", { type: "resource" });
    expect(res.items).toEqual(["Real"]);
  });

  it("lists all PARA-ZK notes as {name,type} when type is omitted", async () => {
    await cli.run("para-zk:create-project", { title: "P", open: "false" });
    await cli.run("para-zk:create-area", { title: "A", open: "false" });
    await cli.run("para-zk:create-resource", { title: "R", open: "false" });
    await cli.run("para-zk:create-llm-wiki", { title: "AI/W", open: "false" });

    const res = await cli.run("para-zk:list", {});
    // create-llm-wiki AI/W also auto-mints the AI/index hub -> 5 notes, two of them llm-wiki.
    expect(res.count).toBe(5);
    expect(res.root).toBeUndefined();
    expect((res.items as Array<{ type: string }>).map((i) => i.type).sort()).toEqual(["area", "llm-wiki", "llm-wiki", "project", "resource"]);
    expect(res.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "LLM-Wiki/AI/W", type: "llm-wiki" }),
      expect.objectContaining({ name: "LLM-Wiki/AI/index", type: "llm-wiki" })
    ]));
  });

  it("lists active llm-wiki notes relative to the wiki root", async () => {
    await cli.run("para-zk:create-llm-wiki", { title: "AI/Wiki", open: "false" });
    await cli.app.vault.create("PARA/Archives/LLM-Wiki/Archived.md", "---\ntype: llm-wiki\n---\nArchived only\n");

    const res = await cli.run("para-zk:list", { type: "llm-wiki" });
    // AI/Wiki also auto-mints the AI/index hub.
    expect(res).toMatchObject({ ok: true, count: 2, returned: 2, type: "llm-wiki", root: "LLM-Wiki" });
    expect((res.items as string[]).slice().sort()).toEqual(["AI/Wiki", "AI/index"]);
  });

  it("reports an empty single-type listing with root and empty items", async () => {
    const res = await cli.run("para-zk:list", { type: "project" });
    expect(res).toMatchObject({ ok: true, count: 0, returned: 0, type: "project", root: "PARA/Projects" });
    expect(res.items).toEqual([]);
  });

  it("lists subnotes as {name,type} (folder-spanning, no single root)", async () => {
    await cli.app.vault.create("PARA/Projects/Proj/Meeting.md", "---\ntype: subnote\n---\nbody\n");

    const res = await cli.run("para-zk:list", { type: "subnote" });
    expect(res.root).toBeUndefined();
    expect(res.items).toEqual([{ name: "PARA/Projects/Proj/Meeting", type: "subnote" }]);
  });

  it("lists journals as {name,type} (addressed by date, not title)", async () => {
    await cli.app.vault.create("Journal/2026-06-15.md", "---\ntype: journal\n---\nentry\n");

    const res = await cli.run("para-zk:list", { type: "journal" });
    expect(res.root).toBeUndefined();
    expect(res.items).toEqual([{ name: "Journal/2026-06-15", type: "journal" }]);
  });

  it("round-trips a single-type name straight back as title=", async () => {
    await cli.run("para-zk:create-resource", { title: "Round Trip", open: "false" });

    const res = await cli.run("para-zk:list", { type: "resource" });
    const name = (res.items as string[])[0];
    const read = await cli.run("para-zk:read-resource", { title: name });
    expect(read.ok).toBe(true);
  });
});
