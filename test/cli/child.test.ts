import { beforeEach, describe, expect, it } from "vitest";
import { createCliHarness, type CliHarness } from "../harness/cli";

let cli: CliHarness;

beforeEach(() => {
  cli = createCliHarness();
});

describe("*-child commands", () => {
  it("creates a project subnote via create-child and removes create-subnote from the CLI", async () => {
    await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });

    const created = await cli.run("para-zk:create-child", {
      type: "subnote",
      root_type: "project",
      root_title: "Alpha",
      title: "Plan",
      subnote_type: "plan",
      body: "Initial plan.",
      open: "false"
    });
    expect(created.ok).toBe(true);
    expect(created.path).toBe("PARA/Projects/Alpha/Plan.md");

    await expect(cli.run("para-zk:create-subnote", {
      title: "Old",
      parent_type: "project",
      parent_title: "Alpha"
    })).rejects.toThrow(/unknown CLI command: para-zk:create-subnote/);
  });

  it("files a subnote in a subfolder when the title is a relative path, still addressable by basename", async () => {
    await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });

    const created = await cli.run("para-zk:create-child", {
      type: "subnote",
      root_type: "project",
      root_title: "Alpha",
      title: "Notes/Plan",
      body: "Sub-foldered plan.",
      open: "false"
    });
    expect(created.ok).toBe(true);
    expect(created.path).toBe("PARA/Projects/Alpha/Notes/Plan.md");
    expect(created.parentPath).toBe("PARA/Projects/Alpha/Alpha.md");
    // The parent link lives in frontmatter, not folder position — that is what keeps a
    // sub-foldered subnote the parent's child (the folder-direct match cannot reach a subfolder).
    expect(cli.app.readPath("PARA/Projects/Alpha/Notes/Plan.md")).toContain("[[PARA/Projects/Alpha/Alpha.md");

    // It therefore resolves by basename (relpath empty) regardless of the subfolder it sits in.
    const read = await cli.run("para-zk:read-child", {
      root_type: "project",
      root_title: "Alpha",
      title: "Plan",
      key: "body"
    });
    expect(read.path).toBe("PARA/Projects/Alpha/Notes/Plan.md");
    expect(String(read.value)).toContain("Sub-foldered plan.");
  });

  it("allows a qualified subnote whose basename equals the parent, and nested subfolders", async () => {
    await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });

    // A flat title equal to the parent is a conflict; the same basename inside a subfolder is fine.
    const sameName = await cli.run("para-zk:create-child", {
      type: "subnote", root_type: "project", root_title: "Alpha", title: "Sub/Alpha", open: "false"
    });
    expect(sameName.ok).toBe(true);
    expect(sameName.path).toBe("PARA/Projects/Alpha/Sub/Alpha.md");

    const nested = await cli.run("para-zk:create-child", {
      type: "subnote", root_type: "project", root_title: "Alpha", title: "Notes/Archive/Plan", open: "false"
    });
    expect(nested.path).toBe("PARA/Projects/Alpha/Notes/Archive/Plan.md");

    const conflict = await cli.run("para-zk:create-child", {
      type: "subnote", root_type: "project", root_title: "Alpha", title: "Alpha", open: "false"
    });
    expect(conflict.ok).toBe(false);
    expect(String(conflict.error)).toContain("conflicts with parent note");
  });

  it("rejects a subnote title that escapes its parent folder", async () => {
    await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });
    for (const title of ["../Escape", "/Absolute"]) {
      const rejected = await cli.run("para-zk:create-child", {
        type: "subnote", root_type: "project", root_title: "Alpha", title, open: "false"
      });
      expect(rejected.ok).toBe(false);
    }
  });

  it("reads, updates, renames, and deletes nested same-title children by relpath", async () => {
    await cli.run("para-zk:create-area", { title: "Ops", open: "false" });
    await cli.run("para-zk:create-child", { type: "area", root_type: "area", root_title: "Ops", title: "Hiring", open: "false" });
    await cli.run("para-zk:create-child", { type: "area", root_type: "area", root_title: "Ops", title: "Research", open: "false" });
    await cli.run("para-zk:create-child", {
      type: "subnote",
      root_type: "area",
      root_title: "Ops",
      relpath: '["Hiring"]',
      title: "Plan",
      body: "Hiring plan",
      open: "false"
    });
    await cli.run("para-zk:create-child", {
      type: "subnote",
      root_type: "area",
      root_title: "Ops",
      relpath: '["Research"]',
      title: "Plan",
      body: "Research plan",
      open: "false"
    });

    const updated = await cli.run("para-zk:update-child", {
      root_type: "area",
      root_title: "Ops",
      relpath: '["Hiring"]',
      title: "Plan",
      key: "body",
      op: "append",
      value: "Hiring only"
    });
    expect(updated.ok).toBe(true);
    expect(updated.path).toBe("PARA/Areas/Ops/Hiring/Plan.md");

    const hiringPlan = await cli.run("para-zk:read-child", {
      root_type: "area",
      root_title: "Ops",
      relpath: '["Hiring"]',
      title: "Plan",
      key: "body"
    });
    const researchPlan = await cli.run("para-zk:read-child", {
      root_type: "area",
      root_title: "Ops",
      relpath: '["Research"]',
      title: "Plan",
      key: "body"
    });
    expect(String(hiringPlan.value)).toContain("Hiring only");
    expect(String(researchPlan.value)).not.toContain("Hiring only");

    const renamed = await cli.run("para-zk:rename-child", {
      root_type: "area",
      root_title: "Ops",
      relpath: '["Hiring"]',
      title: "Plan",
      new_title: "Final Plan"
    });
    expect(renamed.ok).toBe(true);
    expect(cli.app.readPath("PARA/Areas/Ops/Hiring/Final Plan.md")).toBeDefined();
    expect(cli.app.readPath("PARA/Areas/Ops/Research/Plan.md")).toBeDefined();

    const deleted = await cli.run("para-zk:delete-child", {
      root_type: "area",
      root_title: "Ops",
      relpath: '["Hiring"]',
      title: "Final Plan"
    });
    expect(deleted.ok).toBe(true);
    expect(cli.app.readPath("PARA/Areas/Ops/Hiring/Final Plan.md")).toBeUndefined();
    expect(cli.app.readPath("PARA/Areas/Ops/Research/Plan.md")).toBeDefined();
  });

  it("reads, updates, and renames a child under an archived project root", async () => {
    await cli.run("para-zk:create-project", { title: "Alpha", status: "in_progress", open: "false" });
    await cli.run("para-zk:create-child", {
      type: "subnote",
      root_type: "project",
      root_title: "Alpha",
      title: "Plan",
      body: "Archived project plan",
      open: "false"
    });
    await cli.run("para-zk:update-project", {
      title: "Alpha",
      key: "frontmatter/status",
      op: "set",
      value: "archived"
    });
    const archivedPlan = cli.app.vault.getFileByPath("PARA/Archives/Projects/Alpha/Plan.md");
    expect(archivedPlan).not.toBeNull();
    if (archivedPlan) {
      await cli.app.fileManager.processFrontMatter(archivedPlan, (fm) => {
        fm.parent = "[[PARA/Archives/Projects/Alpha/Alpha.md|Alpha]]";
      });
    }
    await cli.run("para-zk:create-project", { title: "Alpha", status: "in_progress", open: "false" });
    await cli.run("para-zk:create-child", {
      type: "subnote",
      root_type: "project",
      root_title: "Alpha",
      title: "Plan",
      body: "Active project plan",
      open: "false"
    });

    const archivedRead = await cli.run("para-zk:read-child", {
      root_type: "project",
      root_title: "Alpha",
      archived: "true",
      title: "Plan",
      key: "body"
    });
    expect(archivedRead.path).toBe("PARA/Archives/Projects/Alpha/Plan.md");
    expect(String(archivedRead.value)).toContain("Archived project plan");

    const activeRead = await cli.run("para-zk:read-child", {
      root_type: "project",
      root_title: "Alpha",
      archived: "false",
      title: "Plan",
      key: "body"
    });
    expect(activeRead.path).toBe("PARA/Projects/Alpha/Plan.md");
    expect(String(activeRead.value)).toContain("Active project plan");

    const updated = await cli.run("para-zk:update-child", {
      root_type: "project",
      root_title: "Alpha",
      archived: "true",
      title: "Plan",
      key: "body",
      op: "set",
      value: "Updated archived project plan"
    });
    expect(updated.path).toBe("PARA/Archives/Projects/Alpha/Plan.md");

    const activeAfterUpdate = await cli.run("para-zk:read-child", {
      root_type: "project",
      root_title: "Alpha",
      archived: "false",
      title: "Plan",
      key: "body"
    });
    expect(String(activeAfterUpdate.value)).toContain("Active project plan");
    expect(String(activeAfterUpdate.value)).not.toContain("Updated archived project plan");

    const renamed = await cli.run("para-zk:rename-child", {
      root_type: "project",
      root_title: "Alpha",
      archived: "true",
      title: "Plan",
      new_title: "Archived Plan"
    });
    expect(renamed.path).toBe("PARA/Archives/Projects/Alpha/Archived Plan.md");
    expect(cli.app.readPath("PARA/Projects/Alpha/Plan.md")).toBeDefined();
    expect(cli.app.readPath("PARA/Archives/Projects/Alpha/Archived Plan.md")).toBeDefined();
  });

  it("reads, updates, and renames a child under an archived area root", async () => {
    await cli.run("para-zk:create-area", { title: "Ops", open: "false" });
    await cli.run("para-zk:create-child", {
      type: "subnote",
      root_type: "area",
      root_title: "Ops",
      title: "Plan",
      body: "Active area plan",
      open: "false"
    });
    await cli.app.vault.create("PARA/Archives/Areas/Ops/Ops.md", [
      "---",
      "type: area",
      "---",
      "# Overview",
      "Archived Ops.",
      ""
    ].join("\n"));
    await cli.app.vault.create("PARA/Archives/Areas/Ops/Plan.md", [
      "---",
      "type: subnote",
      "subnote_type: plan",
      "---",
      "Archived area plan",
      ""
    ].join("\n"));

    const archivedRead = await cli.run("para-zk:read-child", {
      root_type: "area",
      root_title: "Ops",
      archived: "true",
      title: "Plan",
      key: "body"
    });
    expect(archivedRead.path).toBe("PARA/Archives/Areas/Ops/Plan.md");
    expect(String(archivedRead.value)).toContain("Archived area plan");

    const activeRead = await cli.run("para-zk:read-child", {
      root_type: "area",
      root_title: "Ops",
      archived: "false",
      title: "Plan",
      key: "body"
    });
    expect(activeRead.path).toBe("PARA/Areas/Ops/Plan.md");
    expect(String(activeRead.value)).toContain("Active area plan");

    const updated = await cli.run("para-zk:update-child", {
      root_type: "area",
      root_title: "Ops",
      archived: "true",
      title: "Plan",
      key: "body",
      op: "set",
      value: "Updated archived area plan"
    });
    expect(updated.path).toBe("PARA/Archives/Areas/Ops/Plan.md");

    const activeAfterUpdate = await cli.run("para-zk:read-child", {
      root_type: "area",
      root_title: "Ops",
      archived: "false",
      title: "Plan",
      key: "body"
    });
    expect(String(activeAfterUpdate.value)).toContain("Active area plan");
    expect(String(activeAfterUpdate.value)).not.toContain("Updated archived area plan");

    const renamed = await cli.run("para-zk:rename-child", {
      root_type: "area",
      root_title: "Ops",
      archived: "true",
      title: "Plan",
      new_title: "Archived Plan"
    });
    expect(renamed.path).toBe("PARA/Archives/Areas/Ops/Archived Plan.md");
    expect(cli.app.readPath("PARA/Areas/Ops/Plan.md")).toBeDefined();
    expect(cli.app.readPath("PARA/Archives/Areas/Ops/Archived Plan.md")).toBeDefined();
  });

  it("creates a nested area only under an area root and rejects type-specific option mixups", async () => {
    await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });
    await cli.run("para-zk:create-area", { title: "Ops", open: "false" });

    const projectArea = await cli.run("para-zk:create-child", {
      type: "area",
      root_type: "project",
      root_title: "Alpha",
      title: "Bad"
    });
    expect(projectArea.ok).toBe(false);
    expect(String(projectArea.error)).toContain("type=area requires root_type=area");

    const subnoteWithAreaArg = await cli.run("para-zk:create-child", {
      type: "subnote",
      root_type: "area",
      root_title: "Ops",
      title: "Bad",
      inherit_parent_tag: "false"
    });
    expect(subnoteWithAreaArg.ok).toBe(false);
    expect(String(subnoteWithAreaArg.error)).toContain("inherit_parent_tag is only valid with type=area");

    const areaWithSubnoteArg = await cli.run("para-zk:create-child", {
      type: "area",
      root_type: "area",
      root_title: "Ops",
      title: "Bad",
      subnote_type: "plan"
    });
    expect(areaWithSubnoteArg.ok).toBe(false);
    expect(String(areaWithSubnoteArg.error)).toContain("subnote_type is only valid with type=subnote");

    const areaWithFileBackedBody = await cli.run("para-zk:create-child", {
      type: "area",
      root_type: "area",
      root_title: "Ops",
      title: "Bad",
      body: "@/no/such/file.md"
    });
    expect(areaWithFileBackedBody.ok).toBe(false);
    expect(String(areaWithFileBackedBody.error)).toContain("body is only valid with type=subnote");
  });

  it("rejects old child= drills on parent CRUD commands with a migration hint", async () => {
    await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });
    const cases: Array<{ command: string; args: Record<string, unknown> }> = [
      { command: "para-zk:read-project", args: { title: "Alpha", child: '["Plan"]', key: "body" } },
      { command: "para-zk:update-project", args: { title: "Alpha", child: '["Plan"]', key: "body", op: "set", value: "x" } },
      { command: "para-zk:rename-project", args: { title: "Alpha", child: '["Plan"]', new_title: "Next" } },
      { command: "para-zk:delete-project", args: { title: "Alpha", child: '["Plan"]' } }
    ];

    for (const { command, args } of cases) {
      const rejected = await cli.run(command, args);
      expect(rejected.ok).toBe(false);
      expect(String(rejected.error)).toContain("child= is not accepted here");
      expect(String(rejected.error)).toContain("para-zk:read-child|update-child|delete-child|rename-child");
      expect(String(rejected.error)).toContain("root_type/root_title/relpath/title");
    }
  });

  it("rejects old nested create-area arguments with a create-child migration hint", async () => {
    await cli.run("para-zk:create-area", { title: "Ops", open: "false" });

    const parentTitle = await cli.run("para-zk:create-area", {
      title: "Hiring",
      parent_title: "Ops"
    });
    expect(parentTitle.ok).toBe(false);
    expect(String(parentTitle.error)).toContain("parent_title, parentTitle, and child are not accepted");
    expect(String(parentTitle.error)).toContain("para-zk:create-child type=area");

    const parentTitleCamel = await cli.run("para-zk:create-area", {
      title: "Hiring",
      parentTitle: "Ops"
    });
    expect(parentTitleCamel.ok).toBe(false);
    expect(String(parentTitleCamel.error)).toContain("parent_title, parentTitle, and child are not accepted");
    expect(String(parentTitleCamel.error)).toContain("para-zk:create-child type=area");

    const child = await cli.run("para-zk:create-area", {
      title: "Hiring",
      child: '["Ops"]'
    });
    expect(child.ok).toBe(false);
    expect(String(child.error)).toContain("parent_title, parentTitle, and child are not accepted");
  });

  it("rejects camelCase legacy parent aliases on child commands", async () => {
    await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });
    const commands: Array<{ command: string; extra?: Record<string, unknown> }> = [
      { command: "para-zk:read-child", extra: { key: "body" } },
      { command: "para-zk:update-child", extra: { key: "body", op: "set", value: "x" } },
      { command: "para-zk:rename-child", extra: { new_title: "Next" } },
      { command: "para-zk:delete-child" }
    ];

    for (const { command, extra } of commands) {
      const parentType = await cli.run(command, {
        parentType: "project",
        root_title: "Alpha",
        title: "Plan",
        ...extra
      });
      expect(parentType.ok).toBe(false);
      expect(String(parentType.error)).toContain("parentType is not accepted here — use root_type");

      const parentTitle = await cli.run(command, {
        root_type: "project",
        parentTitle: "Alpha",
        title: "Plan",
        ...extra
      });
      expect(parentTitle.ok).toBe(false);
      expect(String(parentTitle.error)).toContain("parentTitle is not accepted here — use root_title");
    }
  });
});
