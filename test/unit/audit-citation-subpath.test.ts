import { describe, expect, it } from "vitest";
import { auditVault } from "../../src/workflows";
import { createTestContext } from "../harness/vault";

// A wiki note that cites `Refs/Source.md` (id aaa111) with the given body.
function citingNote(body: string): string {
  return [
    "---",
    "type: llm-wiki",
    "references:",
    "  - link: \"[[Refs/Source.md|Source]]\"",
    "    id: aaa111",
    "---",
    body
  ].join("\n");
}

const SOURCE = [
  "---",
  "type: resource",
  "---",
  "## Real Heading",
  "body",
  "### 3. Numbered Section",
  "more",
  "A quotable line ^blk1"
].join("\n");

describe("audit bad_citation_subpath", () => {
  it("flags a citation #section that matches no source heading", async () => {
    const { ctx, app } = createTestContext();
    await app.vault.create("Refs/Source.md", SOURCE);
    await app.vault.create("Note.md", citingNote("see `PZ[aaa111#Made Up Heading]`"));

    const report = await auditVault(ctx, { check: "bad_citation_subpath" });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toMatchObject({
      code: "bad_citation_subpath",
      path: "Note.md",
      detail: { id: "aaa111", subpath: "Made Up Heading" }
    });
  });

  it("accepts a verbatim heading, a block id, and a plain PZ[id] without a subpath", async () => {
    const { ctx, app } = createTestContext();
    await app.vault.create("Refs/Source.md", SOURCE);
    await app.vault.create("Note.md", citingNote(
      "a `PZ[aaa111]` b `PZ[aaa111#Real Heading]` c `PZ[aaa111#3. Numbered Section]` d `PZ[aaa111#^blk1]`"
    ));

    const report = await auditVault(ctx, { check: "bad_citation_subpath" });
    expect(report.findings).toHaveLength(0);
  });

  it("flags a dropped leading number (the observed regression)", async () => {
    const { ctx, app } = createTestContext();
    await app.vault.create("Refs/Source.md", SOURCE);
    // Real heading is "### 3. Numbered Section"; citing "#Numbered Section" drops the "3. ".
    await app.vault.create("Note.md", citingNote("ref `PZ[aaa111#Numbered Section]`"));

    const report = await auditVault(ctx, { check: "bad_citation_subpath" });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toMatchObject({ code: "bad_citation_subpath", path: "Note.md", detail: { subpath: "Numbered Section" } });
  });

  it("does not flag a citation whose id is absent from the note's references", async () => {
    const { ctx, app } = createTestContext();
    await app.vault.create("Refs/Source.md", SOURCE);
    await app.vault.create("Note.md", citingNote("orphan `PZ[zzz999#Made Up Heading]`"));

    const report = await auditVault(ctx, { check: "bad_citation_subpath" });
    expect(report.findings).toHaveLength(0);
  });

  it("flags a #section on a URL reference (nothing to anchor into)", async () => {
    const { ctx, app } = createTestContext();
    await app.vault.create("Note.md", [
      "---",
      "type: llm-wiki",
      "references:",
      "  - link: https://example.com/paper",
      "    id: url111",
      "---",
      "see `PZ[url111#Some Section]`"
    ].join("\n"));

    const report = await auditVault(ctx, { check: "bad_citation_subpath" });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toMatchObject({ code: "bad_citation_subpath", detail: { id: "url111", target: "https://example.com/paper" } });
  });

  it("does not treat a heading inside a fenced code block as an anchor", async () => {
    const { ctx, app } = createTestContext();
    await app.vault.create("Refs/Source.md", ["---", "type: resource", "---", "## Real Heading", "```", "# Fenced Heading", "```", ""].join("\n"));
    await app.vault.create("Note.md", citingNote("x `PZ[aaa111#Fenced Heading]`"));

    const report = await auditVault(ctx, { check: "bad_citation_subpath" });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].detail).toMatchObject({ subpath: "Fenced Heading" });
  });

  it("reports a repeated bad (id, subpath) once", async () => {
    const { ctx, app } = createTestContext();
    await app.vault.create("Refs/Source.md", SOURCE);
    await app.vault.create("Note.md", citingNote("a `PZ[aaa111#Made Up]` b `PZ[aaa111#Made Up]`"));

    const report = await auditVault(ctx, { check: "bad_citation_subpath" });
    expect(report.findings).toHaveLength(1);
  });
});
