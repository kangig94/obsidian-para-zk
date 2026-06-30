import { beforeEach, describe, expect, it } from "vitest";
import { Platform } from "obsidian";
import type { ParaZkPluginContext } from "../../src/plugin-interface";
import { workflowContext } from "../../src/vault/host";
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

  it("adds body bigrams to index similarity without indexing concept pages", async () => {
    const { ctx, app } = createTestContext();
    await createWikiPage(app, "LLM-Wiki/alpha/index.md", "Diffusion policy trains robot action.");
    await createWikiPage(app, "LLM-Wiki/beta/index.md", "Diffusion policy learns control action.");
    await createWikiPage(app, "LLM-Wiki/gamma/index.md", "Diffusion planning policy studies action.");
    await createWikiPage(app, "LLM-Wiki/beta/diffusion-policy.md", "Concept body must not affect ranking.");

    const result = await wikiRetopologyCandidates(ctx, { limit: 10 });
    const phrasePair = result.candidates.find((candidate) => candidate.domains.join("/") === "alpha/beta");
    const splitPair = result.candidates.find((candidate) => candidate.domains.join("/") === "alpha/gamma");
    if (!phrasePair || !splitPair) throw new Error("expected bigram comparison pairs");

    expect(phrasePair.score).toBeGreaterThan(splitPair.score);
    expect(phrasePair.shared_terms).toContain("diffusion policy");
  });

  it("does not create body bigrams across markdown section boundaries", async () => {
    const { ctx, app } = createTestContext();
    await createWikiPage(app, "LLM-Wiki/alpha/index.md", "Left bridge.\n## Boundary\nRight bridge.");
    await createWikiPage(app, "LLM-Wiki/beta/index.md", "Boundary right bridge.");

    const cache = new Map<string, string>();
    ctx.cache = {
      readText: async (name) => cache.get(name),
      writeText: async (name, value) => {
        cache.set(name, value);
      }
    };

    await wikiRetopologyCandidates(ctx, { limit: 10 });
    const cached = JSON.parse(cache.get("retopology-cache.json") ?? "{}") as Record<string, unknown>;
    const alphaEntry = (cached.indexes as Record<string, unknown>)["LLM-Wiki/alpha/index.md"] as unknown[];
    const alphaTerms = alphaEntry[2] as Record<string, number>;

    expect(alphaTerms).toMatchObject({
      "left bridge": 0.4,
      "right bridge": 0.4
    });
    expect(alphaTerms).not.toHaveProperty("bridge boundary");
    expect(alphaTerms).not.toHaveProperty("boundary right");
  });

  it("blends cosine with weighted overlap so shared bridges are not over-penalized", async () => {
    const { ctx, app } = createTestContext();
    await createWikiPage(app, "LLM-Wiki/alpha/index.md", "Shared bridge.");
    await createWikiPage(app, "LLM-Wiki/beta/index.md", "Shared bridge.");

    const result = await wikiRetopologyCandidates(ctx, { limit: 10 });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].score).toBeGreaterThan(0.08);
    expect(result.candidates[0].shared_terms).toEqual(
      expect.arrayContaining(["shared", "bridge", "shared bridge"])
    );
  });

  it("caches index term counts and invalidates them by file stat", async () => {
    const { ctx, app } = createTestContext();
    await createWikiPage(app, "LLM-Wiki/alpha/index.md", "Diffusion policy action.");
    await createWikiPage(app, "LLM-Wiki/beta/index.md", "Diffusion policy control.");

    const cache = new Map<string, string>();
    ctx.cache = {
      readText: async (name) => cache.get(name),
      writeText: async (name, value) => {
        cache.set(name, value);
      }
    };

    await wikiRetopologyCandidates(ctx, { limit: 10 });
    const cached = JSON.parse(cache.get("retopology-cache.json") ?? "{}") as Record<string, unknown>;
    const alphaEntry = (cached.indexes as Record<string, unknown>)["LLM-Wiki/alpha/index.md"] as unknown[];
    expect(cached.key).toEqual(expect.stringMatching(/^fnv1a-/));
    expect(cached).toHaveProperty("indexes");
    expect(cached).not.toHaveProperty("k");
    expect(cached).not.toHaveProperty("i");
    expect(cached).not.toHaveProperty("v");
    expect(cached).not.toHaveProperty("version");
    expect(alphaEntry).toHaveLength(3);
    expect(alphaEntry[2]).toMatchObject({ "diffusion policy": 0.4 });

    const originalRead = ctx.host.read;
    const readPaths: string[] = [];
    ctx.host.read = async (file) => {
      readPaths.push(file.path);
      return originalRead(file);
    };

    await wikiRetopologyCandidates(ctx, { limit: 10 });
    expect(readPaths).toEqual([]);

    const alpha = app.vault.getFileByPath("LLM-Wiki/alpha/index.md");
    if (!alpha) throw new Error("expected alpha index");
    await app.vault.modify(alpha, markdown("Diffusion policy action changed."));

    await wikiRetopologyCandidates(ctx, { limit: 10 });
    expect(readPaths).toContain("LLM-Wiki/alpha/index.md");
  });

  it("ignores oversized retopology cache payloads and rewrites them", async () => {
    const { ctx, app } = createTestContext();
    await createWikiPage(app, "LLM-Wiki/alpha/index.md", "Diffusion policy action.");
    await createWikiPage(app, "LLM-Wiki/beta/index.md", "Diffusion policy control.");

    const cache = new Map<string, string>();
    ctx.cache = {
      readText: async (name) => cache.get(name),
      writeText: async (name, value) => {
        cache.set(name, value);
      }
    };

    await wikiRetopologyCandidates(ctx, { limit: 10 });
    const cached = JSON.parse(cache.get("retopology-cache.json") ?? "{}") as Record<string, unknown>;
    cache.set("retopology-cache.json", `${JSON.stringify({
      ...cached,
      padding: "x".repeat(16 * 1024 * 1024)
    })}\n`);

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
    expect(cache.get("retopology-cache.json")?.length).toBeLessThan(16 * 1024 * 1024);
  });

  it("skips overlong generated terms and heals caches that contain them", async () => {
    const { ctx, app } = createTestContext();
    const overlongTerm = "x".repeat(129);
    await createWikiPage(app, "LLM-Wiki/alpha/index.md", `${overlongTerm} diffusion policy action.`);
    await createWikiPage(app, "LLM-Wiki/beta/index.md", "Diffusion policy control.");

    const cache = new Map<string, string>();
    ctx.cache = {
      readText: async (name) => cache.get(name),
      writeText: async (name, value) => {
        cache.set(name, value);
      }
    };

    await wikiRetopologyCandidates(ctx, { limit: 10 });
    const cached = JSON.parse(cache.get("retopology-cache.json") ?? "{}") as Record<string, unknown>;
    const indexes = cached.indexes as Record<string, unknown[]>;
    const alphaTerms = indexes["LLM-Wiki/alpha/index.md"][2] as Record<string, number>;
    expect(alphaTerms).not.toHaveProperty(overlongTerm);
    expect(Object.keys(alphaTerms).every((term) => term.length <= 128)).toBe(true);

    alphaTerms[overlongTerm] = 1;
    cache.set("retopology-cache.json", `${JSON.stringify(cached)}\n`);

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
    const healed = JSON.parse(cache.get("retopology-cache.json") ?? "{}") as Record<string, unknown>;
    const healedEntry = (healed.indexes as Record<string, unknown[]>)["LLM-Wiki/alpha/index.md"];
    const healedTerms = healedEntry[2] as Record<string, number>;
    expect(healedTerms).not.toHaveProperty(overlongTerm);
  });

  it("warns when retopology cache usage exceeds 95 percent of the configured MiB limit", async () => {
    const { ctx, app } = createTestContext();
    ctx.settings.retopologyCacheMaxMiB = 1;
    const largeBody = Array.from({ length: 30_000 }, (_item, index) => `term${index}`).join(" ");
    await createWikiPage(app, "LLM-Wiki/alpha/index.md", largeBody);
    await createWikiPage(app, "LLM-Wiki/beta/index.md", "Diffusion policy control.");

    const cache = new Map<string, string>();
    ctx.cache = {
      readText: async (name) => cache.get(name),
      writeText: async (name, value) => {
        cache.set(name, value);
      }
    };

    const result = await wikiRetopologyCandidates(ctx, { limit: 10 });

    expect(result.warnings?.[0]).toContain("optsidian config");
    expect(result.warnings?.[0]).toContain("retopologyCacheMaxMiB");
    expect(result.warnings?.[0]).toMatch(/현재 1 MiB 중 \d+% 도달했습니다\./);
  });

  it("replaces the plugin cache through a unique temp file and cleans stale temps", async () => {
    const { ctx: baseCtx, app } = createTestContext();
    const pluginDir = ".obsidian/plugins/para-zk";
    const cachePath = `${pluginDir}/retopology-cache.json`;
    const staleTempPath = `${cachePath}.1-dead.tmp`;
    const ctx = workflowContext({
      app,
      settings: baseCtx.settings,
      manifest: { id: "para-zk", dir: pluginDir }
    } as unknown as ParaZkPluginContext);
    await createWikiPage(app, "LLM-Wiki/alpha/index.md", "Diffusion policy action.");
    await createWikiPage(app, "LLM-Wiki/beta/index.md", "Diffusion policy control.");
    await app.vault.adapter.write(staleTempPath, "stale");

    await wikiRetopologyCandidates(ctx, { limit: 10 });

    const cached = JSON.parse(app.readPath(cachePath) ?? "{}") as Record<string, unknown>;
    expect(cached.key).toEqual(expect.stringMatching(/^fnv1a-/));
    expect(cached).toHaveProperty("indexes");
    expect(app.listPaths()).not.toContain(staleTempPath);
    expect(app.listPaths().filter((path) => path.startsWith(`${cachePath}.`) && path.endsWith(".tmp"))).toEqual([]);
  });

  it("does not expose the plugin cache outside the desktop app", async () => {
    const { ctx: baseCtx, app } = createTestContext();
    const pluginDir = ".obsidian/plugins/para-zk";
    const originalPlatform = {
      isDesktop: Platform.isDesktop,
      isMobile: Platform.isMobile,
      isDesktopApp: Platform.isDesktopApp,
      isMobileApp: Platform.isMobileApp
    };
    Platform.isDesktop = false;
    Platform.isMobile = true;
    Platform.isDesktopApp = false;
    Platform.isMobileApp = true;

    try {
      const ctx = workflowContext({
        app,
        settings: baseCtx.settings,
        manifest: { id: "para-zk", dir: pluginDir }
      } as unknown as ParaZkPluginContext);
      await createWikiPage(app, "LLM-Wiki/alpha/index.md", "Diffusion policy action.");
      await createWikiPage(app, "LLM-Wiki/beta/index.md", "Diffusion policy control.");

      expect(ctx.cache).toBeUndefined();
      await wikiRetopologyCandidates(ctx, { limit: 10 });
      expect(app.readPath(`${pluginDir}/retopology-cache.json`)).toBeUndefined();
    } finally {
      Platform.isDesktop = originalPlatform.isDesktop;
      Platform.isMobile = originalPlatform.isMobile;
      Platform.isDesktopApp = originalPlatform.isDesktopApp;
      Platform.isMobileApp = originalPlatform.isMobileApp;
    }
  });

  it("skips cache writes when index files change during rebuild", async () => {
    const { ctx, app } = createTestContext();
    await createWikiPage(app, "LLM-Wiki/alpha/index.md", "Diffusion policy action.");
    await createWikiPage(app, "LLM-Wiki/beta/index.md", "Diffusion policy control.");

    let writes = 0;
    ctx.cache = {
      readText: async () => undefined,
      writeText: async () => {
        writes += 1;
      }
    };
    const originalRead = ctx.host.read;
    let changed = false;
    ctx.host.read = async (file) => {
      const text = await originalRead(file);
      if (!changed && file.path === "LLM-Wiki/alpha/index.md") {
        changed = true;
        await app.vault.modify(file, markdown("Diffusion policy action changed during rebuild."));
      }
      return text;
    };

    await wikiRetopologyCandidates(ctx, { limit: 10 });
    expect(writes).toBe(0);

    await wikiRetopologyCandidates(ctx, { limit: 10 });
    expect(writes).toBe(1);
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
