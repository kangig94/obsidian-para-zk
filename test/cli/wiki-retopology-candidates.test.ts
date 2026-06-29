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

  it("weights ranking and shared terms by index-wide TF-IDF contribution", async () => {
    const { ctx, app } = createTestContext();
    await createWikiPage(app, "LLM-Wiki/alpha/index.md", "shared bridge transformer retrieval.");
    await createWikiPage(app, "LLM-Wiki/beta/index.md", "shared bridge transformer.");
    await createWikiPage(app, "LLM-Wiki/gamma/index.md", "shared bridge retrieval.");
    await createWikiPage(app, "LLM-Wiki/delta/index.md", "shared bridge retrieval.");

    const result = await wikiRetopologyCandidates(ctx, { limit: 10 });
    const rarePair = result.candidates.find((candidate) => candidate.domains.join("/") === "alpha/beta");
    const commonPair = result.candidates.find((candidate) => candidate.domains.join("/") === "delta/gamma");
    if (!rarePair || !commonPair) throw new Error("expected TF-IDF comparison pairs");

    expect(result.candidates[0].domains).toEqual(["alpha", "beta"]);
    expect(rarePair.score).toBeGreaterThan(commonPair.score);
    expect(rarePair.shared_terms[0]).toBe("transformer");
    expect(commonPair.shared_terms[0]).toBe("retrieval");
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

  it("surfaces focused and global CLI payloads with explicit index-link evidence", async () => {
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
    expect(focused.graph).toMatchObject({
      root: "language-models",
      depth: 2,
      nodes: [
        { domain: "language-models", index: "language-models/index", distance: 0 },
        { domain: "robotics", index: "robotics/index", distance: 1, path: ["language-models", "robotics"] }
      ]
    });

    const global = await cli.run("para-zk:wiki-retopology-candidates", { limit: "1" });
    expect(global).toMatchObject({
      ok: true,
      command: "para-zk:wiki-retopology-candidates",
      mode: "global",
      count: 1,
      returned: 1
    });
    expect(global).not.toHaveProperty("graph");
    const globalCandidate = (global.candidates as Array<Record<string, unknown>>)[0];
    expect(globalCandidate.connection).toMatchObject({
      connected: true,
      depth: 2,
      distance: 1,
      path: ["language-models", "robotics"]
    });
  });

  it("scores wikilinks by visible labels while keeping link evidence", async () => {
    await createWikiPage(
      cli.app,
      "LLM-Wiki/alpha/index.md",
      "Alpha bridge points at [[LLM-Wiki/beta/hydraulic-actuator]] and [[LLM-Wiki/beta/contact-model|contact dynamics]]."
    );
    await createWikiPage(cli.app, "LLM-Wiki/beta/index.md", "Hydraulic actuator contact dynamics.");
    await createWikiPage(cli.app, "LLM-Wiki/beta/hydraulic-actuator.md", "Hydraulic actuator detail.");
    await createWikiPage(cli.app, "LLM-Wiki/beta/contact-model.md", "Contact model detail.");

    const result = await cli.run("para-zk:wiki-retopology-candidates", { limit: "1" });

    expect(result).toMatchObject({ ok: true });
    expect(result).not.toHaveProperty("links");
    const candidate = (result.candidates as Array<Record<string, unknown>>)[0];
    expect(candidate.explicit_links).toHaveLength(2);
    expect(candidate.evidence).toContain("index link: alpha/index -> beta/contact-model");
    expect(candidate.shared_terms).toEqual(
      expect.arrayContaining(["hydraulic", "actuator", "contact", "dynamics"])
    );
    expect(candidate.shared_terms).not.toContain("beta");
    expect(candidate.score as number).toBeGreaterThan(0);
  });

  it("returns an undirected index graph for focused domains with configurable depth", async () => {
    const { ctx, app } = createTestContext();
    await createWikiPage(app, "LLM-Wiki/a/index.md", "A links [[LLM-Wiki/c/index]].");
    await createWikiPage(app, "LLM-Wiki/b/index.md", "B is isolated.");
    await createWikiPage(app, "LLM-Wiki/c/index.md", "C links [[LLM-Wiki/e/index]].");
    await createWikiPage(app, "LLM-Wiki/d/index.md", "D links back [[LLM-Wiki/a/index]].");
    await createWikiPage(app, "LLM-Wiki/e/index.md", "E terminal.");
    await createWikiPage(app, "LLM-Wiki/f/index.md", "F links a concept only [[LLM-Wiki/a/Concept]].");
    await createWikiPage(app, "LLM-Wiki/a/Concept.md", "Concept body must not create an index graph node.");

    const depthOne = await wikiRetopologyCandidates(ctx, { domain: "a", depth: 1, limit: 10 });
    expect(depthOne.graph?.nodes.map((node) => [node.domain, node.distance, node.path])).toEqual([
      ["a", 0, ["a"]],
      ["c", 1, ["a", "c"]],
      ["d", 1, ["a", "d"]]
    ]);
    expect(depthOne.graph?.edges.map((edge) => edge.domains)).toEqual([
      ["a", "c"],
      ["a", "d"]
    ]);

    const defaultDepth = await wikiRetopologyCandidates(ctx, { domain: "a", limit: 10 });
    expect(defaultDepth.graph?.depth).toBe(2);
    expect(defaultDepth.graph?.nodes.map((node) => [node.domain, node.distance, node.path])).toEqual([
      ["a", 0, ["a"]],
      ["c", 1, ["a", "c"]],
      ["d", 1, ["a", "d"]],
      ["e", 2, ["a", "c", "e"]]
    ]);

    const globalDepthTwo = await wikiRetopologyCandidates(ctx, { depth: 2, limit: 100 });
    const ae = globalDepthTwo.candidates.find((candidate) => candidate.domains.join("/") === "a/e");
    expect(ae?.connection).toMatchObject({
      connected: true,
      depth: 2,
      distance: 2,
      path: ["a", "c", "e"],
      edges: [
        { domains: ["a", "c"] },
        { domains: ["c", "e"] }
      ]
    });
    const af = globalDepthTwo.candidates.find((candidate) => candidate.domains.join("/") === "a/f");
    expect(af?.connection).toMatchObject({
      connected: false,
      depth: 2,
      distance: null,
      path: [],
      edges: []
    });

    const globalDepthOne = await wikiRetopologyCandidates(ctx, { depth: 1, limit: 100 });
    const shallowAe = globalDepthOne.candidates.find((candidate) => candidate.domains.join("/") === "a/e");
    expect(shallowAe?.connection).toMatchObject({
      connected: false,
      depth: 1,
      distance: null
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

    const globalDepth = await cli.run("para-zk:wiki-retopology-candidates", { depth: "2" });
    expect(globalDepth.ok).toBe(true);
  });
});
