import { beforeEach, describe, expect, it } from "vitest";
import { createCliHarness, type CliHarness } from "../harness/cli";

let cli: CliHarness;

beforeEach(() => {
  cli = createCliHarness();
});

describe("rename-project", () => {
  it("rejects the newTitle alias", async () => {
    await cli.run("para-zk:create-project", { title: "Old", open: "false" });
    const rejected = await cli.run("para-zk:rename-project", { title: "Old", newTitle: "New" });
    expect(rejected.ok).toBe(false);
    expect(String(rejected.error)).toContain("Use new_title instead of newTitle");
  });

  it("moves the folder, child notes, and source-scoped retro", async () => {
    await cli.run("para-zk:create-project", { title: "Old", open: "false" });
    await cli.run("para-zk:create-child", {
      type: "subnote",
      title: "Child",
      root_type: "project",
      root_title: "Old",
      subnote_type: "free",
      open: "false"
    });
    const retro = await cli.run("para-zk:create-retro", {
      source_type: "project",
      source_title: "Old",
      date: "2026-06-01",
      open: "false"
    });

    const renamed = await cli.run("para-zk:rename-project", { title: "Old", new_title: "New" });
    expect(renamed.ok).toBe(true);
    expect(renamed.path).toBe("PARA/Projects/New/New.md");
    expect(cli.app.readPath("PARA/Projects/New/New.md")).toBeDefined();
    expect(cli.app.readPath("PARA/Projects/New/Child.md")).toBeDefined();
    expect(cli.app.readPath("PARA/Projects/Old/Old.md")).toBeUndefined();

    const renamedRetros = renamed.renamedRetros as Array<{ fromPath: string; toPath: string }> | undefined;
    expect(renamedRetros?.some((r) => r.fromPath === retro.path)).toBe(true);
  });

  it("renames a child subnote via child drill instead of the container", async () => {
    await cli.run("para-zk:create-project", { title: "Host", open: "false" });
    await cli.run("para-zk:create-child", {
      type: "subnote",
      title: "Draft",
      root_type: "project",
      root_title: "Host",
      subnote_type: "free",
      open: "false"
    });
    const renamed = await cli.run("para-zk:rename-child", { root_type: "project", root_title: "Host", title: "Draft", new_title: "Final" });
    expect(renamed.ok).toBe(true);
    expect(cli.app.readPath("PARA/Projects/Host/Final.md")).toBeDefined();
    expect(cli.app.readPath("PARA/Projects/Host/Draft.md")).toBeUndefined();
    expect(cli.app.readPath("PARA/Projects/Host/Host.md")).toBeDefined();
  });
});

describe("rename-resource", () => {
  it("renames a flat note in place", async () => {
    await cli.run("para-zk:create-resource", { title: "Source", open: "false" });
    const renamed = await cli.run("para-zk:rename-resource", { title: "Source", new_title: "Renamed source" });
    expect(renamed.ok).toBe(true);
    expect(renamed.path).toBe("PARA/Resources/Renamed source.md");
    expect(cli.app.readPath("PARA/Resources/Source.md")).toBeUndefined();
  });

  it("renames a nested resource in its current folder", async () => {
    await cli.run("para-zk:create-resource", { title: "AI/Foo", open: "false" });

    const renamed = await cli.run("para-zk:rename-resource", {
      title: "AI/Foo",
      new_title: "Bar"
    });

    expect(renamed.ok).toBe(true);
    expect(renamed.path).toBe("PARA/Resources/AI/Bar.md");
    expect(renamed.fromPath).toBe("PARA/Resources/AI/Foo.md");
    expect(renamed.toPath).toBe("PARA/Resources/AI/Bar.md");
    expect(cli.app.readPath("PARA/Resources/AI/Bar.md")).toBeDefined();
    expect(cli.app.readPath("PARA/Resources/AI/Foo.md")).toBeUndefined();
    expect(cli.app.readPath("PARA/Resources/Bar.md")).toBeUndefined();
  });

  it("rejects slash new_title because folder moves are native file moves", async () => {
    await cli.run("para-zk:create-resource", { title: "AI/Foo", open: "false" });

    const rejected = await cli.run("para-zk:rename-resource", {
      title: "AI/Foo",
      new_title: "X/Y"
    });

    expect(rejected.ok).toBe(false);
    expect(String(rejected.error)).toContain("bare basename");
    expect(String(rejected.error)).toContain("optsidian");
    expect(String(rejected.error)).toContain("move");
    expect(cli.app.readPath("PARA/Resources/AI/Foo.md")).toBeDefined();
  });
});
