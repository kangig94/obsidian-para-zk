import { describe, expect, it } from "vitest";
import { auditVault } from "../../src/workflows";
import { createTestContext } from "../harness/vault";

function legacyManagedNote(): string {
  return [
    "---",
    "type: project",
    "title: Legacy",
    "tags:",
    "  - keep-me",
    "---",
    "",
    "```para-zk-props",
    "status: active",
    "```",
    "",
    "# Summary",
    "",
    "Keep this body.",
    "",
    "```ts",
    "const marker = \"```para-zk-props inside a string\";",
    "```",
    "",
    "```para-zk-managed",
    "```",
    ""
  ].join("\n");
}

function legacyPropsOnlyNote(): string {
  return [
    "---",
    "type: project",
    "title: Props Only",
    "---",
    "",
    "```para-zk-props",
    "status: active",
    "```",
    "",
    "# Summary",
    "",
    "Keep this body."
  ].join("\n");
}

function legacyManagedOnlyNote(): string {
  return [
    "---",
    "type: project",
    "title: Managed Only",
    "---",
    "",
    "# Summary",
    "",
    "Keep this body.",
    "",
    "```para-zk-managed",
    "```",
    ""
  ].join("\n");
}

describe("audit managed_block_in_body", () => {
  it("flags legacy para-zk managed scaffolding in note bodies", async () => {
    const { ctx, app } = createTestContext();
    await app.vault.create("PARA/Projects/Legacy/Legacy.md", legacyManagedNote());

    const report = await auditVault(ctx, { check: "managed_block_in_body", limit: "all" });

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toMatchObject({
      code: "managed_block_in_body",
      severity: "low",
      path: "PARA/Projects/Legacy/Legacy.md",
      type: "project",
      detail: { props: 1, managed: 1, total: 2 }
    });
    expect(report.findings[0].fix).toContain("para-zk:audit fix=true");
  });

  it("does not flag fenceless notes", async () => {
    const { ctx, app } = createTestContext();
    await app.vault.create("PARA/Projects/Clean/Clean.md", [
      "---",
      "type: project",
      "title: Clean",
      "---",
      "",
      "# Summary",
      "",
      "No managed fences here."
    ].join("\n"));

    const report = await auditVault(ctx, { check: "managed_block_in_body", limit: "all" });

    expect(report.findings).toHaveLength(0);
    expect(report.counts.managed_block_in_body).toBe(0);
  });

  it("flags and fixes notes with only a leading props fence", async () => {
    const { ctx, app } = createTestContext();
    const path = "PARA/Projects/Props Only/Props Only.md";
    await app.vault.create(path, legacyPropsOnlyNote());

    const report = await auditVault(ctx, { check: "managed_block_in_body", limit: "all" });

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toMatchObject({
      code: "managed_block_in_body",
      path,
      detail: { props: 1, managed: 0, total: 1 }
    });

    const fixed = await auditVault(ctx, { check: "managed_block_in_body", fix: true, limit: "all" });

    expect(fixed.fixed).toEqual([
      { code: "managed_block_in_body", path, action: "stripManagedBlocks" }
    ]);
    expect(app.readPath(path)).toBe([
      "---",
      "type: project",
      "title: Props Only",
      "---",
      "# Summary",
      "",
      "Keep this body."
    ].join("\n"));
  });

  it("flags and fixes notes with only a trailing managed fence", async () => {
    const { ctx, app } = createTestContext();
    const path = "PARA/Projects/Managed Only/Managed Only.md";
    await app.vault.create(path, legacyManagedOnlyNote());

    const report = await auditVault(ctx, { check: "managed_block_in_body", limit: "all" });

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toMatchObject({
      code: "managed_block_in_body",
      path,
      detail: { props: 0, managed: 1, total: 1 }
    });

    const fixed = await auditVault(ctx, { check: "managed_block_in_body", fix: true, limit: "all" });

    expect(fixed.fixed).toEqual([
      { code: "managed_block_in_body", path, action: "stripManagedBlocks" }
    ]);
    expect(app.readPath(path)).toBe([
      "---",
      "type: project",
      "title: Managed Only",
      "---",
      "",
      "# Summary",
      "",
      "Keep this body."
    ].join("\n"));
  });

  it("fix=true strips legacy fences while preserving frontmatter and user body, then becomes idempotent", async () => {
    const { ctx, app } = createTestContext();
    const path = "PARA/Projects/Legacy/Legacy.md";
    await app.vault.create(path, legacyManagedNote());

    const fixed = await auditVault(ctx, { fix: true, limit: "all" });

    expect(fixed.fixed).toEqual([
      { code: "managed_block_in_body", path, action: "stripManagedBlocks" }
    ]);
    expect(fixed.findings).toHaveLength(0);
    expect(app.readPath(path)).toBe([
      "---",
      "type: project",
      "title: Legacy",
      "tags:",
      "  - keep-me",
      "---",
      "# Summary",
      "",
      "Keep this body.",
      "",
      "```ts",
      "const marker = \"```para-zk-props inside a string\";",
      "```"
    ].join("\n"));

    const afterFirstFix = app.readPath(path);
    const second = await auditVault(ctx, { fix: true, limit: "all" });

    expect(second.fixed).toEqual([]);
    expect(second.findings).toHaveLength(0);
    expect(app.readPath(path)).toBe(afterFirstFix);
  });
});
