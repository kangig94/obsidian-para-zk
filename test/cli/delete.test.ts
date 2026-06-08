import { beforeEach, describe, expect, it } from "vitest";
import { createCliHarness, type CliHarness } from "../harness/cli";

let cli: CliHarness;

beforeEach(() => {
  cli = createCliHarness();
});

describe("delete-project", () => {
  it("requires force=true when the folder holds child files", async () => {
    await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });
    await cli.run("para-zk:create-child", {
      type: "subnote",
      title: "Child",
      root_type: "project",
      root_title: "Alpha",
      subnote_type: "free",
      open: "false"
    });

    const rejected = await cli.run("para-zk:delete-project", { title: "Alpha" });
    expect(rejected.ok).toBe(false);
    expect(String(rejected.error)).toContain("force=true");
  });

  it("trashes the folder via core APIs with force=true", async () => {
    await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });
    await cli.run("para-zk:create-child", {
      type: "subnote",
      title: "Child",
      root_type: "project",
      root_title: "Alpha",
      subnote_type: "free",
      open: "false"
    });

    const deleted = await cli.run("para-zk:delete-project", { title: "Alpha", force: "true" });
    expect(deleted.ok).toBe(true);
    expect(deleted.trashed).toBe(true);
    expect(deleted.trashMethod).not.toBe("trash-explorer");
    expect(cli.app.readPath("PARA/Projects/Alpha/Alpha.md")).toBeUndefined();
    expect(cli.app.readPath("PARA/Projects/Alpha/Child.md")).toBeUndefined();
  });

  it("deletes a child subnote via child drill, leaving the container", async () => {
    await cli.run("para-zk:create-project", { title: "Host", open: "false" });
    await cli.run("para-zk:create-child", {
      type: "subnote",
      title: "Scratch",
      root_type: "project",
      root_title: "Host",
      subnote_type: "free",
      open: "false"
    });
    expect(cli.app.readPath("PARA/Projects/Host/Scratch.md")).toBeDefined();

    const deleted = await cli.run("para-zk:delete-child", { root_type: "project", root_title: "Host", title: "Scratch" });
    expect(deleted.ok).toBe(true);
    expect(cli.app.readPath("PARA/Projects/Host/Scratch.md")).toBeUndefined();
    expect(cli.app.readPath("PARA/Projects/Host/Host.md")).toBeDefined();
  });
});

describe("delete-resource", () => {
  it("trashes a flat note", async () => {
    await cli.run("para-zk:create-resource", { title: "Source", open: "false" });
    const deleted = await cli.run("para-zk:delete-resource", { title: "Source" });
    expect(deleted.ok).toBe(true);
    expect(deleted.trashed).toBe(true);
    expect(cli.app.readPath("PARA/Resources/Source.md")).toBeUndefined();
  });
});
