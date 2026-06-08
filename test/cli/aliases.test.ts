import { beforeEach, describe, expect, it } from "vitest";
import { createCliHarness, type CliHarness } from "../harness/cli";

const PROJECT = "PARA/Projects/Alpha/Alpha.md";

let cli: CliHarness;

beforeEach(async () => {
  cli = createCliHarness();
  await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });
});

describe("canonical CLI argument aliases", () => {
  const cases: Array<{ label: string; command: string; args: Record<string, unknown>; message: string }> = [
    { label: "name", command: "para-zk:create-area", args: { name: "Alias Area" }, message: "Use title instead of name" },
    { label: "path (removed)", command: "para-zk:read-project", args: { title: "Alpha", path: "PARA/Projects/Alpha/Alpha.md" }, message: "path is not supported" },
    { label: "sourcePath (removed)", command: "para-zk:create-subnote", args: { title: "X", sourcePath: "PARA/Projects/Alpha/Alpha.md" }, message: "sourcePath is not supported" },
    { label: "areaTitles", command: "para-zk:create-project", args: { title: "Alias Project", areaTitles: JSON.stringify(["A"]) }, message: "Use area_titles instead of areaTitles" },
    { label: "aliases", command: "para-zk:create-project", args: { title: "Alias Project", aliases: "PMG" }, message: "Use alias instead of aliases" },
    { label: "alias_list", command: "para-zk:create-resource", args: { title: "Alias Resource", alias_list: "PMG" }, message: "Use alias instead of alias_list" },
    { label: "aliasList", command: "para-zk:create-zk", args: { title: "Alias ZK", kind: "permanent", aliasList: "PMG" }, message: "Use alias instead of aliasList" },
    { label: "subnoteType", command: "para-zk:create-subnote", args: { title: "X", subnoteType: "meeting" }, message: "Use subnote_type instead of subnoteType" },
    { label: "type", command: "para-zk:create-zk", args: { title: "Alias ZK", type: "permanent" }, message: "Use kind instead of type" },
    { label: "memo", command: "para-zk:capture-journal", args: { memo: "Alias memo" }, message: "Use content instead of memo" },
    { label: "text", command: "para-zk:capture-journal", args: { text: "Alias text" }, message: "Use content instead of text" }
  ];

  for (const { label, command, args, message } of cases) {
    it(`rejects the ${label} alias`, async () => {
      const rejected = await cli.run(command, args);
      expect(rejected.ok).toBe(false);
      expect(String(rejected.error)).toContain(message);
    });
  }

  const multipleAliasCases: Array<{ command: string; args: Record<string, unknown> }> = [
    { command: "para-zk:create-project", args: { title: "Multiple Alias Project" } },
    { command: "para-zk:create-resource", args: { title: "Multiple Alias Resource" } },
    { command: "para-zk:create-zk", args: { title: "Multiple Alias ZK", kind: "permanent" } }
  ];

  for (const { command, args } of multipleAliasCases) {
    it(`rejects multiple aliases for ${command}`, async () => {
      const rejected = await cli.run(command, {
        ...args,
        alias: ["One", "Two"],
        open: "false"
      });
      expect(rejected.ok).toBe(false);
      expect(String(rejected.error)).toContain("aliases supports one value");
    });
  }
});

describe("frontmatter relationship cleanup on delete", () => {
  it("clears a deleted area from a project's areas frontmatter", async () => {
    await cli.run("para-zk:create-area", { title: "Ops", open: "false" });
    await cli.run("para-zk:create-project", {
      title: "Linked",
      area_titles: JSON.stringify(["Ops"]),
      open: "false"
    });

    const deleted = await cli.run("para-zk:delete-area", { title: "Ops" });
    expect(deleted.ok).toBe(true);
    expect((deleted.cleaned as { frontmatter?: number })?.frontmatter ?? 0).toBeGreaterThanOrEqual(1);
    expect(cli.app.readPath("PARA/Projects/Linked/Linked.md")).not.toContain("areas:");
  });

  it("clears a deleted resource from the source frontmatter references", async () => {
    const resource = await cli.run("para-zk:create-resource", {
      title: "Source",
      source_type: "project",
      source_title: "Alpha",
      link: "true",
      open: "false"
    });
    expect(resource.linkedFromSource).toBe(true);

    const deleted = await cli.run("para-zk:delete-resource", { title: "Source" });
    expect(deleted.ok).toBe(true);
    expect((deleted.cleaned as { references?: number })?.references ?? 0).toBeGreaterThanOrEqual(1);
    expect(cli.app.readPath(PROJECT)).not.toContain(String(resource.path));
  });
});
