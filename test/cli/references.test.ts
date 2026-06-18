import { beforeEach, describe, expect, it } from "vitest";
import { createCliHarness, type CliHarness } from "../harness/cli";
import { referenceTitle } from "../../src/ux/citations/reference-link";
import type { ReferenceRead } from "../../src/workflows";
import { expectGeneratedReferenceId } from "../unit/reference-id-test-helpers";

let cli: CliHarness;

beforeEach(async () => {
  cli = createCliHarness();
  await cli.run("para-zk:create-project", { title: "Alpha", status: "in_progress", open: "false" });
});

function insertProjectReference(value: Record<string, unknown>): Promise<Record<string, unknown>> {
  return cli.run("para-zk:update-project", {
    title: "Alpha",
    key: "references",
    op: "insert",
    value_json: JSON.stringify(value)
  });
}

type ReturnedReferenceRead = ReferenceRead & { index?: number };

function referenceItems(result: Record<string, unknown>): ReturnedReferenceRead[] {
  const value = result.value as { items?: Record<string, ReturnedReferenceRead> };
  return Object.values(value.items ?? {});
}

describe("reference collection insert", () => {
  it("reads legacy id-less references as null without writing frontmatter", async () => {
    const path = "PARA/Projects/Alpha/Alpha.md";
    const file = cli.app.vault.getFileByPath(path);
    if (!file) throw new Error(`missing fixture file: ${path}`);
    await cli.app.vault.modify(file, [
      "---",
      "type: project",
      "status: in_progress",
      "references:",
      "  - https://example.com/bare",
      "  - link: https://example.com/object",
      "    description: Legacy object",
      "---",
      ""
    ].join("\n"));
    const before = cli.app.readPath(path);

    const first = await cli.run("para-zk:read-project", { title: "Alpha", key: "references", limit: "all" });
    const second = await cli.run("para-zk:read-project", { title: "Alpha", key: "references", limit: "all" });
    const firstItems = Object.values((first.value as { items?: Record<string, ReferenceRead> }).items ?? {});
    const secondItems = Object.values((second.value as { items?: Record<string, ReferenceRead> }).items ?? {});

    expect(firstItems.map((reference) => reference.id)).toEqual([null, null]);
    expect(secondItems.map((reference) => reference.id)).toEqual([null, null]);
    expect(second.value).toEqual(first.value);
    expect(cli.app.readPath(path)).toBe(before);
    expect(cli.app.readPath(path)).not.toContain("id:");
  });

  it("backfills id-less references, returns ids, and is idempotent", async () => {
    const path = "PARA/Projects/Alpha/Alpha.md";
    const file = cli.app.vault.getFileByPath(path);
    if (!file) throw new Error(`missing fixture file: ${path}`);
    await cli.app.vault.modify(file, [
      "---",
      "type: project",
      "status: in_progress",
      "references:",
      "  - https://example.com/bare",
      "  - link: https://example.com/object",
      "    description: Legacy object",
      "---",
      ""
    ].join("\n"));

    const backfilled = await cli.run("para-zk:update-project", {
      title: "Alpha",
      key: "references",
      op: "backfill"
    });
    expect(backfilled.ok).toBe(true);
    expect(backfilled.changed).toBe(true);
    expect(backfilled.value).toMatchObject({
      count: 2,
      offset: 0,
      limit: "all",
      returned: 2,
      has_more: false
    });
    const returned = referenceItems(backfilled);
    expect(returned).toHaveLength(2);
    expect(returned.map((reference) => reference.index)).toEqual([0, 1]);
    returned.forEach((reference) => expectGeneratedReferenceId(reference.id));
    expect(new Set(returned.map((reference) => reference.id)).size).toBe(2);

    const read = await cli.run("para-zk:read-project", { title: "Alpha", key: "references", limit: "all" });
    const persisted = referenceItems(read);
    expect(persisted.map((reference) => reference.id)).toEqual(returned.map((reference) => reference.id));

    const second = await cli.run("para-zk:update-project", {
      title: "Alpha",
      key: "references",
      op: "backfill"
    });
    expect(second.changed).toBe(false);
    expect(referenceItems(second).map((reference) => reference.id)).toEqual(returned.map((reference) => reference.id));
  });

  it("adds a URL reference at index 0 with a canonical link", async () => {
    const ref = await insertProjectReference({
      link: "https://example.com/source",
      description: "Source"
    });
    expect(ref.ok).toBe(true);
    expect(ref.added).toBe(true);
    expect(ref.index).toBe(0);
    expect(ref.link).toBe("https://example.com/source");

    const read = await cli.run("para-zk:read-project", { title: "Alpha", key: "references", limit: "all" });
    const value = read.value as { items?: Record<string, ReferenceRead> };
    const references = Object.values(value.items ?? {});
    expect(references[0]).toMatchObject({
      link: "https://example.com/source",
      kind: "url",
      description: "Source"
    });
    expect(references[0].id).toMatch(/^[a-z0-9]{6}$/i);
    expect(references[0].id).toMatch(/[a-z]/i);
  });

  it("preserves subpath wikilinks, dedupes wiki/markdown syntax, and keeps distinct subpaths", async () => {
    await cli.run("para-zk:create-resource", { title: "Target", open: "false" });
    const targetPath = "PARA/Resources/Target.md";
    const heading = "Section";

    const headingRef = await insertProjectReference({
      link: `[[${targetPath}#${heading}]]`,
      description: "Heading description"
    });
    expect(headingRef.added).toBe(true);
    expect(headingRef.link).toBe(`[[${targetPath}#${heading}]]`);

    // The same target written as a markdown link dedupes to the existing wiki entry.
    const dupMarkdown = await insertProjectReference({
      link: `[Markdown heading](${targetPath}#${heading})`
    });
    expect(dupMarkdown.added).toBe(false);
    expect(dupMarkdown.index).toBe(headingRef.index);
    expect(dupMarkdown.link).toBe(`[[${targetPath}#${heading}]]`);

    // A different subpath (block ref) on the same file is a distinct reference.
    const blockRef = await insertProjectReference({
      link: `[[${targetPath}#^smoke-block]]`
    });
    expect(blockRef.added).toBe(true);

    const read = await cli.run("para-zk:read-project", { title: "Alpha", key: "references", limit: "all" });
    const value = read.value as { count: number; items?: Record<string, { link: string; path: string }> };
    const items = Object.values(value.items ?? {});
    expect(items.find((i) => i.link === `[[${targetPath}#${heading}]]`)?.path).toBe(targetPath);
    expect(items.find((i) => i.link === `[[${targetPath}#^smoke-block]]`)?.path).toBe(targetPath);
    expect(value.count).toBe(2);
  });

  it("preserves wikilink alias display text and dedupes by resolved file", async () => {
    await cli.run("para-zk:create-resource", { title: "Alias Demo P2", alias: "PMG", open: "false" });
    const targetPath = "PARA/Resources/Alias Demo P2.md";

    const ref = await insertProjectReference({
      link: `[[${targetPath}|PMG]]`
    });
    expect(ref.added).toBe(true);
    expect(ref.link).toBe(`[[${targetPath}|PMG]]`);
    // insert returns the generated stable id, so a caller can cite PZ[<id>] without re-reading.
    expectGeneratedReferenceId(ref.id);

    const duplicate = await insertProjectReference({
      link: targetPath
    });
    expect(duplicate.added).toBe(false);
    expect(duplicate.index).toBe(ref.index);
    expect(duplicate.link).toBe(`[[${targetPath}|PMG]]`);
    // a no-op duplicate insert returns the existing reference's id (same id).
    expect(duplicate.id).toBe(ref.id);

    const read = await cli.run("para-zk:read-project", { title: "Alpha", key: "references", limit: "all" });
    const value = read.value as { count: number; items?: Record<string, ReferenceRead> };
    const items = Object.values(value.items ?? {});
    expect(value.count).toBe(1);
    expect(items[0]).toMatchObject({
      link: `[[${targetPath}|PMG]]`,
      kind: "note",
      path: targetPath
    });
    expect(referenceTitle(items[0])).toBe("PMG");
  });

  it("rejects a bare wikilink alias that does not resolve by path or basename", async () => {
    await cli.run("para-zk:create-resource", { title: "Alias Demo P2", alias: "PMG", open: "false" });

    const rejected = await insertProjectReference({
      link: "[[PMG]]"
    });
    expect(rejected.ok).toBe(false);
    expect(String(rejected.error)).toContain("reference target must resolve to an existing vault note: PMG");
    expect(String(rejected.error)).toContain("alias alone is ambiguous");

    const read = await cli.run("para-zk:read-project", { title: "Alpha", key: "references", limit: "all" });
    const value = read.value as { count: number; items?: Record<string, ReferenceRead> };
    expect(value.count).toBe(0);
  });

  it("treats a duplicate URL as a no-op returning the existing index", async () => {
    await insertProjectReference({ link: "https://example.com/x" });
    const dup = await insertProjectReference({ link: "https://example.com/x" });
    expect(dup.ok).toBe(true);
    expect(dup.added).toBe(false);
    expect(dup.index).toBe(0);
  });

  it("uses omitted position as append and supports prepend and middle insertion", async () => {
    const first = await insertProjectReference({ link: "https://example.com/a" });
    const second = await insertProjectReference({ link: "https://example.com/b" });
    const prepended = await insertProjectReference({ link: "https://example.com/start", position: 0 });
    const middle = await insertProjectReference({ link: "https://example.com/middle", position: 2 });

    expect(first.index).toBe(0);
    expect(second.index).toBe(1);
    expect(prepended.index).toBe(0);
    expect(middle.index).toBe(2);

    const read = await cli.run("para-zk:read-project", { title: "Alpha", key: "references", limit: "all" });
    const value = read.value as { items?: Record<string, ReferenceRead> };
    expect(Object.values(value.items ?? {}).map((item) => item.link)).toEqual([
      "https://example.com/start",
      "https://example.com/a",
      "https://example.com/middle",
      "https://example.com/b"
    ]);
  });

  it("inserts references into a subnote through update-child", async () => {
    await cli.run("para-zk:create-child", {
      type: "subnote",
      root_type: "project",
      root_title: "Alpha",
      title: "Plan",
      body: "Initial plan.",
      open: "false"
    });

    const inserted = await cli.run("para-zk:update-child", {
      root_type: "project",
      root_title: "Alpha",
      title: "Plan",
      key: "references",
      op: "insert",
      value_json: JSON.stringify({ link: "https://example.com/child", description: "Child reference" })
    });
    expect(inserted.ok).toBe(true);
    expect(inserted.path).toBe("PARA/Projects/Alpha/Plan.md");
    expect(inserted.index).toBe(0);
    expect(inserted.added).toBe(true);

    const read = await cli.run("para-zk:read-child", {
      root_type: "project",
      root_title: "Alpha",
      title: "Plan",
      key: "references/0"
    });
    expect(read.value).toMatchObject({
      link: "https://example.com/child",
      description: "Child reference",
      kind: "url"
    });
  });

  it("backfills id-less references in a subnote through update-child", async () => {
    await cli.run("para-zk:create-child", {
      type: "subnote",
      root_type: "project",
      root_title: "Alpha",
      title: "Plan",
      body: "Initial plan.",
      open: "false"
    });
    const path = "PARA/Projects/Alpha/Plan.md";
    const file = cli.app.vault.getFileByPath(path);
    if (!file) throw new Error(`missing fixture file: ${path}`);
    await cli.app.vault.modify(file, [
      "---",
      "type: subnote",
      "subnote_type: meeting",
      "references:",
      "  - https://example.com/child-bare",
      "---",
      "",
      "Initial plan."
    ].join("\n"));

    const backfilled = await cli.run("para-zk:update-child", {
      root_type: "project",
      root_title: "Alpha",
      title: "Plan",
      key: "references",
      op: "backfill"
    });
    expect(backfilled.ok).toBe(true);
    expect(backfilled.path).toBe(path);
    expect(backfilled.changed).toBe(true);
    const returned = referenceItems(backfilled);
    expect(returned).toHaveLength(1);
    expect(returned[0].index).toBe(0);
    expectGeneratedReferenceId(returned[0].id);
  });
});

