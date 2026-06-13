import { describe, expect, it } from "vitest";
import { readFileFrontmatterFresh } from "../../src/vault/frontmatter";
import {
  createLlmWiki,
  createResource,
  deleteLlmWiki,
  listNotes,
  readLlmWiki,
  renameLlmWiki,
  updateLlmWiki,
  updateResource
} from "../../src/workflows";
import { expectGeneratedReferenceId } from "../unit/reference-id-test-helpers";
import { createTestContext } from "../harness/vault";

describe("llm-wiki workflows", () => {
  it("creates and reads flat and slash-path wiki notes without provenance or managed UI", async () => {
    const { ctx, app } = createTestContext();

    const flat = await createLlmWiki(ctx, {
      title: "Attention Wiki",
      alias: "Attention",
      body: "Machine-owned synthesis.",
      open: false
    });
    const nested = await createLlmWiki(ctx, {
      title: "AI/Foo",
      body: "Nested synthesis.",
      open: false
    });

    expect(flat).toMatchObject({ path: "LLM-Wiki/Attention Wiki.md", title: "Attention Wiki", created: true });
    expect(nested).toMatchObject({ path: "LLM-Wiki/AI/Foo.md", title: "Foo", created: true });
    expect(app.readPath("LLM-Wiki/Foo.md")).toBeUndefined();

    const file = app.vault.getFileByPath(flat.path);
    if (!file) throw new Error(`missing created wiki note: ${flat.path}`);
    const frontmatter = await readFileFrontmatterFresh(ctx, file);
    expect(Object.keys(frontmatter).sort()).toEqual(["aliases", "created", "id", "tags", "type", "updated"]);
    expect(frontmatter).toMatchObject({
      type: "llm-wiki",
      tags: ["llm-wiki/attention-wiki"],
      aliases: ["Attention"]
    });
    expect(frontmatter.updated === "" || frontmatter.updated === null).toBe(true);
    expect(frontmatter.created).toEqual(expect.any(String));
    expect(frontmatter.id).toEqual(expect.any(String));

    const content = app.readPath(flat.path) ?? "";
    expect(content).toContain("Machine-owned synthesis.");
    expect(content).not.toContain("para-zk-props");
    expect(content).not.toContain("para-zk-managed");
    expect(content).not.toContain("url:");
    expect(content).not.toContain("first_author:");
    expect(content).not.toContain("license:");
    expect(content).not.toContain("kind:");

    const body = await readLlmWiki(ctx, { title: "AI/Foo", key: "body" });
    expect(body).toMatchObject({ path: "LLM-Wiki/AI/Foo.md", type: "llm-wiki", key: "body" });
    expect(body.value).toBe("Nested synthesis.");
  });

  it("returns the existing note on a duplicate title without suffixing or clobbering (get-or-create)", async () => {
    const { ctx, app } = createTestContext();
    const first = await createLlmWiki(ctx, { title: "AI/Dup", body: "Original synthesis.", open: false });
    expect(first.created).toBe(true);

    const second = await createLlmWiki(ctx, { title: "AI/Dup", body: "Replacement that must NOT apply.", open: false });
    expect(second).toMatchObject({ path: "LLM-Wiki/AI/Dup.md", created: false });
    expect(app.readPath("LLM-Wiki/AI/Dup 1.md")).toBeUndefined();
    const content = app.readPath("LLM-Wiki/AI/Dup.md") ?? "";
    expect(content).toContain("Original synthesis.");
    expect(content).not.toContain("Replacement");
  });

  it("updates body, aliases, and references through the shared surface machinery", async () => {
    const { ctx, app } = createTestContext();
    await createResource(ctx, { title: "Canonical Source", open: false });
    await createLlmWiki(ctx, { title: "AI/Policy", body: "Initial.", open: false });

    const bodySet = await updateLlmWiki(ctx, {
      title: "AI/Policy",
      key: "body",
      operation: "set",
      value: "Synthesis cites `PZ[pending]`."
    });
    expect(bodySet).toMatchObject({ path: "LLM-Wiki/AI/Policy.md", type: "llm-wiki", changed: true });

    const alias = await updateLlmWiki(ctx, {
      title: "AI/Policy",
      key: "frontmatter/aliases",
      operation: "set",
      value: [" Policy Wiki ", ""],
      valueSource: "value_json"
    });
    expect(alias.changed).toBe(true);

    const inserted = await updateLlmWiki(ctx, {
      title: "AI/Policy",
      key: "references",
      operation: "insert",
      value: {
        link: "[[PARA/Resources/Canonical Source.md]]",
        description: "Canonical source"
      },
      valueSource: "value_json"
    });
    expect(inserted).toMatchObject({
      changed: true,
      index: 0,
      link: "[[PARA/Resources/Canonical Source.md]]",
      added: true
    });

    const references = await readLlmWiki(ctx, { title: "AI/Policy", key: "references", collection: { limit: "all" } });
    const items = Object.values((references.value as { items?: Record<string, { id: string | null; path?: string }> }).items ?? {});
    expect(items).toHaveLength(1);
    expectGeneratedReferenceId(items[0]?.id);
    expect(items[0]?.path).toBe("PARA/Resources/Canonical Source.md");

    const aliases = await readLlmWiki(ctx, { title: "AI/Policy", key: "frontmatter/aliases" });
    expect(aliases.value).toEqual(["Policy Wiki"]);
    expect(app.readPath("LLM-Wiki/AI/Policy.md")).toContain("Synthesis cites `PZ[pending]`.");
  });

  it("backfills id-less references for a wiki note through the shared surface", async () => {
    const { ctx, app } = createTestContext();
    await createLlmWiki(ctx, { title: "Backfill", open: false });
    const file = app.vault.getFileByPath("LLM-Wiki/Backfill.md");
    if (!file) throw new Error("missing wiki note");
    await app.vault.modify(file, [
      "---",
      "type: llm-wiki",
      "tags:",
      "  - llm-wiki/backfill",
      "references:",
      "  - https://example.com/bare",
      "  - link: https://example.com/object",
      "    description: Legacy",
      "---",
      "Body.",
      ""
    ].join("\n"));

    const backfilled = await updateLlmWiki(ctx, { title: "Backfill", key: "references", operation: "backfill" });
    expect(backfilled.changed).toBe(true);

    const read = await readLlmWiki(ctx, { title: "Backfill", key: "references", collection: { limit: "all" } });
    const items = Object.values((read.value as { items?: Record<string, { id: string | null }> }).items ?? {});
    expect(items).toHaveLength(2);
    items.forEach((reference) => expectGeneratedReferenceId(reference.id));
  });

  it("renames in place, rewrites the title-derived tag, and rewrites inbound wikilinks", async () => {
    const { ctx, app } = createTestContext();
    await createLlmWiki(ctx, { title: "AI/Old Name", open: false });
    await createResource(ctx, { title: "Consumer", body: "See [[LLM-Wiki/AI/Old Name.md]].", open: false });

    const renamed = await renameLlmWiki(ctx, {
      title: "AI/Old Name",
      newTitle: "New Name"
    });

    expect(renamed).toMatchObject({
      changed: true,
      fromPath: "LLM-Wiki/AI/Old Name.md",
      toPath: "LLM-Wiki/AI/New Name.md",
      title: "New Name"
    });
    expect(app.readPath("LLM-Wiki/AI/Old Name.md")).toBeUndefined();
    expect(app.readPath("LLM-Wiki/AI/New Name.md")).toBeDefined();

    const file = app.vault.getFileByPath("LLM-Wiki/AI/New Name.md");
    if (!file) throw new Error("missing renamed wiki note");
    const frontmatter = await readFileFrontmatterFresh(ctx, file);
    expect(frontmatter.tags).toEqual(["llm-wiki/new-name"]);

    const consumer = app.readPath("PARA/Resources/Consumer.md") ?? "";
    expect(consumer).toContain("[[LLM-Wiki/AI/New Name.md]]");
    expect(consumer).not.toContain("Old Name");

    await expect(renameLlmWiki(ctx, { title: "AI/New Name", newTitle: "Other/Folder" }))
      .rejects.toThrow(/bare basename/);
  });

  it("deletes through core trash and cleans PARA-ZK-owned references", async () => {
    const { ctx, app } = createTestContext();
    await createResource(ctx, { title: "Source", open: false });
    const wiki = await createLlmWiki(ctx, { title: "Derived", open: false });
    await updateResource(ctx, {
      title: "Source",
      key: "references",
      operation: "insert",
      value: { link: `[[${wiki.path}]]` },
      valueSource: "value_json"
    });

    const deleted = await deleteLlmWiki(ctx, { title: "Derived" });

    expect(deleted).toMatchObject({
      path: "LLM-Wiki/Derived.md",
      type: "llm-wiki",
      deleted: true,
      trashed: true,
      cleaned: { references: 1 }
    });
    expect(app.readPath("LLM-Wiki/Derived.md")).toBeUndefined();
    expect(app.trashed.some((item) => item.path === "LLM-Wiki/Derived.md")).toBe(true);
    expect(app.readPath("PARA/Resources/Source.md")).not.toContain("LLM-Wiki/Derived.md");
  });

  it("lists active llm-wiki notes and has no archived-counterpart lookup", async () => {
    const { ctx, app } = createTestContext();
    await createLlmWiki(ctx, { title: "AI/Foo", open: false });
    await app.vault.create("PARA/Archives/LLM-Wiki/Archived.md", "---\ntype: llm-wiki\n---\nArchived only\n");

    const filtered = await listNotes(ctx, { type: "llm-wiki" });
    expect(filtered).toMatchObject({ count: 1, returned: 1 });
    expect(filtered.items).toEqual([
      { title: "Foo", type: "llm-wiki", path: "LLM-Wiki/AI/Foo.md" }
    ]);

    const all = await listNotes(ctx);
    expect(all.count).toBe(1);
    await expect(readLlmWiki(ctx, { title: "Archived", key: "body" })).rejects.toThrow("llm-wiki note not found");
  });

  it.each(["../x", "/x", "x/", "a//b", ".."])("rejects unsafe title paths: %s", async (title) => {
    const { ctx, app } = createTestContext();

    await expect(createLlmWiki(ctx, { title, open: false })).rejects.toThrow("llm-wiki title");
    await expect(readLlmWiki(ctx, { title, key: "body" })).rejects.toThrow("llm-wiki title");
    expect(app.listPaths()).toEqual([]);
  });
});
