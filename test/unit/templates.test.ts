import { describe, expect, it } from "vitest";
import { dataviewViewBlock, managedUiBlockForType, renderTemplate, TEMPLATE_NAMES } from "../../src/templates";
import { DEFAULT_SETTINGS } from "../../src/types";

describe("managed templates", () => {
  it("collapses managed template UI into one block", () => {
    const project = renderTemplate("project", DEFAULT_SETTINGS);
    const area = renderTemplate("area", DEFAULT_SETTINGS);
    const resource = renderTemplate("resource", DEFAULT_SETTINGS);
    const journal = renderTemplate("journal", DEFAULT_SETTINGS);
    const retro = renderTemplate("retro", DEFAULT_SETTINGS);
    const subnote = renderTemplate("subnote", DEFAULT_SETTINGS);
    const fleeting = renderTemplate("zk_fleeting", DEFAULT_SETTINGS);
    const literature = renderTemplate("zk_literature", DEFAULT_SETTINGS);
    const permanent = renderTemplate("zk_permanent", DEFAULT_SETTINGS);
    const templates = [project, area, resource, journal, retro, subnote, fleeting, literature, permanent];

    for (const content of templates) {
      expect(content).not.toContain("PZK[");
    }

    expect(project).not.toContain("dataviewjs");
    expect(project).not.toContain("sameLink");
    expect(project).toContain("# Summary\n```para-zk-latest-retro-summary\n```\n{{cursor}}");
    expect(subnote).not.toContain("para-zk-managed");
    expect(retro).not.toContain("para-zk-managed");

    for (const content of [project, area, resource, journal, fleeting, literature, permanent]) {
      expect(content.match(/```para-zk-managed/g)).toHaveLength(1);
      expect(content).not.toContain("---\n```para-zk-managed");
      expect(content).not.toContain("project-subnotes");
      expect(content).not.toContain("area-subareas");
      expect(content).not.toContain("resource-zk-links");
      expect(content).not.toContain("fleeting-promotion");
    }
  });

  it("expands managed UI blocks for each note type", () => {
    const project = managedUiBlockForType("project", DEFAULT_SETTINGS) ?? "";
    const area = managedUiBlockForType("area", DEFAULT_SETTINGS) ?? "";
    const resource = managedUiBlockForType("resource", DEFAULT_SETTINGS) ?? "";
    const journal = managedUiBlockForType("journal", DEFAULT_SETTINGS) ?? "";
    const fleeting = managedUiBlockForType("zk_fleeting", DEFAULT_SETTINGS) ?? "";
    const literature = managedUiBlockForType("zk_literature", DEFAULT_SETTINGS) ?? "";

    expect(project).not.toContain("para-zk-latest-retro-summary");
    expect(project).toMatch(/^\n---\n```para-zk-tasks/);
    expect(project).not.toContain("# Tasks");
    expect(project).toContain("title: Tasks");
    expect(project).toContain("project-subnotes");
    expect(project).toContain("title: Subnotes");
    expect(project).toContain("project-retros");
    expect(area).toContain("area-projects");
    expect(area).toContain("title: Projects dashboard");
    expect(area).toContain("area-subareas");
    expect(area).toContain("area-subnotes");
    expect(area).toContain("area-retros");
    expect(resource).toContain("resource-zk-links");
    expect(resource).toContain("title: Promote to ZK");
    expect(journal).toContain("para-zk-tasks");
    expect(managedUiBlockForType("retro", DEFAULT_SETTINGS)).toBeUndefined();
    expect(fleeting).toContain("fleeting-promotion");
    expect(literature).toContain("para-zk-references");
    expect(managedUiBlockForType("doc", DEFAULT_SETTINGS)).toBeUndefined();
  });

  it("renders a Dataview block for fleeting promotion state", () => {
    expect(dataviewViewBlock("fleeting-promotion", DEFAULT_SETTINGS)).toContain("promoted_to");
  });

  it("matches Dataview relationship views against the source note link", () => {
    const sourcePath = "PARA/Projects/Alpha/Alpha.md";
    const sourceLink = `link(${JSON.stringify(sourcePath)})`;

    expect(dataviewViewBlock("project-retros", DEFAULT_SETTINGS)).toContain("project = this.file.link");
    expect(dataviewViewBlock("project-retros", DEFAULT_SETTINGS, sourcePath)).toContain(`project = ${sourceLink}`);
    expect(dataviewViewBlock("area-retros", DEFAULT_SETTINGS, sourcePath)).toContain(`contains(areas, ${sourceLink})`);
    expect(dataviewViewBlock("area-projects", DEFAULT_SETTINGS, sourcePath)).toContain("file.link AS \"Project\"");
    expect(dataviewViewBlock("area-projects", DEFAULT_SETTINGS, sourcePath)).not.toContain("TABLE status");
    expect(dataviewViewBlock("project-retros", DEFAULT_SETTINGS, sourcePath)).toContain("link(file.path, replace(week_iso, \"-\", \"_\"))");
    expect(dataviewViewBlock("area-retros", DEFAULT_SETTINGS, sourcePath)).toContain("link(file.path, replace(week_iso, \"-\", \"_\"))");
    expect(dataviewViewBlock("project-retros", DEFAULT_SETTINGS, sourcePath)).toContain("file.mtime AS \"Updated\"");
    expect(dataviewViewBlock("area-retros", DEFAULT_SETTINGS, sourcePath)).toContain("file.mtime AS \"Updated\"");
    expect(dataviewViewBlock("project-subnotes", DEFAULT_SETTINGS, sourcePath)).toContain(`parent = ${sourceLink}`);
    expect(dataviewViewBlock("project-subnotes", DEFAULT_SETTINGS, sourcePath)).toContain("file.link AS \"Filename\", file.mtime AS \"Updated\"");
    expect(dataviewViewBlock("area-subnotes", DEFAULT_SETTINGS, sourcePath)).toContain("file.link AS \"Filename\", file.mtime AS \"Updated\"");
    expect(dataviewViewBlock("resource-zk-links", DEFAULT_SETTINGS, sourcePath)).toContain(`contains(file.outlinks, ${sourceLink})`);
    expect(dataviewViewBlock("resource-zk-links", DEFAULT_SETTINGS, sourcePath)).toContain("file.link AS \"Filename\", file.mtime AS \"Updated\"");
  });

  it("keeps the retro areas placeholder valid YAML", () => {
    expect(renderTemplate("retro", DEFAULT_SETTINGS)).toContain("areas: {{areas_frontmatter}}");
  });

  it("keeps retro summary empty by default", () => {
    const retro = renderTemplate("retro", DEFAULT_SETTINGS);
    expect(retro).toContain("# Retro summary (required)\n");
    expect(retro).not.toContain("```para-zk-managed");
    expect(retro).not.toContain("```para-zk-tasks");
    expect(retro).not.toContain("```para-zk-references");
    expect(retro).not.toContain("Smoke retro summary");
    expect(retro).not.toContain("one line that helps next week");
    expect(retro).not.toContain("다음 주에 바로 도움이 될 핵심 한 줄");
  });

  it("keeps template files to one trailing blank line", () => {
    for (const name of TEMPLATE_NAMES) {
      const content = renderTemplate(name, DEFAULT_SETTINGS);
      expect(content.endsWith("\n"), name).toBe(true);
      expect(content.endsWith("\n\n"), name).toBe(false);
      expect(content, name).not.toMatch(/\n[ \t]*\n[ \t]*\n/);
    }
  });
});
