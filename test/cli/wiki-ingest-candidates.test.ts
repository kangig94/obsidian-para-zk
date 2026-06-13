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

function ledgerRow(sourcePath: string, sourceUpdated: string, at: string): string {
  return `- ${JSON.stringify({
    event: "cited",
    wiki_page: "LLM-Wiki/Index.md",
    source_path: sourcePath,
    source_updated: sourceUpdated,
    source_updated_ms: frontmatterTimeMs(sourceUpdated) ?? null,
    at
  })}`;
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
    "PARA/Resources/Cited Missing.md",
    ["type: resource", "updated: 2026-01-02 09:00"],
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
  await createNote(
    app,
    "LLM-Wiki/Index.md",
    ["type: llm-wiki"],
    [
      "[[PARA/Resources/Cited Missing.md]]",
      "[[PARA/Resources/Cited Stale.md]]",
      "[[PARA/Resources/Cited Fresh.md]]"
    ].join("\n")
  );
  await app.vault.create(
    "LLM-Wiki/log.md",
    [
      ledgerRow("PARA/Resources/Cited Stale.md", "2026-01-01 09:00", "2026-04-01T00:00:00.000Z"),
      ledgerRow("PARA/Resources/Cited Fresh.md", "2026-03-01 09:00", "2026-05-01T00:00:00.000Z"),
      "- {malformed"
    ].join("\n")
  );
}

describe("wiki ingest candidates", () => {
  it("classifies init, delta, per-import, and re-ingest without reading canonical or wiki bodies", async () => {
    const { ctx, app } = createTestContext();
    await seedCandidateVault(app);

    const originalRead = ctx.host.read;
    const readPaths: string[] = [];
    ctx.host.read = async (file) => {
      readPaths.push(file.path);
      return originalRead(file);
    };

    const init = await wikiIngestCandidates(ctx, { mode: "init", limit: "all" });
    expect(init.candidates.map((candidate) => [candidate.path, candidate.reason])).toEqual([
      ["PARA/Resources/Uncited.md", "missing_wiki_citation"]
    ]);

    const delta = await wikiIngestCandidates(ctx, { mode: "delta", limit: "all" });
    expect(delta.candidates.map((candidate) => [candidate.path, candidate.reason])).toEqual([
      ["PARA/Resources/Cited Missing.md", "missing_ingest_record"],
      ["PARA/Resources/Cited Stale.md", "stale_since_ingest"],
      ["PARA/Resources/Uncited.md", "missing_wiki_citation"]
    ]);
    // Per-source watermark discriminator: "Cited Stale" is stale against its OWN row
    // (source_updated 2026-01-01) even though "Cited Fresh" completed LATER (at 2026-05-01).
    // A global max-`at` watermark would wrongly exclude it (2026-02 < 2026-05) — so its
    // presence above proves stale detection is per-source, not global.
    const stale = delta.candidates.find((candidate) => candidate.path === "PARA/Resources/Cited Stale.md");
    expect(stale?.updated_ms).toBeGreaterThan(stale?.last_source_updated_ms ?? 0);
    expect(stale?.last_completed_at).toBe("2026-04-01T00:00:00.000Z");

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

    expect(delta.ledger_warnings.length).toBeGreaterThan(0);
    expect(new Set(readPaths)).toEqual(new Set(["LLM-Wiki/log.md"]));
  });

  it("surfaces the stable CLI envelope and rejects targeted paths in init and delta modes", async () => {
    await createNote(cli.app, "PARA/Resources/Source.md", ["type: resource", "updated: 2026-01-01 09:00"]);

    const result = await cli.run("para-zk:wiki-ingest-candidates", { mode: "init", limit: "all" });

    expect(result).toMatchObject({
      ok: true,
      command: "para-zk:wiki-ingest-candidates",
      count: 1,
      returned: 1,
      has_more: false
    });
    expect(result).not.toHaveProperty("ledger_watermark");
    expect((result.candidates as Array<Record<string, unknown>>)[0]).toMatchObject({
      path: "PARA/Resources/Source.md",
      reason: "missing_wiki_citation"
    });

    const rejected = await cli.run("para-zk:wiki-ingest-candidates", {
      mode: "delta",
      source_path: "PARA/Resources/Source.md"
    });
    expect(rejected.ok).toBe(false);
    expect(String(rejected.error)).toContain("source_path");

    const initRejected = await cli.run("para-zk:wiki-ingest-candidates", {
      mode: "init",
      source_paths: '["PARA/Resources/Source.md"]'
    });
    expect(initRejected.ok).toBe(false);
    expect(String(initRejected.error)).toContain("source_path");

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
