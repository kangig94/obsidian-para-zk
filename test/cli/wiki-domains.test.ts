import { beforeEach, describe, expect, it } from "vitest";
import { createLlmWiki, wikiDomains } from "../../src/workflows";
import { createCliHarness, type CliHarness } from "../harness/cli";
import { createTestContext, type MockApp } from "../harness/vault";

let cli: CliHarness;

beforeEach(() => {
  cli = createCliHarness();
});

async function createRawWikiPage(app: MockApp, path: string): Promise<void> {
  await app.vault.create(path, ["---", "type: llm-wiki", "---", ""].join("\n"));
}

describe("wiki domains", () => {
  it("rosters domains with concept-page counts (excluding index) and hasIndex, sorted", async () => {
    const { ctx, app } = createTestContext();
    // createLlmWiki auto-mints each domain's <domain>/index hub.
    await createLlmWiki(ctx, { title: "AI/Diffusion Policy", open: false });
    await createLlmWiki(ctx, { title: "AI/PPO", open: false });
    await createLlmWiki(ctx, { title: "Robotics/TWIST", open: false });
    // A legacy domain seeded without createLlmWiki has concept pages but no index hub.
    await createRawWikiPage(app, "LLM-Wiki/Legacy/Old Concept.md");
    // An index-only domain: the hub exists with zero concept pages yet.
    await createRawWikiPage(app, "LLM-Wiki/Empty/index.md");

    const result = await wikiDomains(ctx, { limit: "all" });

    expect(result.count).toBe(4);
    expect(result.domains).toEqual([
      { domain: "AI", pages: 2, has_index: true },        // 2 concepts, index excluded from count
      { domain: "Empty", pages: 0, has_index: true },     // hub only, no concept pages
      { domain: "Legacy", pages: 1, has_index: false },   // concept page, no index hub
      { domain: "Robotics", pages: 1, has_index: true }
    ]);
  });

  it("does not count a domain-less flat wiki page as a domain", async () => {
    const { ctx, app } = createTestContext();
    await createRawWikiPage(app, "LLM-Wiki/Floating.md");

    const result = await wikiDomains(ctx, { limit: "all" });
    expect(result.domains).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("only treats lowercase index.md as the domain hub", async () => {
    const { ctx, app } = createTestContext();
    await createRawWikiPage(app, "LLM-Wiki/Case/Index.md");

    const result = await wikiDomains(ctx, { limit: "all" });
    expect(result.domains).toEqual([{ domain: "Case", pages: 1, has_index: false }]);
  });

  it("paginates the domain roster", async () => {
    const { ctx } = createTestContext();
    await createLlmWiki(ctx, { title: "AI/X", open: false });
    await createLlmWiki(ctx, { title: "Bio/Y", open: false });
    await createLlmWiki(ctx, { title: "Chem/Z", open: false });

    const page = await wikiDomains(ctx, { offset: 1, limit: 1 });
    expect(page).toMatchObject({ count: 3, offset: 1, limit: 1, returned: 1, has_more: true });
    expect(page.domains).toEqual([{ domain: "Bio", pages: 1, has_index: true }]);
  });

  it("surfaces the stable CLI envelope and rejects offset/limit aliases", async () => {
    await cli.run("para-zk:create-llm-wiki", { title: "AI/Diffusion Policy" });

    const result = await cli.run("para-zk:wiki-domains", { limit: "all" });
    expect(result).toMatchObject({
      ok: true,
      command: "para-zk:wiki-domains",
      count: 1,
      returned: 1,
      has_more: false
    });
    expect((result.domains as Array<Record<string, unknown>>)[0]).toMatchObject({
      domain: "AI",
      pages: 1,
      has_index: true
    });

    const maxAliased = await cli.run("para-zk:wiki-domains", { max: 1 });
    expect(maxAliased.ok).toBe(false);
    expect(String(maxAliased.error)).toContain("limit");

    const startAliased = await cli.run("para-zk:wiki-domains", { start: 1 });
    expect(startAliased.ok).toBe(false);
    expect(String(startAliased.error)).toContain("offset");
  });
});
