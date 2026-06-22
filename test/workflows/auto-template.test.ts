import { describe, expect, it } from "vitest";
import {
  applyManagedTemplate,
  createArea,
  createProject,
  createResource,
  createSubnote,
  createZk,
  type WorkflowContext
} from "../../src/workflows";
import { classifyManagedNoteLocation } from "../../src/workflows/locations";
import { createTestContext, type MockApp } from "../harness/vault";

describe("classifyManagedNoteLocation", () => {
  it.each([
    ["nested resource", "PARA/Resources/AI/Paper.md", "resource"],
    ["spark", "ZK/Spark/Idea.md", "spark"],
    ["digest", "ZK/Digest/Reading.md", "digest"],
    ["permanent", "ZK/Permanent/Principle.md", "permanent"]
  ])("classifies %s paths", (_label, path, type) => {
    const { ctx } = createTestContext();

    expect(classifyManagedNoteLocation(ctx, path)?.type).toBe(type);
  });

  it.each([
    ["projects root", "PARA/Projects/Loose.md"],
    ["areas root", "PARA/Areas/Loose.md"],
    ["archives", "PARA/Archives/Projects/Alpha/Plan.md"],
    ["journal", "Journal/2026-06/2026-06-21.md"],
    ["llm-wiki", "LLM-Wiki/AI/Concept.md"],
    ["retros", "PARA/Retros/2026_W25/Retro.md"],
    ["templates", "Templates/para-zk/template_resource.md"],
    ["dashboard", "Dashboard/HomePage.md"],
    ["tasks", "Tasks/current/task-shard.md"],
    ["non-managed", "Scratch/Note.md"]
  ])("returns null for %s paths", (_label, path) => {
    const { ctx } = createTestContext();

    expect(classifyManagedNoteLocation(ctx, path)).toBeNull();
  });

  it("classifies notes inside project and area folder-note folders as subnotes with parents", async () => {
    const { ctx } = createTestContext();
    const project = await createProject(ctx, { title: "Alpha", open: false });
    const area = await createArea(ctx, { title: "Ops", open: false });

    const projectLocation = classifyManagedNoteLocation(ctx, "PARA/Projects/Alpha/Plan.md");
    const areaLocation = classifyManagedNoteLocation(ctx, "PARA/Areas/Ops/Runbook.md");

    expect(projectLocation).toMatchObject({ type: "subnote" });
    expect(projectLocation?.parent?.path).toBe(project.path);
    expect(areaLocation).toMatchObject({ type: "subnote" });
    expect(areaLocation?.parent?.path).toBe(area.path);
    expect(classifyManagedNoteLocation(ctx, project.path)).toBeNull();
  });

  it("does not classify a subnote when the containing project or area folder has no folder-note", async () => {
    const { ctx } = createTestContext();
    await ctx.host.createFolder("PARA/Projects/Loose");
    await ctx.host.createFolder("PARA/Areas/Loose");

    expect(classifyManagedNoteLocation(ctx, "PARA/Projects/Loose/Plan.md")).toBeNull();
    expect(classifyManagedNoteLocation(ctx, "PARA/Areas/Loose/Plan.md")).toBeNull();
    // Deep path with no folder-note at any level: the walk-up must terminate at the managed root → null.
    expect(classifyManagedNoteLocation(ctx, "PARA/Projects/Loose/deep/sub/Note.md")).toBeNull();
  });

  it("classifies a note in a project's deeper subfolder as a subnote of the project (any depth)", async () => {
    const { ctx } = createTestContext();
    const project = await createProject(ctx, { title: "Alpha", open: false });

    const deep = classifyManagedNoteLocation(ctx, "PARA/Projects/Alpha/notes/research/Deep.md");
    expect(deep).toMatchObject({ type: "subnote" });
    expect(deep?.parent?.path).toBe(project.path);
  });

  it("parents a subnote to the nearest enclosing folder-note, not the outermost", async () => {
    const { ctx } = createTestContext();
    await createArea(ctx, { title: "Ops", open: false });
    const sub = await createArea(ctx, { title: "Incidents", parentTitle: "Ops", open: false });

    const location = classifyManagedNoteLocation(ctx, "PARA/Areas/Ops/Incidents/logs/Today.md");
    expect(location).toMatchObject({ type: "subnote" });
    expect(location?.parent?.path).toBe(sub.path);
  });
});

