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
  it("creates and reads domain/concept wiki notes with managed props and tail", async () => {
    const { ctx, app } = createTestContext();

    const first = await createLlmWiki(ctx, {
      title: "AI/Attention Wiki",
      alias: "Attention",
      body: "Machine-owned synthesis.",
      open: false
    });
    const other = await createLlmWiki(ctx, {
      title: "ML/Foo",
      body: "Other-domain synthesis.",
      open: false
    });

    expect(first).toMatchObject({ path: "LLM-Wiki/AI/Attention Wiki.md", title: "Attention Wiki", created: true });
    expect(other).toMatchObject({ path: "LLM-Wiki/ML/Foo.md", title: "Foo", created: true });
    expect(app.readPath("LLM-Wiki/Foo.md")).toBeUndefined();

    const file = app.vault.getFileByPath(first.path);
    if (!file) throw new Error(`missing created wiki note: ${first.path}`);
    const frontmatter = await readFileFrontmatterFresh(ctx, file);
    expect(Object.keys(frontmatter).sort()).toEqual(["aliases", "created", "created_by", "id", "tags", "type", "updated", "updated_by"]);
    expect(frontmatter).toMatchObject({
      type: "llm-wiki",
      tags: ["llm-wiki/ai"],
      aliases: ["Attention"]
    });
    expect(frontmatter.updated === "" || frontmatter.updated === null).toBe(true);
    expect(frontmatter.created === "" || frontmatter.created === null).toBe(true);
    expect(frontmatter.id).toEqual(expect.any(String));

    const content = app.readPath(first.path) ?? "";
    expect(content).toContain("Machine-owned synthesis.");
    expect(content).toContain("```para-zk-props\ntype: llm-wiki\n```");
    expect(content).toContain("```para-zk-managed\n```");
    expect(content).not.toContain("url:");
    expect(content).not.toContain("first_author:");
    expect(content).not.toContain("license:");
    expect(content).not.toContain("kind:");

    const body = await readLlmWiki(ctx, { title: "ML/Foo", key: "body" });
    expect(body).toMatchObject({ path: "LLM-Wiki/ML/Foo.md", type: "llm-wiki", key: "body" });
    expect(body.value).toBe("Other-domain synthesis.");
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
    await createLlmWiki(ctx, { title: "AI/Backfill", open: false });
    const file = app.vault.getFileByPath("LLM-Wiki/AI/Backfill.md");
    if (!file) throw new Error("missing wiki note");
    await app.vault.modify(file, [
      "---",
      "type: llm-wiki",
      "tags:",
      "  - llm-wiki/ai",
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

  it("renames in place, keeps the domain-only tag, and rewrites inbound wikilinks", async () => {
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
    expect(frontmatter.tags).toEqual(["llm-wiki/ai"]);

    const consumer = app.readPath("PARA/Resources/Consumer.md") ?? "";
    expect(consumer).toContain("[[LLM-Wiki/AI/New Name.md]]");
    expect(consumer).not.toContain("Old Name");

    await expect(renameLlmWiki(ctx, { title: "AI/New Name", newTitle: "Other/Folder" }))
      .rejects.toThrow(/bare basename/);
    // The rejected cross-domain rename must not leave a partial write in a new domain folder.
    expect(app.listPaths().some((path) => path.startsWith("LLM-Wiki/Other/"))).toBe(false);
  });

  it("deletes through core trash and cleans PARA-ZK-owned references", async () => {
    const { ctx, app } = createTestContext();
    await createResource(ctx, { title: "Source", open: false });
    const wiki = await createLlmWiki(ctx, { title: "AI/Derived", open: false });
    await updateResource(ctx, {
      title: "Source",
      key: "references",
      operation: "insert",
      value: { link: `[[${wiki.path}]]` },
      valueSource: "value_json"
    });

    const deleted = await deleteLlmWiki(ctx, { title: "Derived" });

    expect(deleted).toMatchObject({
      path: "LLM-Wiki/AI/Derived.md",
      type: "llm-wiki",
      deleted: true,
      trashed: true,
      cleaned: { references: 1 }
    });
    expect(app.readPath("LLM-Wiki/AI/Derived.md")).toBeUndefined();
    expect(app.trashed.some((item) => item.path === "LLM-Wiki/AI/Derived.md")).toBe(true);
    expect(app.readPath("PARA/Resources/Source.md")).not.toContain("LLM-Wiki/Derived.md");
  });

  it("lists active llm-wiki notes and has no archived-counterpart lookup", async () => {
    const { ctx, app } = createTestContext();
    await createLlmWiki(ctx, { title: "AI/Foo", open: false });
    await app.vault.create("PARA/Archives/LLM-Wiki/Archived.md", "---\ntype: llm-wiki\n---\nArchived only\n");

    const filtered = await listNotes(ctx, { type: "llm-wiki" });
    // AI/Foo also auto-mints the AI/index hub.
    expect(filtered).toMatchObject({ count: 2, returned: 2, type: "llm-wiki", root: "LLM-Wiki" });
    expect((filtered.items as string[]).slice().sort()).toEqual(["AI/Foo", "AI/index"]);

    const all = await listNotes(ctx);
    expect(all.count).toBe(2);
    await expect(readLlmWiki(ctx, { title: "Archived", key: "body" })).rejects.toThrow("llm-wiki note not found");
  });

  it.each(["../x", "/x", "x/", "a//b", ".."])("rejects unsafe title paths: %s", async (title) => {
    const { ctx, app } = createTestContext();

    await expect(createLlmWiki(ctx, { title, open: false })).rejects.toThrow("llm-wiki title");
    await expect(readLlmWiki(ctx, { title, key: "body" })).rejects.toThrow("llm-wiki title");
    expect(app.listPaths()).toEqual([]);
  });

  it("requires exactly one domain folder and reuses a concept across domains", async () => {
    const { ctx, app } = createTestContext();

    // 1-depth enforced: a bare concept (no domain) and a deeper path are both rejected.
    await expect(createLlmWiki(ctx, { title: "PPO", open: false }))
      .rejects.toThrow(/<domain>\/<concept>/);
    await expect(createLlmWiki(ctx, { title: "AI/RL/PPO", open: false }))
      .rejects.toThrow(/<domain>\/<concept>/);

    // A concept is a single page across the whole wiki: re-creating it under a different
    // domain returns the existing page and writes no duplicate.
    const first = await createLlmWiki(ctx, { title: "RL/PPO", body: "First.", open: false });
    expect(first).toMatchObject({ path: "LLM-Wiki/RL/PPO.md", created: true });

    const again = await createLlmWiki(ctx, { title: "Humanoid/PPO", body: "Must not apply.", open: false });
    expect(again).toMatchObject({ path: "LLM-Wiki/RL/PPO.md", created: false });
    expect(app.readPath("LLM-Wiki/Humanoid/PPO.md")).toBeUndefined();
    expect(app.readPath("LLM-Wiki/RL/PPO.md")).toContain("First.");

    // The concept identity is case-folded, so a case variant under another domain also reuses it.
    const cased = await createLlmWiki(ctx, { title: "Humanoid/ppo", body: "Case variant.", open: false });
    expect(cased).toMatchObject({ path: "LLM-Wiki/RL/PPO.md", created: false });
    expect(app.readPath("LLM-Wiki/Humanoid/ppo.md")).toBeUndefined();
  });
});
