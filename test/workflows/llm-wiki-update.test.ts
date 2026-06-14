import { describe, expect, it } from "vitest";
import { readFileFrontmatterFresh } from "../../src/vault/frontmatter";
import { createLlmWiki, readLlmWiki, updateLlmWiki, type WorkflowContext } from "../../src/workflows";
import { createTestContext, type MockApp } from "../harness/vault";

function markdown(frontmatter: string[], body = ""): string {
  return ["---", ...frontmatter, "---", body].join("\n");
}

async function createNote(app: MockApp, path: string, frontmatter: string[], body = ""): Promise<void> {
  await app.vault.create(path, markdown(frontmatter, body));
}

async function frontmatter(ctx: WorkflowContext, app: MockApp, path: string): Promise<Record<string, unknown>> {
  const file = app.vault.getFileByPath(path);
  if (!file) throw new Error(`missing test file: ${path}`);
  return readFileFrontmatterFresh(ctx, file);
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

describe("llm-wiki updates", () => {
  it("inserts references without writing a log or returning ingest_logged", async () => {
    const { ctx, app } = createTestContext();
    await createNote(app, "PARA/Resources/Canonical Source.md", ["type: resource", "updated: 2026-02-03 04:05"]);
    await createLlmWiki(ctx, { title: "AI/Source Wiki", open: false });

    const inserted = await updateLlmWiki(ctx, {
      title: "Source Wiki",
      ...referenceInsert("[[PARA/Resources/Canonical Source.md]]")
    });

    expect(inserted).toMatchObject({
      changed: true,
      link: "[[PARA/Resources/Canonical Source.md]]",
      added: true
    });
    expect(inserted).not.toHaveProperty("ingest_logged");
    expect(app.readPath("LLM-Wiki/log.md")).toBeUndefined();
  });

  it("stamps by-created authorship, updates updated_by only after changed writes, and keeps it read-only", async () => {
    const { ctx, app } = createTestContext();
    await createLlmWiki(ctx, {
      title: "AI/Authored Wiki",
      body: "Initial synthesis.",
      by: "claude-opus-4-8",
      open: false
    });

    let fm = await frontmatter(ctx, app, "LLM-Wiki/AI/Authored Wiki.md");
    expect(fm.created_by).toBe("claude-opus-4-8");
    expect(fm.updated_by).toBe("claude-opus-4-8");

    const frontmatterRead = await readLlmWiki(ctx, { title: "Authored Wiki", key: "frontmatter" });
    expect(frontmatterRead.value).toMatchObject({
      created_by: "claude-opus-4-8",
      updated_by: "claude-opus-4-8"
    });
    const createdByRead = await readLlmWiki(ctx, { title: "Authored Wiki", key: "frontmatter/created_by" });
    expect(createdByRead.value).toBe("claude-opus-4-8");

    const changed = await updateLlmWiki(ctx, {
      title: "Authored Wiki",
      key: "body",
      operation: "set",
      value: "Changed synthesis.",
      by: "gpt-5.5"
    });
    expect(changed.changed).toBe(true);
    fm = await frontmatter(ctx, app, "LLM-Wiki/AI/Authored Wiki.md");
    expect(fm.created_by).toBe("claude-opus-4-8");
    expect(fm.updated_by).toBe("gpt-5.5");

    const noOp = await updateLlmWiki(ctx, {
      title: "Authored Wiki",
      key: "body",
      operation: "set",
      value: "Changed synthesis.",
      by: "claude-opus-4-8"
    });
    expect(noOp.changed).toBe(false);
    fm = await frontmatter(ctx, app, "LLM-Wiki/AI/Authored Wiki.md");
    expect(fm.created_by).toBe("claude-opus-4-8");
    expect(fm.updated_by).toBe("gpt-5.5");

    const noBy = await updateLlmWiki(ctx, {
      title: "Authored Wiki",
      key: "body",
      operation: "set",
      value: "Changed again without by."
    });
    expect(noBy.changed).toBe(true);
    fm = await frontmatter(ctx, app, "LLM-Wiki/AI/Authored Wiki.md");
    expect(fm.created_by).toBe("claude-opus-4-8");
    expect(fm.updated_by).toBe("gpt-5.5");

    await expect(updateLlmWiki(ctx, {
      title: "Authored Wiki",
      key: "created_by",
      operation: "set",
      value: "spoof"
    })).rejects.toThrow("unknown update key");
    await expect(updateLlmWiki(ctx, {
      title: "Authored Wiki",
      key: "frontmatter/updated_by",
      operation: "set",
      value: "spoof"
    })).rejects.toThrow("unknown update key");
  });
});
