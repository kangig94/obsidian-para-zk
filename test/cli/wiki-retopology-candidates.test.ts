import { beforeEach, describe, expect, it } from "vitest";
import { wikiRetopologyCandidates } from "../../src/workflows";
import { createCliHarness, type CliHarness } from "../harness/cli";
import { createTestContext, type MockApp } from "../harness/vault";

let cli: CliHarness;

beforeEach(() => {
  cli = createCliHarness();
});

function markdown(body = ""): string {
  return ["---", "type: llm-wiki", "---", body].join("\n");
}

async function createWikiPage(app: MockApp, path: string, body = ""): Promise<void> {
  await app.vault.create(path, markdown(body));
}

describe("wiki retopology candidates", () => {
  it("ranks domain pairs from index bodies only", async () => {
    const { ctx, app } = createTestContext();
    await createWikiPage(
      app,
      "LLM-Wiki/language-models/index.md",
      "Transformer pretraining encoder decoder language model objective."
    );
    await createWikiPage(
      app,
      "LLM-Wiki/nlp-foundations/index.md",
      "Transformer pretraining language model sequence objective."
    );
    await createWikiPage(
      app,
      "LLM-Wiki/robotics/index.md",
      "Humanoid robot control contact state estimation."
    );

    const result = await wikiRetopologyCandidates(ctx, { limit: 2 });

    expect(result).toMatchObject({
      mode: "global",
      count: 3,
      limit: 2,
      returned: 2,
      has_more: true
    });
    expect(result.candidates[0].domains).toEqual(["language-models", "nlp-foundations"]);
    expect(result.candidates[0].shared_terms).toEqual(
      expect.arrayContaining(["transformer", "pretraining", "language"])
    );
    expect(result.candidates[0].score).toBeGreaterThan(result.candidates[1].score);
  });

  it("does not read concept pages when computing index-only candidates", async () => {
    const { ctx, app } = createTestContext();
    await createWikiPage(app, "LLM-Wiki/alpha/index.md", "Alpha overview.");
    await createWikiPage(app, "LLM-Wiki/beta/index.md", "Beta overview.");
    await createWikiPage(app, "LLM-Wiki/beta/Concept.md", "Alpha repeated concept text should not be read.");

    const originalRead = ctx.host.read;
    const readPaths: string[] = [];
    ctx.host.read = async (file) => {
      readPaths.push(file.path);
      return originalRead(file);
    };

    await wikiRetopologyCandidates(ctx, { limit: 10 });

    expect(readPaths.sort()).toEqual([
      "LLM-Wiki/alpha/index.md",
      "LLM-Wiki/beta/index.md"
    ]);
  });

  it("surfaces focused and global CLI envelopes with explicit index-link evidence", async () => {
    await createWikiPage(
      cli.app,
      "LLM-Wiki/language-models/index.md",
      "Foundation language models. Related deployment bridge: [[LLM-Wiki/robotics/index]]."
    );
    await createWikiPage(cli.app, "LLM-Wiki/robotics/index.md", "Humanoid control and state estimation.");

    const focused = await cli.run("para-zk:wiki-retopology-candidates", {
      domain: "language-models",
      limit: "1"
    });

    expect(focused).toMatchObject({
      ok: true,
      command: "para-zk:wiki-retopology-candidates",
      mode: "domain",
      domain: "language-models",
      count: 1,
      returned: 1,
      has_more: false
    });
    const focusedCandidate = (focused.candidates as Array<Record<string, unknown>>)[0];
    expect(focusedCandidate.domains).toEqual(["language-models", "robotics"]);
    expect(focusedCandidate.evidence).toContain("index link: language-models/index -> robotics/index");

    const global = await cli.run("para-zk:wiki-retopology-candidates", { limit: "1" });
    expect(global).toMatchObject({
      ok: true,
      command: "para-zk:wiki-retopology-candidates",
      mode: "global",
      count: 1,
      returned: 1
    });
  });

  it("rejects missing focused domain indexes and non-canonical aliases", async () => {
    await createWikiPage(cli.app, "LLM-Wiki/language-models/index.md", "Language models.");

    const missing = await cli.run("para-zk:wiki-retopology-candidates", { domain: "robotics" });
    expect(missing.ok).toBe(false);
    expect(String(missing.error)).toContain("domain index not found");

    const alias = await cli.run("para-zk:wiki-retopology-candidates", { focus: "language-models" });
    expect(alias.ok).toBe(false);
    expect(String(alias.error)).toContain("Use domain instead of focus");
  });
});