describe("applyManagedTemplate", () => {
  it.each([
    {
      label: "resource",
      path: "PARA/Resources/Auto Resource.md",
      create: (ctx: WorkflowContext) => createResource(ctx, { title: "Auto Resource", open: false })
    },
    {
      label: "spark",
      path: "ZK/Spark/Auto Spark.md",
      create: (ctx: WorkflowContext) => createZk(ctx, { title: "Auto Spark", kind: "spark", open: false })
    },
    {
      label: "digest",
      path: "ZK/Digest/Auto Digest.md",
      create: (ctx: WorkflowContext) => createZk(ctx, { title: "Auto Digest", kind: "digest", open: false })
    },
    {
      label: "permanent",
      path: "ZK/Permanent/Auto Permanent.md",
      create: (ctx: WorkflowContext) => createZk(ctx, { title: "Auto Permanent", kind: "permanent", open: false })
    },
    {
      label: "subnote",
      path: "PARA/Projects/Alpha/Auto Plan.md",
      setup: (ctx: WorkflowContext) => createProject(ctx, { title: "Alpha", open: false }),
      create: (ctx: WorkflowContext) => createSubnote(ctx, {
        title: "Auto Plan",
        sourcePath: "PARA/Projects/Alpha/Alpha.md",
        open: false
      })
    }
  ])("templates an empty $label file to match the create workflow output", async ({ path, setup, create }) => {
    const expectedHarness = createTestContext();
    await setup?.(expectedHarness.ctx);
    await create(expectedHarness.ctx);
    const expected = readNormalized(expectedHarness.app, path);

    const actualHarness = createTestContext();
    await setup?.(actualHarness.ctx);
    const file = await actualHarness.ctx.host.create(path, "");

    await applyManagedTemplate(actualHarness.ctx, file);

    expect(readNormalized(actualHarness.app, path)).toBe(expected);
  });

  it("leaves an empty project subfolder note without a folder-note unchanged", async () => {
    const { ctx, app } = createTestContext();
    await ctx.host.createFolder("PARA/Projects/Loose");
    const file = await ctx.host.create("PARA/Projects/Loose/Plan.md", "");

    await applyManagedTemplate(ctx, file);

    expect(app.readPath("PARA/Projects/Loose/Plan.md")).toBe("");
  });

  it("leaves non-empty managed files unchanged", async () => {
    const { ctx, app } = createTestContext();
    const nonEmpty = await ctx.host.create("PARA/Resources/Existing.md", "Already written\n");

    await applyManagedTemplate(ctx, nonEmpty);

    expect(app.readPath("PARA/Resources/Existing.md")).toBe("Already written\n");
  });

  it("leaves unmanaged files unchanged", async () => {
    const { ctx, app } = createTestContext();
    const unmanaged = await ctx.host.create("Inbox.md", "");

    await applyManagedTemplate(ctx, unmanaged);

    expect(app.readPath("Inbox.md")).toBe("");
  });

  it.each([
    ["newline-only", "\n"],
    ["spaces-only", "  "]
  ])("templates %s managed files because trim treats them as empty", async (_label, initialContent) => {
    const { ctx, app } = createTestContext();
    const file = await ctx.host.create("PARA/Resources/Whitespace.md", initialContent);

    await applyManagedTemplate(ctx, file);

    const content = app.readPath("PARA/Resources/Whitespace.md") ?? "";
    expect(content).not.toBe(initialContent);
    expect(content).toContain("type: resource");
    expect(content).not.toContain("```para-zk-props");
    expect(content).not.toContain("```para-zk-managed");
  });
});

function readNormalized(app: MockApp, path: string): string {
  return normalizeGeneratedIds(app.readPath(path) ?? "");
}

function normalizeGeneratedIds(content: string): string {
  return content.replace(/^id: .+$/gm, "id: <generated>");
}
