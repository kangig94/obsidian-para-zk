import { beforeEach, describe, expect, it } from "vitest";
import { frontmatterTimeMs } from "../../src/time";
import { wikiIngestCandidates } from "../../src/workflows";
import { createCliHarness, type CliHarness } from "../harness/cli";
import { createTestContext, type MockApp } from "../harness/vault";

let cli: CliHarness;

beforeEach(() => {
  cli = createCliHarness();
});

function markdown(frontmatter: string[], body = ""): string {
  return ["---", ...frontmatter, "---", body].join("\n");
}

async function createNote(app: MockApp, path: string, frontmatter: string[], body = ""): Promise<void> {
  await app.vault.create(path, markdown(frontmatter, body));
}

async function seedCandidateVault(app: MockApp): Promise<void> {
  await createNote(
    app,
    "PARA/Resources/Uncited.md",
    ["type: resource", "updated: 2026-01-01 09:00"],
    "This body must not be read."
  );
  await createNote(
    app,
    "PARA/Resources/Cited Null Wiki Only.md",
    ["type: resource", "updated: 2026-04-01 09:00"],
    "This body must not be read."
  );
  await createNote(
    app,
    "PARA/Resources/Cited Stale.md",
    ["type: resource", "updated: 2026-02-01T09:00"],
    "This body must not be read."
  );
  await createNote(
    app,
    "PARA/Resources/Cited Fresh.md",
    ["type: resource", "updated: 2026-03-01 09:00"],
    "This body must not be read."
  );
  await createNote(app, "PARA/Archives/Resources/Archived.md", ["type: resource", "updated: 2026-01-01 09:00"]);
  await createNote(app, "Templates/para-zk/template_resource.md", ["type: resource", "updated: 2026-01-01 09:00"]);
  await createNote(app, "Notes/Plain.md", ["type: note", "updated: 2026-01-01 09:00"]);
  await createNote(app, "ZK/Digests/Uncited Digest.md", ["type: digest", "updated: 2026-01-01 09:00"]);
  await createNote(app, "ZK/Permanent/Uncited Permanent.md", ["type: permanent", "updated: 2026-01-01 09:00"]);
  await createNote(app, "PARA/Projects/Example/Uncited Subnote.md", ["type: subnote", "updated: 2026-01-01 09:00"]);
  await createNote(
    app,
    "LLM-Wiki/Old Concept.md",
    ["type: llm-wiki", "updated: 2026-01-15 09:00"],
    [
      "[[PARA/Resources/Cited Stale.md]]"
    ].join("\n")
  );
  await createNote(
    app,
    "LLM-Wiki/Fresh Concept.md",
    ["type: llm-wiki", "updated: 2026-03-02 09:00"],
    [
      "[[PARA/Resources/Cited Fresh.md]]"
    ].join("\n")
  );
  await createNote(
    app,
    "LLM-Wiki/No Updated Concept.md",
    ["type: llm-wiki", "updated:"],
    [
      "[[PARA/Resources/Cited Null Wiki Only.md]]",
      "[[PARA/Resources/Cited Stale.md]]"
    ].join("\n")
  );
  // A cited source with NO updated timestamp is never stale, regardless of how new the
  // citing page is — guards the `sourceUpdatedMs === null` early return in stalePagesForSource.
  await createNote(
    app,
    "PARA/Resources/Null Updated Source.md",
    ["type: resource", "updated:"],
    "This body must not be read."
  );
  await createNote(
    app,
    "LLM-Wiki/Cites Null Source.md",
    ["type: llm-wiki", "updated: 2026-05-01 09:00"],
    [
      "[[PARA/Resources/Null Updated Source.md]]"
    ].join("\n")
  );
}

