import { describe, expect, it } from "vitest";
import {
  backfillReferenceIds,
  insertReferenceItem,
  readReferenceItemsFresh,
  reorderReferenceItems,
  updateReferenceItem
} from "../../src/workflows";
import { createTestContext } from "../harness/vault";
import { expectGeneratedReferenceId } from "./reference-id-test-helpers";

describe("reference ids", () => {
  it("does not fabricate ids when reading id-less legacy references", async () => {
    const { ctx, app } = createTestContext();
    const file = await app.vault.create("Legacy.md", [
      "---",
      "type: resource",
      "references:",
      "  - https://example.com/bare",
      "  - link: https://example.com/object",
      "    description: Legacy object",
      "---",
      ""
    ].join("\n"));
    const before = app.readPath("Legacy.md");

    const first = await readReferenceItemsFresh(ctx, file);
    const second = await readReferenceItemsFresh(ctx, file);

    expect(first.map((reference) => reference.id)).toEqual([null, null]);
    expect(second.map((reference) => reference.id)).toEqual([null, null]);
    expect(second).toEqual(first);
    expect(app.readPath("Legacy.md")).toBe(before);
    expect(app.readPath("Legacy.md")).not.toContain("id:");
  });

  it("assigns unique short random ids when inserting references", async () => {
    const { ctx, app } = createTestContext();
    const file = await app.vault.create("Source.md", "---\ntype: resource\n---\n");

    await insertReferenceItem(ctx, file, { link: "https://example.com/a" });
    await insertReferenceItem(ctx, file, { link: "https://example.com/b" });

    const references = await readReferenceItemsFresh(ctx, file);
    const ids = references.map((reference) => reference.id);
    expect(new Set(ids).size).toBe(2);
    ids.forEach(expectGeneratedReferenceId);
  });

  it("explicitly backfills id-less references without changing stable ids on later calls", async () => {
    const { ctx, app } = createTestContext();
    const file = await app.vault.create("Legacy.md", [
      "---",
      "references:",
      "  - https://example.com/a",
      "  - link: https://example.com/b",
      "    description: B",
      "---",
      ""
    ].join("\n"));

    const first = await backfillReferenceIds(ctx, file);
    expect(first.changed).toBe(true);
    expect(first.items).toHaveLength(2);
    first.items.forEach((reference) => expectGeneratedReferenceId(reference.id));
    expect(new Set(first.items.map((reference) => reference.id)).size).toBe(2);

    const second = await backfillReferenceIds(ctx, file);
    expect(second.changed).toBe(false);
    expect(second.items.map((reference) => reference.id)).toEqual(first.items.map((reference) => reference.id));
  });

  it("backfills id-less legacy items when the registry is written", async () => {
    const { ctx, app } = createTestContext();
    const file = await app.vault.create("Legacy.md", [
      "---",
      "references:",
      "  - https://example.com/legacy-a",
      "  - link: https://example.com/legacy-b",
      "    description: Legacy B",
      "  - link: https://example.com/numeric-id",
      "    id: \"123456\"",
      "---",
      ""
    ].join("\n"));

    await updateReferenceItem(ctx, file, 0, { description: "Legacy A" });

    const references = await readReferenceItemsFresh(ctx, file);
    expect(references).toHaveLength(3);
    references.forEach((reference) => expectGeneratedReferenceId(reference.id));
    const content = app.readPath("Legacy.md") ?? "";
    expect(content).toContain("id:");
    expect(content).toContain("link: https://example.com/legacy-a");
    expect(content).not.toContain("123456");
    expect(content).not.toContain("- https://example.com/legacy-a");
  });

  it("rejects duplicate hand-authored ids when a write normalizes references", async () => {
    const { ctx, app } = createTestContext();
    const file = await app.vault.create("Duplicate.md", [
      "---",
      "references:",
      "  - link: https://example.com/a",
      "    id: dup123",
      "  - link: https://example.com/b",
      "    id: dup123",
      "---",
      ""
    ].join("\n"));

    await expect(updateReferenceItem(ctx, file, 0, { description: "A" }))
      .rejects.toThrow('references[1].id: duplicate reference id "dup123"');
  });

  it("keeps ids stable across link edits and reorders", async () => {
    const { ctx, app } = createTestContext();
    const file = await app.vault.create("Stable.md", [
      "---",
      "references:",
      "  - link: https://example.com/a",
      "    id: abc123",
      "  - link: https://example.com/b",
      "    id: def456",
      "---",
      ""
    ].join("\n"));

    await updateReferenceItem(ctx, file, 0, { link: "https://example.com/a-edited" });
    let references = await readReferenceItemsFresh(ctx, file);
    expect(references.map((reference) => reference.id)).toEqual(["abc123", "def456"]);

    await reorderReferenceItems(ctx, file, [
      "https://example.com/b",
      "https://example.com/a-edited"
    ]);
    references = await readReferenceItemsFresh(ctx, file);
    expect(references.map((reference) => reference.id)).toEqual(["def456", "abc123"]);
    expect(references.map((reference) => reference.link)).toEqual([
      "https://example.com/b",
      "https://example.com/a-edited"
    ]);
  });
});

describe("ambiguous reference targets", () => {
  it("rejects a bare target shared by several notes (e.g. a resource and a same-named wiki page)", async () => {
    const { ctx, app } = createTestContext();
    await app.vault.create("PARA/Resources/Paper/Diffusion Policy.md", "---\ntype: resource\n---\n");
    await app.vault.create("LLM-Wiki/Reinforcement Learning/Diffusion Policy.md", "---\ntype: llm-wiki\n---\n");
    const source = await app.vault.create("Note.md", "---\ntype: resource\n---\n");

    await expect(insertReferenceItem(ctx, source, { link: "[[Diffusion Policy]]" })).rejects.toThrow(/ambiguous/i);
  });

  it("accepts an explicit path to one of several same-named notes (a human may cite either)", async () => {
    const { ctx, app } = createTestContext();
    await app.vault.create("PARA/Resources/Paper/Diffusion Policy.md", "---\ntype: resource\n---\n");
    await app.vault.create("LLM-Wiki/Reinforcement Learning/Diffusion Policy.md", "---\ntype: llm-wiki\n---\n");
    const source = await app.vault.create("Note.md", "---\ntype: resource\n---\n");

    const ref = await insertReferenceItem(ctx, source, {
      link: "[[PARA/Resources/Paper/Diffusion Policy.md|Diffusion Policy]]"
    });
    expect(ref.link).toBe("[[PARA/Resources/Paper/Diffusion Policy.md|Diffusion Policy]]");
  });

  it("still expands a unique bare target to its full path", async () => {
    const { ctx, app } = createTestContext();
    await app.vault.create("PARA/Resources/Paper/ASAP.md", "---\ntype: resource\n---\n");
    const source = await app.vault.create("Note.md", "---\ntype: resource\n---\n");

    const ref = await insertReferenceItem(ctx, source, { link: "[[ASAP]]" });
    expect(ref.link).toBe("[[PARA/Resources/Paper/ASAP.md]]");
  });
});
