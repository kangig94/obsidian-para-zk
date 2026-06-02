import { describe, expect, it } from "vitest";
import { dataviewViewBlock, renderTemplate } from "../../src/templates";
import { DEFAULT_SETTINGS } from "../../src/types";

describe("managed templates", () => {
  it("uses integrated para-zk-view actions instead of PZK workflow tokens", () => {
    const project = renderTemplate("project", DEFAULT_SETTINGS);
    const area = renderTemplate("area", DEFAULT_SETTINGS);
    const resource = renderTemplate("resource", DEFAULT_SETTINGS);
    const fleeting = renderTemplate("zk_fleeting", DEFAULT_SETTINGS);
    const templates = [project, area, resource, fleeting];

    for (const content of templates) {
      expect(content).not.toContain("PZK[");
    }

    expect(project).toContain("project-subnotes");
    expect(project).toContain("project-retros");
    expect(project).toContain("para-zk-latest-retro-summary");
    expect(project).not.toContain("dataviewjs");
    expect(project).not.toContain("sameLink");
    expect(area).toContain("area-subareas");
    expect(area).toContain("area-subnotes");
    expect(area).toContain("area-retros");
    expect(resource).toContain("resource-zk-links");
    expect(fleeting).toContain("fleeting-promotion");
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
    expect(retro).toContain("# Retro summary\n\n---");
    expect(retro).not.toContain("Smoke retro summary");
    expect(retro).not.toContain("one line that helps next week");
    expect(retro).not.toContain("다음 주에 바로 도움이 될 핵심 한 줄");
  });
});
