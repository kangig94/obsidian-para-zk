import { beforeEach, describe, expect, it } from "vitest";
import { createCliHarness, type CliHarness } from "../harness/cli";

let cli: CliHarness;

beforeEach(async () => {
  cli = createCliHarness();
  await cli.run("para-zk:create-project", { title: "Alpha", status: "in_progress", open: "false" });
});

describe("add-reference", () => {
  it("adds a URL reference at index 0 with a canonical link", async () => {
    const ref = await cli.run("para-zk:add-reference", {
      type: "project",
      title: "Alpha",
      target: "https://example.com/source",
      description: "Source",
      open: "false"
    });
    expect(ref.ok).toBe(true);
    expect(ref.added).toBe(true);
    expect(ref.index).toBe(0);
    expect(ref.link).toBe("https://example.com/source");
  });

  it("preserves subpath wikilinks, dedupes wiki/markdown syntax, and keeps distinct subpaths", async () => {
    await cli.run("para-zk:create-resource", { title: "Target", open: "false" });
    const targetPath = "PARA/Resources/Target.md";
    const heading = "Section";

    const headingRef = await cli.run("para-zk:add-reference", {
      type: "project",
      title: "Alpha",
      target: `[[${targetPath}#${heading}]]`,
      description: "Heading description",
      open: "false"
    });
    expect(headingRef.added).toBe(true);
    expect(headingRef.link).toBe(`[[${targetPath}#${heading}]]`);

    // The same target written as a markdown link dedupes to the existing wiki entry.
    const dupMarkdown = await cli.run("para-zk:add-reference", {
      type: "project",
      title: "Alpha",
      target: `[Markdown heading](${targetPath}#${heading})`,
      open: "false"
    });
    expect(dupMarkdown.added).toBe(false);
    expect(dupMarkdown.index).toBe(headingRef.index);
    expect(dupMarkdown.link).toBe(`[[${targetPath}#${heading}]]`);

    // A different subpath (block ref) on the same file is a distinct reference.
    const blockRef = await cli.run("para-zk:add-reference", {
      type: "project",
      title: "Alpha",
      target: `[[${targetPath}#^smoke-block]]`,
      open: "false"
    });
    expect(blockRef.added).toBe(true);

    const read = await cli.run("para-zk:read-project", { title: "Alpha", key: "references", limit: "all" });
    const value = read.value as { count: number; items?: Record<string, { link: string; path: string }> };
    const items = Object.values(value.items ?? {});
    expect(items.find((i) => i.link === `[[${targetPath}#${heading}]]`)?.path).toBe(targetPath);
    expect(items.find((i) => i.link === `[[${targetPath}#^smoke-block]]`)?.path).toBe(targetPath);
    expect(value.count).toBe(2);
  });

  it("treats a duplicate URL as a no-op returning the existing index", async () => {
    await cli.run("para-zk:add-reference", { type: "project", title: "Alpha", target: "https://example.com/x", open: "false" });
    const dup = await cli.run("para-zk:add-reference", { type: "project", title: "Alpha", target: "https://example.com/x", open: "false" });
    expect(dup.ok).toBe(true);
    expect(dup.added).toBe(false);
    expect(dup.index).toBe(0);
  });
});

describe("reference collection updates", () => {
  it("rejects raw appends to the references key", async () => {
    const rejected = await cli.run("para-zk:update-project", {
      title: "Alpha",
      key: "references",
      op: "append",
      value: "https://example.com/raw"
    });
    expect(rejected.ok).toBe(false);
    expect(String(rejected.error)).toContain("op=insert");
  });

  it("inserts, reads, edits the description, and deletes by index", async () => {
    const insert = await cli.run("para-zk:update-project", {
      title: "Alpha",
      key: "references",
      op: "insert",
      value_json: JSON.stringify({ link: "https://example.com/a", description: "A" })
    });
    expect(insert.changed).toBe(true);
    expect(insert.index).toBe(0);

    const read = await cli.run("para-zk:read-project", { title: "Alpha", key: "references/0" });
    expect((read.value as Record<string, unknown>).description).toBe("A");

    const edit = await cli.run("para-zk:update-project", {
      title: "Alpha",
      key: "references/0/description",
      op: "set",
      value: "Edited"
    });
    expect(edit.changed).toBe(true);

    const reread = await cli.run("para-zk:read-project", { title: "Alpha", key: "references/0" });
    expect((reread.value as Record<string, unknown>).description).toBe("Edited");

    const del = await cli.run("para-zk:update-project", { title: "Alpha", key: "references/0", op: "delete" });
    expect(del.changed).toBe(true);

    const count = await cli.run("para-zk:read-project", { title: "Alpha", key: "references" });
    expect((count.value as { count?: number }).count ?? 0).toBe(0);
  });
});