describe("reference collection updates", () => {
  it("guides missing reference inserts with the reference value_json shape", async () => {
    const rejected = await cli.run("para-zk:update-project", {
      title: "Alpha",
      key: "references",
      op: "insert"
    });
    expect(rejected.ok).toBe(false);
    expect(String(rejected.error)).toContain("value_json={\"link\": ..., optional \"description\", optional 0-based \"position\"}");
  });

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

  it("rejects values on reference backfill", async () => {
    const cases = [
      { args: { value: "https://example.com/raw" }, message: "value" },
      { args: { value_json: JSON.stringify({ link: "https://example.com/raw" }) }, message: "value_json" }
    ];

    for (const item of cases) {
      const rejected = await cli.run("para-zk:update-project", {
        title: "Alpha",
        key: "references",
        op: "backfill",
        ...item.args
      });
      expect(rejected.ok).toBe(false);
      expect(String(rejected.error)).toContain(`references backfill does not accept ${item.message}`);
    }
  });

  it("rejects backfill on non-reference keys through write-shape validation", async () => {
    await cli.run("para-zk:create-resource", { title: "Source", open: "false" });

    const rejected = await cli.run("para-zk:update-resource", {
      title: "Source",
      key: "body",
      op: "backfill"
    });
    expect(rejected.ok).toBe(false);
    expect(String(rejected.error)).toContain("key=body accepts op=set|append|prepend|replace");
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
