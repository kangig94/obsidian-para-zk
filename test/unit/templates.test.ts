import { describe, expect, it } from "vitest";
import { dataviewViewBlock, managedUiBlocksForType, renderTemplate, TEMPLATE_NAMES } from "../../src/templates";
import { DEFAULT_SETTINGS } from "../../src/types";

describe("managed templates", () => {
  it("omits auto-rendered props and managed fences from content templates", () => {
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
    const templates = [
      ["project", project],
      ["area", area],
      ["resource", resource],
      ["llm-wiki", llmWiki],
      ["journal", journal],
      ["retro", retro],
      ["subnote", subnote],
      ["spark", spark],
      ["digest", source],
      ["permanent", permanent]
    ] as const;

    for (const [name, content] of templates) {
      expect(content, name).not.toContain("PZ[");
      expect(content, name).toContain("created:\nupdated:");
      expect(content, name).not.toContain("{{created}}");
      expect(content, name).not.toContain("```para-zk-props");
      expect(content, name).not.toContain("```para-zk-managed");
    }

    expect(project).not.toContain("dataviewjs");
    expect(project).not.toContain("sameLink");
    expect(project).toContain("updated:\naliases:\nareas:");
    expect(project).toContain("# Summary\n```para-zk-latest-retro-summary\n```\n{{cursor}}");
    expect(resource).toContain("updated:\naliases:\nurl:");
    expect(resource).toContain("kind:\n---\n{{cursor}}\n");
    expect(resource).not.toContain("# Overview");
    expect(resource).not.toContain("# Body");
    expect(llmWiki).toContain("type: llm-wiki");
    // Identity tag classifies by domain (set by create-llm-wiki); the template ships the flat group tag.
    expect(llmWiki).toContain("tags:\n  - llm-wiki\n");
    expect(llmWiki).not.toContain("llm-wiki/{{slug}}");
    expect(llmWiki).toContain("updated:\ncreated_by:\nupdated_by:\naliases:");
    expect(llmWiki).toContain("aliases:\n---\n{{cursor}}\n");
    expect(llmWiki).not.toContain("url:");
    expect(llmWiki).not.toContain("first_author:");
    expect(llmWiki).not.toContain("license:");
    expect(llmWiki).not.toContain("kind:");
    expect(spark).toContain("processed: false\n---\n{{cursor}}\n");
    expect(spark).not.toContain("# One-line thought summary");
    expect(spark).not.toContain("# Memo");
    expect(source).toContain("published:\n---\n{{cursor}}\n");
    // ZK templates carry no auto identity tag: `tags:` is empty so the human assigns tags.
    for (const zk of [spark, source, permanent]) {
      expect(zk).toContain("tags:\ncreated:");
      expect(zk).not.toContain("knowledge/");
    }
    expect(source).not.toContain("## Highlights (quotes/evidence)");
    expect(source).not.toContain("# Summary");
    expect(source).not.toContain("# Key insights");
    expect(source).not.toContain("# Important quotes/evidence");
    expect(permanent).toContain("aliases:\n---\n{{cursor}}\n");
    expect(permanent).not.toContain("# One-sentence summary");
    expect(permanent).not.toContain("# Body");
    expect(permanent).not.toContain("## Limitations");
    expect(permanent).not.toContain("## Related questions");
    expect(subnote).toContain("parent:\n---\n{{cursor}}\n");
    const retroBody = retro.replace(/^---\n[\s\S]*?\n---\n/, "");
    expect(retroBody).toMatch(/^# .+\n- \{\{cursor\}\}/);
    expect(retroBody).not.toMatch(/^---\n/);

    for (const content of [project, area, resource, llmWiki, journal, spark, source, permanent, subnote]) {
      expect(content).not.toContain("project-subnotes");
      expect(content).not.toContain("area-subareas");
      expect(content).not.toContain("resource-cited-by");
      expect(content).not.toContain("llm-wiki-cited-by");
      expect(content).not.toContain("spark-distill");
      expect(content).not.toContain("digest-cited-by");
    }
  });

  it("expands managed UI blocks for each note type", () => {
    const project = managedUiBlocksForType("project", DEFAULT_SETTINGS) ?? [];
    const area = managedUiBlocksForType("area", DEFAULT_SETTINGS) ?? [];
    const resource = managedUiBlocksForType("resource", DEFAULT_SETTINGS) ?? [];
    const llmWiki = managedUiBlocksForType("llm-wiki", DEFAULT_SETTINGS) ?? [];
    const journal = managedUiBlocksForType("journal", DEFAULT_SETTINGS) ?? [];
    const spark = managedUiBlocksForType("spark", DEFAULT_SETTINGS) ?? [];
    const source = managedUiBlocksForType("digest", DEFAULT_SETTINGS) ?? [];
    const permanent = managedUiBlocksForType("permanent", DEFAULT_SETTINGS) ?? [];

    expect(project).toEqual([
      { kind: "tasks", title: "Tasks" },
      { kind: "action", actions: [{ command: "create-subnote", icon: "file-plus", label: "Create subnote" }] },
      { kind: "view", key: "project-subnotes", title: "Subnotes" },
      { kind: "action", actions: [{ command: "create-retro", icon: "calendar-plus", label: "Create retro" }] },
      { kind: "view", key: "project-retros", title: "Retros" },
      { kind: "view", key: "cited-by", title: "Cited by" },
      { kind: "references", title: "References" }
    ]);
    expect(area).toContainEqual({ kind: "view", key: "area-projects", title: "Projects dashboard" });
    expect(area).toContainEqual({ kind: "action", actions: [{ command: "create-subarea", icon: "folder-plus", label: "Create subarea" }] });
    expect(area).toContainEqual({ kind: "view", key: "area-subareas", title: "Subareas" });
    expect(area).toContainEqual({ kind: "action", actions: [{ command: "create-subnote", icon: "file-plus", label: "Create subnote" }] });
    expect(area).toContainEqual({ kind: "view", key: "area-subnotes", title: "Subnotes" });
    expect(area).toContainEqual({ kind: "action", actions: [{ command: "create-retro", icon: "calendar-plus", label: "Create retro" }] });
    expect(area).toContainEqual({ kind: "view", key: "area-retros", title: "Retros" });
    expect(area).toContainEqual({ kind: "view", key: "cited-by", title: "Cited by" });
    expect(resource).toEqual([
      { kind: "action", actions: [{ command: "create-from-resource", icon: "arrow-up-right", label: "Create ZK" }] },
      { kind: "view", key: "cited-by", title: "Cited by" },
      { kind: "references", title: "References" }
    ]);
    expect(llmWiki).toEqual([
      { kind: "view", key: "cited-by", title: "Cited by" },
      { kind: "references", title: "References" }
    ]);
    expect(journal).toContainEqual({ kind: "tasks", title: "Tasks" });
    expect(journal).toContainEqual({ kind: "view", key: "cited-by", title: "Cited by" });
    expect(managedUiBlocksForType("retro", DEFAULT_SETTINGS)).toBeUndefined();
    expect(spark).toEqual([
      {
        kind: "action",
        actions: [
          { command: "discard-spark", icon: "trash-2", label: "Discard" },
          { command: "distill-spark", icon: "arrow-up-right", label: "Distill to Permanent" }
        ]
      },
      { kind: "view", key: "spark-distill", title: "Created from this" },
      { kind: "references", title: "References" }
    ]);
    expect(source).toContainEqual({ kind: "action", actions: [{ command: "create-from-digest", icon: "arrow-up-right", label: "Create permanent" }] });
    expect(source).toContainEqual({ kind: "view", key: "cited-by", title: "Cited by" });
    expect(source).toContainEqual({ kind: "references", title: "References" });
    expect(permanent).toEqual([
      { kind: "view", key: "cited-by", title: "Cited by" },
      { kind: "references", title: "References" }
    ]);
    const subnote = managedUiBlocksForType("subnote", DEFAULT_SETTINGS) ?? [];
    expect(subnote).toEqual([
      { kind: "view", key: "cited-by", title: "Cited by" },
      { kind: "references", title: "References" }
    ]);

    for (const content of [project, area, resource, llmWiki, journal, spark, source, permanent, subnote].map(JSON.stringify)) {
      expect(content).not.toContain("resource-cited-by");
      expect(content).not.toContain("llm-wiki-cited-by");
      expect(content).not.toContain("permanent-cited-by");
      expect(content).not.toContain("digest-cited-by");
    }
  });

  it("renders Dataview tables for managed ZK views (cited-by and distilled-into)", () => {
    const citedBy = dataviewViewBlock("cited-by", DEFAULT_SETTINGS) ?? "";

    expect(citedBy).toContain("contains(file.outlinks");
    expect(citedBy).toContain('FROM ""');
    expect(citedBy).toContain('AND !startswith(file.path, "PARA/Archives/")');
    expect(citedBy).toContain('AS "Filename"');
    expect(citedBy).toContain('AS "Type"');
    expect(citedBy).toContain('file.mtime AS "Updated"');
    expect(citedBy).toContain('choice(type = "project", "Project"');
    expect(citedBy).toContain('choice(type = "area", "Area"');
    expect(citedBy).toContain('choice(type = "resource", "Resource"');
    expect(citedBy).toContain('choice(type = "spark", "Spark"');
    expect(citedBy).toContain('choice(type = "digest", "Digest"');
    expect(citedBy).toContain('choice(type = "permanent", "Permanent"');
    expect(citedBy).toContain('choice(type = "llm-wiki", "LLM-Wiki", type)');
    expect(citedBy).toContain('link(file.path, regexreplace(file.path, "^(PARA/Projects/|PARA/Areas/|PARA/Resources/|ZK/Spark/|ZK/Digest/|ZK/Permanent/|LLM-Wiki/|Journal/|PARA/Retros/)|\\\\.md$", ""))');
    expect(dataviewViewBlock("spark-distill", DEFAULT_SETTINGS)).toContain("distilled_to");

    for (const key of ["resource-cited-by", "permanent-cited-by", "digest-cited-by", "llm-wiki-cited-by"]) {
      expect(dataviewViewBlock(key, DEFAULT_SETTINGS)).toBeUndefined();
    }

    expect(citedBy).not.toContain("Generated/Wiki/");
    expect(citedBy).not.toContain('!startswith(file.path, "Archive/Custom/")');
  });

  it("excludes a folder note's own subtree from cited-by, but keeps flat-note siblings", () => {
    const project = dataviewViewBlock("cited-by", DEFAULT_SETTINGS, "PARA/Projects/Alpha/Alpha.md") ?? "";
    const area = dataviewViewBlock("cited-by", DEFAULT_SETTINGS, "PARA/Areas/Ops/Ops.md") ?? "";
    const resource = dataviewViewBlock("cited-by", DEFAULT_SETTINGS, "PARA/Resources/Paper.md") ?? "";

    // Folder notes (project/area): exclude the whole own subtree at any depth via the prefix.
    expect(project).toContain('AND !startswith(file.path, "PARA/Projects/Alpha/")');
    expect(area).toContain('AND !startswith(file.path, "PARA/Areas/Ops/")');
    // Flat notes: NO own-subtree exclusion (a sibling resource citing this one is a real cited-by);
    // only the archive guard remains.
    expect(resource).not.toContain('!startswith(file.path, "PARA/Resources/');
    expect(resource).toContain('!startswith(file.path, "PARA/Archives/")');
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
    expect(dataviewViewBlock("project-subnotes", DEFAULT_SETTINGS, sourcePath)).toContain(
      "file.link AS \"Filename\", regexreplace(file.folder, \"^PARA/Projects/Alpha(/|$)\", \"\") AS \"Subfolder\", file.mtime AS \"Updated\""
    );
    expect(dataviewViewBlock("project-subnotes", DEFAULT_SETTINGS, sourcePath)).toContain("SORT file.mtime DESC");
    expect(dataviewViewBlock("area-subnotes", DEFAULT_SETTINGS, sourcePath)).toContain("regexreplace(file.folder, \"^PARA/Projects/Alpha(/|$)\", \"\") AS \"Subfolder\"");
    expect(dataviewViewBlock("project-subnotes", DEFAULT_SETTINGS)).toContain("regexreplace(file.folder, \"^\" + this.file.folder + \"(/|$)\", \"\") AS \"Subfolder\"");
    expect(dataviewViewBlock("cited-by", DEFAULT_SETTINGS, sourcePath)).toContain(`contains(file.outlinks, ${sourceLink})`);
    expect(dataviewViewBlock("cited-by", DEFAULT_SETTINGS, sourcePath)).toContain("link(file.path, regexreplace(file.path");
    expect(dataviewViewBlock("cited-by", DEFAULT_SETTINGS, sourcePath)).toContain("file.mtime AS \"Updated\"");
  });

  it("quotes whole-value frontmatter placeholders so the unrendered template is valid YAML", () => {
    // A bare `key: {{placeholder}}` value parses as a YAML flow-map used as a map key, which
    // makes Obsidian's metadata indexer warn on every template file. Whole-value placeholders
    // must be quoted; the substitution consumes the quotes so rendered values stay unquoted.
    // Mid-scalar (tag) and body placeholders stay bare and are not flagged.
    for (const name of TEMPLATE_NAMES) {
      const frontmatter = renderTemplate(name, DEFAULT_SETTINGS).match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
      expect(frontmatter, name).not.toMatch(/:\s+\{\{/);
    }
    expect(renderTemplate("retro", DEFAULT_SETTINGS)).toContain('areas: "{{areas_frontmatter}}"');
    expect(renderTemplate("project", DEFAULT_SETTINGS)).toContain('status: "{{status}}"');
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
