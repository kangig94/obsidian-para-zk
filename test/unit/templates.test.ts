import { describe, expect, it } from "vitest";
import { dataviewViewBlock, managedUiBlockForType, renderTemplate, TEMPLATE_NAMES } from "../../src/templates";
import { DEFAULT_SETTINGS } from "../../src/types";

describe("managed templates", () => {
  it("collapses managed template UI into one block", () => {
    const project = renderTemplate("project", DEFAULT_SETTINGS);
    const area = renderTemplate("area", DEFAULT_SETTINGS);
    const resource = renderTemplate("resource", DEFAULT_SETTINGS);
    const llmWiki = renderTemplate("llm-wiki", DEFAULT_SETTINGS);
    const journal = renderTemplate("journal", DEFAULT_SETTINGS);
    const retro = renderTemplate("retro", DEFAULT_SETTINGS);
    const subnote = renderTemplate("subnote", DEFAULT_SETTINGS);
    const spark = renderTemplate("spark", DEFAULT_SETTINGS);
    const source = renderTemplate("digest", DEFAULT_SETTINGS);
    const permanent = renderTemplate("permanent", DEFAULT_SETTINGS);
    const templates = [project, area, resource, llmWiki, journal, retro, subnote, spark, source, permanent];

    for (const content of templates) {
      expect(content).not.toContain("PZ[");
      expect(content).toContain("created:\nupdated:");
      expect(content).not.toContain("{{created}}");
    }

    expect(project).not.toContain("dataviewjs");
    expect(project).not.toContain("sameLink");
    expect(project).toContain("updated:\naliases:\nareas:");
    expect(project).toContain("# Summary\n```para-zk-latest-retro-summary\n```\n{{cursor}}");
    expect(resource).toContain("updated:\naliases:\nurl:");
    expect(resource).toContain("```para-zk-props\ntype: resource\n```\n{{cursor}}\n\n```para-zk-managed");
    expect(resource).not.toContain("# Overview");
    expect(resource).not.toContain("# Body");
    expect(llmWiki).toContain("type: llm-wiki");
    // Identity tag classifies by domain (set by create-llm-wiki); the template ships the flat group tag.
    expect(llmWiki).toContain("tags:\n  - llm-wiki\n");
    expect(llmWiki).not.toContain("llm-wiki/{{slug}}");
    expect(llmWiki).toContain("updated:\ncreated_by:\nupdated_by:\naliases:");
    expect(llmWiki).toContain("```para-zk-props\ntype: llm-wiki\n```\n{{cursor}}\n\n```para-zk-managed\n```");
    expect(llmWiki).not.toContain("url:");
    expect(llmWiki).not.toContain("first_author:");
    expect(llmWiki).not.toContain("license:");
    expect(llmWiki).not.toContain("kind:");
    expect(spark).toContain("```para-zk-props\ntype: spark\n```\n{{cursor}}\n\n```para-zk-managed");
    expect(spark).not.toContain("# One-line thought summary");
    expect(spark).not.toContain("# Memo");
    expect(source).toContain("```para-zk-props\ntype: digest\n```\n{{cursor}}\n\n```para-zk-managed");
    // ZK templates carry no auto identity tag: `tags:` is empty so the human assigns tags.
    for (const zk of [spark, source, permanent]) {
      expect(zk).toContain("tags:\ncreated:");
      expect(zk).not.toContain("knowledge/");
    }
    expect(source).not.toContain("## Highlights (quotes/evidence)");
    expect(source).not.toContain("# Summary");
    expect(source).not.toContain("# Key insights");
    expect(source).not.toContain("# Important quotes/evidence");
    expect(permanent).toContain("```para-zk-props\ntype: permanent\n```\n{{cursor}}\n\n```para-zk-managed");
    expect(permanent).not.toContain("# One-sentence summary");
    expect(permanent).not.toContain("# Body");
    expect(permanent).not.toContain("## Limitations");
    expect(permanent).not.toContain("## Related questions");
    expect(subnote).toContain("```para-zk-props\ntype: subnote\n```\n{{cursor}}\n\n```para-zk-managed");
    expect(retro).not.toContain("para-zk-managed");

    for (const content of [project, area, resource, llmWiki, journal, spark, source, permanent, subnote]) {
      expect(content.match(/```para-zk-managed/g)).toHaveLength(1);
      expect(content).not.toContain("---\n```para-zk-managed");
      expect(content).not.toContain("project-subnotes");
      expect(content).not.toContain("area-subareas");
      expect(content).not.toContain("resource-cited-by");
      expect(content).not.toContain("llm-wiki-cited-by");
      expect(content).not.toContain("spark-distill");
      expect(content).not.toContain("digest-cited-by");
    }
  });

  it("expands managed UI blocks for each note type", () => {
    const project = managedUiBlockForType("project", DEFAULT_SETTINGS) ?? "";
    const area = managedUiBlockForType("area", DEFAULT_SETTINGS) ?? "";
    const resource = managedUiBlockForType("resource", DEFAULT_SETTINGS) ?? "";
    const llmWiki = managedUiBlockForType("llm-wiki", DEFAULT_SETTINGS) ?? "";
    const journal = managedUiBlockForType("journal", DEFAULT_SETTINGS) ?? "";
    const spark = managedUiBlockForType("spark", DEFAULT_SETTINGS) ?? "";
    const source = managedUiBlockForType("digest", DEFAULT_SETTINGS) ?? "";
    const permanent = managedUiBlockForType("permanent", DEFAULT_SETTINGS) ?? "";

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
    expect(resource).toContain("resource-cited-by");
    expect(resource).toContain("title: Created from this");
    expect(llmWiki).toContain("llm-wiki-cited-by");
    expect(llmWiki).toContain("title: Cited by");
    expect(llmWiki).toContain("para-zk-references");
    expect(llmWiki).toContain("title: References");
    expect(journal).toContain("para-zk-tasks");
    expect(managedUiBlockForType("retro", DEFAULT_SETTINGS)).toBeUndefined();
    expect(spark).toContain("spark-distill");
    expect(source).toContain("digest-cited-by");
    expect(source).toContain("para-zk-references");
    expect(permanent).toContain("permanent-cited-by");
    expect(permanent).toContain("title: Cited by");
    const subnote = managedUiBlockForType("subnote", DEFAULT_SETTINGS) ?? "";
    expect(subnote).toContain("para-zk-references");
    expect(subnote).toContain("title: References");
    expect(subnote).not.toContain("para-zk-tasks");
    expect(subnote).not.toContain("para-zk-view");
  });

  it("renders Dataview tables for managed ZK views (cited-by and distilled-into)", () => {
    expect(dataviewViewBlock("permanent-cited-by", DEFAULT_SETTINGS)).toContain("contains(file.outlinks");
    expect(dataviewViewBlock("resource-cited-by", DEFAULT_SETTINGS)).toContain("contains(file.outlinks");
    expect(dataviewViewBlock("digest-cited-by", DEFAULT_SETTINGS)).toContain("contains(file.outlinks");
    expect(dataviewViewBlock("llm-wiki-cited-by", DEFAULT_SETTINGS)).toContain("contains(file.outlinks");
    expect(dataviewViewBlock("spark-distill", DEFAULT_SETTINGS)).toContain("distilled_to");

    for (const key of ["resource-cited-by", "permanent-cited-by", "digest-cited-by"]) {
      const block = dataviewViewBlock(key, DEFAULT_SETTINGS) ?? "";
      expect(block).toContain('FROM "ZK"');
      expect(block).not.toContain('FROM "LLM-Wiki"');
    }

    const wikiBlock = dataviewViewBlock("llm-wiki-cited-by", DEFAULT_SETTINGS) ?? "";
    expect(wikiBlock).toContain('FROM "LLM-Wiki"');
    expect(wikiBlock).not.toContain('FROM "ZK"');

    const customSettings = structuredClone(DEFAULT_SETTINGS);
    customSettings.paths.wikiFolder = "Generated/Wiki";
    expect(dataviewViewBlock("llm-wiki-cited-by", customSettings)).toContain('FROM "Generated/Wiki"');
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
    expect(dataviewViewBlock("resource-cited-by", DEFAULT_SETTINGS, sourcePath)).toContain(`contains(file.outlinks, ${sourceLink})`);
    expect(dataviewViewBlock("resource-cited-by", DEFAULT_SETTINGS, sourcePath)).toContain("file.link AS \"Filename\", file.mtime AS \"Updated\"");
    expect(dataviewViewBlock("llm-wiki-cited-by", DEFAULT_SETTINGS, sourcePath)).toContain(`contains(file.outlinks, ${sourceLink})`);
    expect(dataviewViewBlock("llm-wiki-cited-by", DEFAULT_SETTINGS, sourcePath)).toContain("file.link AS \"Filename\", file.mtime AS \"Updated\"");
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
