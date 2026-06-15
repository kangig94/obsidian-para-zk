import { describe, expect, it } from "vitest";
import { auditVault, createLlmWiki } from "../../src/workflows";
import { createTestContext } from "../harness/vault";

describe("llm-wiki domain index hub", () => {
  it("auto-creates an empty <domain>/index hub (by-stamped, no body bleed)", async () => {
    const { ctx, app } = createTestContext();
    const res = await createLlmWiki(ctx, { title: "AI/Diffusion Policy", body: "CONCEPT_BODY_MARKER", open: false, by: "m" });
    expect(res.created).toBe(true);

    const index = app.readPath("LLM-Wiki/AI/index.md");
    expect(index).toBeTruthy();
    expect(index).toContain("type: llm-wiki");
    expect(index).toContain("llm-wiki/ai");
    expect(index).toContain("created_by: m");            // `by` propagated to the auto-created index
    expect(index).not.toContain("CONCEPT_BODY_MARKER");  // the concept's body did NOT bleed into the index
  });

  it("does not recreate or touch an existing domain index on later concepts", async () => {
    const { ctx, app } = createTestContext();
    await createLlmWiki(ctx, { title: "AI/Diffusion Policy", open: false });
    const before = app.readPath("LLM-Wiki/AI/index.md");
    await createLlmWiki(ctx, { title: "AI/PPO", open: false });
    expect(app.readPath("LLM-Wiki/AI/index.md")).toBe(before);
  });

  it("keeps a separate index per domain (resolved by path, not the global concept lookup)", async () => {
    const { ctx, app } = createTestContext();
    await createLlmWiki(ctx, { title: "AI/Diffusion Policy", open: false });
    await createLlmWiki(ctx, { title: "Robotics/TWIST", open: false });
    expect(app.readPath("LLM-Wiki/AI/index.md")).toBeTruthy();
    expect(app.readPath("LLM-Wiki/Robotics/index.md")).toBeTruthy();

    // Creating Robotics/index returns the Robotics one (already auto-minted), never AI's.
    const res = await createLlmWiki(ctx, { title: "Robotics/index", open: false });
    expect(res.path).toBe("LLM-Wiki/Robotics/index.md");
    expect(res.created).toBe(false);
  });

  it("flags a real orphan concept but never the <domain>/index hub", async () => {
    const { ctx } = createTestContext();
    await createLlmWiki(ctx, { title: "AI/Diffusion Policy", open: false }); // orphan concept + auto AI/index
    const report = await auditVault(ctx, { check: "orphan_wiki_page" });
    const paths = (report.findings as Array<{ path: string }>).map((finding) => finding.path);
    expect(paths).toContain("LLM-Wiki/AI/Diffusion Policy.md"); // a real orphan IS flagged (proves the audit ran)
    expect(paths).not.toContain("LLM-Wiki/AI/index.md");        // the hub is exempt
  });
});
