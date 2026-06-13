import { describe, expect, it } from "vitest";
import { frontmatterTimeMs } from "../../src/time";
import { createLlmWiki, updateLlmWiki } from "../../src/workflows";
import { createTestContext, type MockApp } from "../harness/vault";

function markdown(frontmatter: string[], body = ""): string {
  return ["---", ...frontmatter, "---", body].join("\n");
}

async function createNote(app: MockApp, path: string, frontmatter: string[], body = ""): Promise<void> {
  await app.vault.create(path, markdown(frontmatter, body));
}

function parseLedgerRows(content: string | undefined): Array<Record<string, unknown>> {
  if (!content?.trim()) return [];
  return content.trim().split(/\r?\n/).map((line) => {
    expect(line).toMatch(/^- \{.*\}$/);
    expect(line).not.toContain("[[");
    return JSON.parse(line.slice(2)) as Record<string, unknown>;
  });
}

function referenceInsert(link: string): {
  key: "references";
  operation: "insert";
  value: { link: string };
  valueSource: "value_json";
} {
  return {
    key: "references",
    operation: "insert",
    value: { link },
    valueSource: "value_json"
  };
}

describe("wiki ingest ledger", () => {
  it("logs a successful llm-wiki reference insert to an ingestable source", async () => {
    const { ctx, app } = createTestContext();
    const updated = "2026-02-03 04:05";
    await createNote(app, "PARA/Resources/Canonical Source.md", ["type: resource", `updated: ${updated}`]);
    await createLlmWiki(ctx, { title: "Source Wiki", open: false });

    const inserted = await updateLlmWiki(ctx, {
      title: "Source Wiki",
      ...referenceInsert("[[PARA/Resources/Canonical Source.md]]")
    });

    expect(inserted).toMatchObject({
      changed: true,
      link: "[[PARA/Resources/Canonical Source.md]]",
      added: true,
      ingest_logged: true
    });
    const rows = parseLedgerRows(app.readPath("LLM-Wiki/log.md"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      event: "cited",
      wiki_page: "LLM-Wiki/Source Wiki.md",
      source_path: "PARA/Resources/Canonical Source.md",
      source_updated: updated,
      source_updated_ms: frontmatterTimeMs(updated)
    });
    expect(rows[0]?.at).toEqual(expect.any(String));
  });

  it("serializes concurrent first-time and re-cite ledger appends without corrupting log.md", async () => {
    const { ctx, app } = createTestContext();
    await createNote(app, "PARA/Resources/Concurrent A.md", ["type: resource", "updated: 2026-01-01 09:00"]);
    await createNote(app, "PARA/Resources/Concurrent B.md", ["type: resource", "updated: 2026-01-02 09:00"]);
    await createLlmWiki(ctx, { title: "Same Wiki", open: false });
    await createLlmWiki(ctx, { title: "Other Wiki", open: false });

    const results = await Promise.all([
      updateLlmWiki(ctx, {
        title: "Same Wiki",
        ...referenceInsert("[[PARA/Resources/Concurrent A.md]]")
      }),
      updateLlmWiki(ctx, {
        title: "Same Wiki",
        ...referenceInsert("[[PARA/Resources/Concurrent A.md]]")
      }),
      updateLlmWiki(ctx, {
        title: "Other Wiki",
        ...referenceInsert("[[PARA/Resources/Concurrent B.md]]")
      })
    ]);

    expect(results.every((result) => result.ingest_logged === true)).toBe(true);
    expect(results.map((result) => result.added).sort()).toEqual([false, true, true]);
    const rows = parseLedgerRows(app.readPath("LLM-Wiki/log.md"));
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.source_path).sort()).toEqual([
      "PARA/Resources/Concurrent A.md",
      "PARA/Resources/Concurrent A.md",
      "PARA/Resources/Concurrent B.md"
    ]);
  });

  it("does not log url, text, archived, or template references", async () => {
    const { ctx, app } = createTestContext();
    await createNote(app, "PARA/Archives/Resources/Archived Source.md", ["type: resource", "updated: 2026-01-01 09:00"]);
    await createNote(app, "Templates/para-zk/Template Source.md", ["type: resource", "updated: 2026-01-01 09:00"]);
    await createLlmWiki(ctx, { title: "Filtered Wiki", open: false });

    const url = await updateLlmWiki(ctx, {
      title: "Filtered Wiki",
      ...referenceInsert("https://example.com/source")
    });
    const text = await updateLlmWiki(ctx, {
      title: "Filtered Wiki",
      ...referenceInsert("plain text reference")
    });
    const archived = await updateLlmWiki(ctx, {
      title: "Filtered Wiki",
      ...referenceInsert("[[PARA/Archives/Resources/Archived Source.md]]")
    });
    const template = await updateLlmWiki(ctx, {
      title: "Filtered Wiki",
      ...referenceInsert("[[Templates/para-zk/Template Source.md]]")
    });

    expect(url.ingest_logged).toBe(false);
    expect(text.ingest_logged).toBe(false);
    expect(archived.ingest_logged).toBe(false);
    expect(template.ingest_logged).toBe(false);
    expect(app.readPath("LLM-Wiki/log.md")).toBeUndefined();
  });
});
