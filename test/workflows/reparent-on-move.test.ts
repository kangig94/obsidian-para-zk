import { describe, expect, it } from "vitest";
import {
  createArea,
  createProject,
  createSubnote
} from "../../src/workflows";
import { syncMovedChildParent } from "../../src/workflows/reparent-on-move";
import { createTestContext } from "../harness/vault";

describe("syncMovedChildParent", () => {
  it("updates a moved project subnote to its new project parent", async () => {
    const { ctx, app } = createTestContext();
    await createProject(ctx, { title: "Alpha", open: false });
    await createProject(ctx, { title: "Beta", open: false });
    const created = await createSubnote(ctx, {
      parentType: "project",
      parentTitle: "Alpha",
      title: "Plan",
      open: false
    });

    const oldPath = created.path;
    const file = app.vault.getFileByPath(oldPath);
    expect(file).not.toBeNull();
    await app.fileManager.renameFile(file!, "PARA/Projects/Beta/Plan.md");
    const moved = app.vault.getFileByPath("PARA/Projects/Beta/Plan.md");
    expect(moved).not.toBeNull();

    const result = await syncMovedChildParent(ctx, moved!, oldPath);

    expect(result.updated).toEqual([{
      path: "PARA/Projects/Beta/Plan.md",
      type: "subnote",
      parentPath: "PARA/Projects/Beta/Beta.md"
    }]);
    expect(app.readPath("PARA/Projects/Beta/Plan.md")).toContain("[[PARA/Projects/Beta/Beta.md|Beta]]");
  });

  it("allows a subnote to move from a project to an area", async () => {
    const { ctx, app } = createTestContext();
    await createProject(ctx, { title: "Alpha", open: false });
    await createArea(ctx, { title: "Ops", open: false });
    const created = await createSubnote(ctx, {
      parentType: "project",
      parentTitle: "Alpha",
      title: "Plan",
      open: false
    });

    const file = app.vault.getFileByPath(created.path);
    expect(file).not.toBeNull();
    await app.fileManager.renameFile(file!, "PARA/Areas/Ops/Plan.md");
    const moved = app.vault.getFileByPath("PARA/Areas/Ops/Plan.md");
    expect(moved).not.toBeNull();

    await syncMovedChildParent(ctx, moved!, created.path);

    expect(app.readPath("PARA/Areas/Ops/Plan.md")).toContain("[[PARA/Areas/Ops/Ops.md|Ops]]");
  });

  it("does not treat an ambiguous bare parent link as already matching the new parent", async () => {
    const { ctx, app } = createTestContext();
    await createProject(ctx, { title: "Alpha", open: false });
    await createArea(ctx, { title: "Alpha", open: false });
    const created = await createSubnote(ctx, {
      parentType: "project",
      parentTitle: "Alpha",
      title: "Plan",
      open: false
    });
    const file = app.vault.getFileByPath(created.path);
    expect(file).not.toBeNull();
    await app.fileManager.processFrontMatter(file!, (fm) => {
      fm.parent = "[[Alpha]]";
    });

    await app.fileManager.renameFile(file!, "PARA/Areas/Alpha/Plan.md");
    const moved = app.vault.getFileByPath("PARA/Areas/Alpha/Plan.md");
    expect(moved).not.toBeNull();

    await syncMovedChildParent(ctx, moved!, created.path);

    expect(app.readPath("PARA/Areas/Alpha/Plan.md")).toContain("[[PARA/Areas/Alpha/Alpha.md|Alpha]]");
  });

  it("reparents a moved nested area folder and rewrites descendant area tag namespaces", async () => {
    const { ctx, app } = createTestContext();
    await createArea(ctx, { title: "Ops", open: false });
    await createArea(ctx, { title: "Product", open: false });
    await createArea(ctx, { title: "Hiring", parentTitle: "Ops", open: false });
    await createArea(ctx, { title: "Interviews", parentTitle: "Ops", child: ["Hiring"], open: false });

    const oldPath = "PARA/Areas/Ops/Hiring";
    const folder = app.vault.getAbstractFileByPath(oldPath);
    expect(folder).not.toBeNull();
    await app.fileManager.renameFile(folder!, "PARA/Areas/Product/Hiring");

    const result = await syncMovedChildParent(ctx, folder!, oldPath);

    expect(result.updated).toContainEqual({
      path: "PARA/Areas/Product/Hiring/Hiring.md",
      type: "area",
      parentPath: "PARA/Areas/Product/Product.md"
    });
    const hiring = app.readPath("PARA/Areas/Product/Hiring/Hiring.md") ?? "";
    expect(hiring).toContain("[[PARA/Areas/Product/Product.md|Product]]");
    expect(hiring).toContain("- area/product");
    expect(hiring).toContain("- area/product/hiring");

    const interviews = app.readPath("PARA/Areas/Product/Hiring/Interviews/Interviews.md") ?? "";
    expect(interviews).toContain("[[PARA/Areas/Product/Hiring/Hiring.md|Hiring]]");
    expect(interviews).toContain("area/product/hiring/interviews");
  });

  it("turns a moved nested area into a root area when placed at the areas root", async () => {
    const { ctx, app } = createTestContext();
    await createArea(ctx, { title: "Ops", open: false });
    await createArea(ctx, { title: "Hiring", parentTitle: "Ops", open: false });

    const oldPath = "PARA/Areas/Ops/Hiring";
    const folder = app.vault.getAbstractFileByPath(oldPath);
    expect(folder).not.toBeNull();
    await app.fileManager.renameFile(folder!, "PARA/Areas/Hiring");

    const result = await syncMovedChildParent(ctx, folder!, oldPath);

    expect(result.updated).toEqual([{
      path: "PARA/Areas/Hiring/Hiring.md",
      type: "area",
      parentPath: undefined
    }]);
    const content = app.readPath("PARA/Areas/Hiring/Hiring.md") ?? "";
    expect(content).not.toContain("parent:");
    expect(content).toContain("- area/hiring");
  });
});
