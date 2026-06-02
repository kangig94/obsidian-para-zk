import { beforeEach, describe, expect, it } from "vitest";
import { createCliHarness, type CliHarness } from "../harness/cli";

let cli: CliHarness;

beforeEach(() => {
  cli = createCliHarness();
});

describe("delete-project", () => {
  it("requires force=true when the folder holds child files", async () => {
    await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });
    await cli.run("para-zk:create-subnote", {
      title: "Child",
      path: "PARA/Projects/Alpha/Alpha.md",
      subnote_type: "free",
      open: "false"
    });

    const rejected = await cli.run("para-zk:delete-project", { title: "Alpha" });
    expect(rejected.ok).toBe(false);
    expect(String(rejected.error)).toContain("force=true");
  });

  it("trashes the folder via core APIs with force=true", async () => {
    await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });
    await cli.run("para-zk:create-subnote", {
      title: "Child",
      path: "PARA/Projects/Alpha/Alpha.md",
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