describe("wiki ingest candidates", () => {
  it("classifies uncited, delta, per-import, and re-ingest from page updated timestamps without body reads", async () => {
    const { ctx, app } = createTestContext();
    await seedCandidateVault(app);

    const originalRead = ctx.host.read;
    const readPaths: string[] = [];
    ctx.host.read = async (file) => {
      readPaths.push(file.path);
      return originalRead(file);
    };

    const uncited = await wikiIngestCandidates(ctx, { mode: "uncited", limit: "all" });
    expect(uncited.candidates.map((candidate) => [candidate.path, candidate.reason])).toEqual([
      ["PARA/Projects/Example/Uncited Subnote.md", "missing_wiki_citation"],
      ["PARA/Resources/Uncited.md", "missing_wiki_citation"],
      ["ZK/Digests/Uncited Digest.md", "missing_wiki_citation"],
      ["ZK/Permanent/Uncited Permanent.md", "missing_wiki_citation"]
    ]);

    const uncitedResources = await wikiIngestCandidates(ctx, { mode: "uncited", type: "resource", limit: "all" });
    expect(uncitedResources.candidates.map((candidate) => [candidate.path, candidate.type, candidate.reason])).toEqual([
      ["PARA/Resources/Uncited.md", "resource", "missing_wiki_citation"]
    ]);

    const delta = await wikiIngestCandidates(ctx, { mode: "delta", limit: "all" });
    expect(delta.candidates.map((candidate) => [candidate.path, candidate.reason])).toEqual([
      ["PARA/Projects/Example/Uncited Subnote.md", "missing_wiki_citation"],
      ["PARA/Resources/Cited Stale.md", "source_newer_than_wiki"],
      ["PARA/Resources/Uncited.md", "missing_wiki_citation"],
      ["ZK/Digests/Uncited Digest.md", "missing_wiki_citation"],
      ["ZK/Permanent/Uncited Permanent.md", "missing_wiki_citation"]
    ]);
    expect(delta).not.toHaveProperty("ledger_warnings");
    const stale = delta.candidates.find((candidate) => candidate.path === "PARA/Resources/Cited Stale.md");
    expect(stale).not.toHaveProperty("last_source_updated_ms");
    expect(stale).not.toHaveProperty("last_completed_at");
    expect(stale?.stale_llm_wikis).toEqual([
      {
        path: "LLM-Wiki/Old Concept.md",
        title: "Old Concept",
        updated_ms: frontmatterTimeMs("2026-01-15 09:00")
      }
    ]);
    // Cited, but its own `updated` is null → never stale even though a 2026-05 page cites it.
    expect(delta.candidates.find((candidate) => candidate.path === "PARA/Resources/Null Updated Source.md"))
      .toBeUndefined();

    const deltaResources = await wikiIngestCandidates(ctx, { mode: "delta", type: "resource", limit: "all" });
    expect(deltaResources.candidates.map((candidate) => [candidate.path, candidate.type, candidate.reason])).toEqual([
      ["PARA/Resources/Cited Stale.md", "resource", "source_newer_than_wiki"],
      ["PARA/Resources/Uncited.md", "resource", "missing_wiki_citation"]
    ]);

    const perImport = await wikiIngestCandidates(ctx, {
      mode: "per-import",
      source_paths: ["PARA/Resources/Cited Fresh.md", "PARA/Resources/Uncited.md"],
      limit: "all"
    });
    expect(perImport.candidates.map((candidate) => [candidate.path, candidate.reason])).toEqual([
      ["PARA/Resources/Cited Fresh.md", "per_import"],
      ["PARA/Resources/Uncited.md", "per_import"]
    ]);

    const reIngest = await wikiIngestCandidates(ctx, {
      mode: "re-ingest",
      source_path: "PARA/Resources/Cited Stale.md",
      limit: "all"
    });
    expect(reIngest.candidates.map((candidate) => [candidate.path, candidate.reason])).toEqual([
      ["PARA/Resources/Cited Stale.md", "reingest_requested"]
    ]);

    expect(new Set(readPaths)).toEqual(new Set());
  });

  it("surfaces the stable CLI envelope and rejects targeted paths in uncited and delta modes", async () => {
    await createNote(cli.app, "PARA/Resources/Source.md", ["type: resource", "updated: 2026-01-01 09:00"]);
    await createNote(cli.app, "ZK/Digests/Source Digest.md", ["type: digest", "updated: 2026-01-01 09:00"]);

    const result = await cli.run("para-zk:wiki-ingest-candidates", { mode: "uncited", type: "resource", limit: "all" });

    expect(result).toMatchObject({
      ok: true,
      command: "para-zk:wiki-ingest-candidates",
      count: 1,
      returned: 1,
      has_more: false
    });
    expect(result).not.toHaveProperty("ledger_watermark");
    expect(result).not.toHaveProperty("ledger_warnings");
    expect((result.candidates as Array<Record<string, unknown>>)[0]).toMatchObject({
      path: "PARA/Resources/Source.md",
      type: "resource",
      reason: "missing_wiki_citation",
      stale_llm_wikis: []
    });

    const invalidType = await cli.run("para-zk:wiki-ingest-candidates", { mode: "uncited", type: "project" });
    expect(invalidType.ok).toBe(false);
    expect(String(invalidType.error)).toContain("type must be one of");

    const rejected = await cli.run("para-zk:wiki-ingest-candidates", {
      mode: "delta",
      source_path: "PARA/Resources/Source.md"
    });
    expect(rejected.ok).toBe(false);
    expect(String(rejected.error)).toContain("source_path");

    const uncitedRejected = await cli.run("para-zk:wiki-ingest-candidates", {
      mode: "uncited",
      source_paths: '["PARA/Resources/Source.md"]'
    });
    expect(uncitedRejected.ok).toBe(false);
    expect(String(uncitedRejected.error)).toContain("source_path");

    // `source`/`sources` collide with the path-alias convention and must be rejected
    // in favour of the canonical source_path/source_paths.
    const aliasRejected = await cli.run("para-zk:wiki-ingest-candidates", {
      mode: "per-import",
      source: "PARA/Resources/Source.md"
    });
    expect(aliasRejected.ok).toBe(false);
    expect(String(aliasRejected.error)).toContain("source_path");
  });
});
