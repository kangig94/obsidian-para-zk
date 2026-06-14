import { describe, expect, it } from "vitest";
import { auditVault } from "../../src/workflows";
import { createTestContext } from "../harness/vault";

function noteWithBareRef(link: string): string {
  return ["---", "type: resource", "references:", `  - link: "${link}"`, "    id: aaa111", "---", "body line"].join("\n");
}

describe("audit bare_reference", () => {
  it("flags a unique bare reference as fixable and expands its link in frontmatter, leaving the body untouched", async () => {
    const { ctx, app } = createTestContext();
    await app.vault.create("PARA/Resources/Paper/ASAP.md", "---\ntype: resource\n---\n");
    await app.vault.create("Note.md", noteWithBareRef("[[ASAP]]"));

    const report = await auditVault(ctx, { check: "bare_reference" });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].code).toBe("bare_reference");
    expect(report.findings[0].detail.resolved).toBe("PARA/Resources/Paper/ASAP.md");

    const fixedReport = await auditVault(ctx, { check: "bare_reference", fix: true });
    expect(fixedReport.fixed).toEqual([
      { code: "bare_reference", path: "Note.md", action: "expandBareReferenceLinks" }
    ]);
    expect(fixedReport.findings).toHaveLength(0);

    const after = app.readPath("Note.md");
    expect(after).toContain("[[PARA/Resources/Paper/ASAP.md|ASAP]]");
    expect(after).toContain("body line");
  });

  it("reports an ambiguous bare reference and does NOT fix it", async () => {
    const { ctx, app } = createTestContext();
    await app.vault.create("PARA/Resources/Paper/Diffusion Policy.md", "---\ntype: resource\n---\n");
    await app.vault.create("LLM-Wiki/Reinforcement Learning/Diffusion Policy.md", "---\ntype: llm-wiki\n---\n");
    await app.vault.create("Note.md", noteWithBareRef("[[Diffusion Policy]]"));

    const report = await auditVault(ctx, { check: "bare_reference", fix: true });
    const finding = report.findings.find((entry) => entry.code === "bare_reference");
    expect(finding?.detail.ambiguous).toBe(true);
    expect((report.fixed ?? []).filter((entry) => entry.code === "bare_reference")).toEqual([]);
    expect(app.readPath("Note.md")).toContain("[[Diffusion Policy]]");
  });

  it("ignores a reference that already carries an explicit path", async () => {
    const { ctx, app } = createTestContext();
    await app.vault.create("PARA/Resources/Paper/ASAP.md", "---\ntype: resource\n---\n");
    await app.vault.create("Note.md", noteWithBareRef("[[PARA/Resources/Paper/ASAP.md|ASAP]]"));

    const report = await auditVault(ctx, { check: "bare_reference" });
    expect(report.findings).toHaveLength(0);
  });
});
