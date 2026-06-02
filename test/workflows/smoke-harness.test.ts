import { describe, expect, it } from "vitest";
import { createProject, createSubnote, readProject } from "../../src/workflows";
import { createTestContext } from "../harness/vault";

describe("harness wiring", () => {
  it("creates a project, a subnote, and reads them back", async () => {
    const { ctx } = createTestContext();

    const project = await createProject(ctx, {
      title: "Alpha",
      status: "in_progress",
      priority: "high",
      open: false
    });
    expect(project.created).toBe(true);
    expect(project.path).toBe("PARA/Projects/Alpha/Alpha.md");

    const subnote = await createSubnote(ctx, {
      title: "Kickoff",
      sourcePath: project.path,
      subnoteType: "meeting",
      open: false
    });
    expect(subnote.created).toBe(true);

    const read = await readProject(ctx, { title: "Alpha" });
    const frontmatter = read.frontmatter as Record<string, unknown> | undefined;
    expect(frontmatter?.status).toBe("in_progress");
    expect(frontmatter?.priority).toBe("high");

    const children = read.children as Record<string, { path: string }> | undefined;
    expect(children?.Kickoff?.path).toBe(subnote.path);
  });
});
