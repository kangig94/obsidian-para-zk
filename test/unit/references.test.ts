import { describe, expect, it } from "vitest";
import {
  insertReferenceItem,
  readReferenceItemsFresh,
  reorderReferenceItems,
  updateReferenceItem
} from "../../src/workflows";
import { createTestContext } from "../harness/vault";

describe("reference ids", () => {
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

function expectGeneratedReferenceId(id: string): void {
  expect(id).toMatch(/^[a-z0-9]{6}$/i);
  expect(id).toMatch(/[a-z]/i);
}
