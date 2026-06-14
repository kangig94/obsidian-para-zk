import { beforeEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import type { ReferenceRead } from "../../src/workflows";
import { createCliHarness, type CliHarness } from "../harness/cli";
import { expectGeneratedReferenceId } from "../unit/reference-id-test-helpers";

let cli: CliHarness;

beforeEach(() => {
  cli = createCliHarness();
});

function referenceItems(result: Record<string, unknown>): ReferenceRead[] {
  const value = result.value as { items?: Record<string, ReferenceRead> };
  return Object.values(value.items ?? {});
}

function optionNames(result: Record<string, unknown>): string[] {
  return (result.options as Array<{ name: string }>).map((option) => option.name);
}

function frontmatterAt(path: string): Record<string, unknown> {
  const content = cli.app.readPath(path);
  if (!content) throw new Error(`missing test file: ${path}`);
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(`missing frontmatter: ${path}`);
  const parsed = parseYaml(match[1] ?? "");
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

describe("llm-wiki CLI adapters", () => {
  it("creates domain/concept notes with managed props and tail", async () => {
    const first = await cli.run("para-zk:create-llm-wiki", {
      title: "AI/Attention Wiki",
      alias: "Attention",
      body: "Machine-owned synthesis.",
      open: "false"
    });
    const other = await cli.run("para-zk:create-llm-wiki", {
      title: "ML/Foo",
      body: "Other-domain synthesis.",
      open: "false"
    });

    expect(first).toMatchObject({
      ok: true,
      path: "LLM-Wiki/AI/Attention Wiki.md",
      title: "Attention Wiki",
      created: true
    });
    expect(other).toMatchObject({
      ok: true,
      path: "LLM-Wiki/ML/Foo.md",
      title: "Foo",
      created: true
    });
    expect(cli.app.readPath("LLM-Wiki/Foo.md")).toBeUndefined();

    const content = cli.app.readPath("LLM-Wiki/AI/Attention Wiki.md") ?? "";
    const frontmatter = frontmatterAt("LLM-Wiki/AI/Attention Wiki.md");
    expect(Object.keys(frontmatter).sort()).toEqual(["aliases", "created", "created_by", "id", "tags", "type", "updated", "updated_by"]);
    expect(frontmatter).toMatchObject({
      type: "llm-wiki",
      tags: ["llm-wiki/ai"],
      aliases: ["Attention"]
    });
    expect(frontmatter.created === "" || frontmatter.created === null).toBe(true);
    expect(frontmatter.updated === "" || frontmatter.updated === null).toBe(true);
    expect(frontmatter).not.toHaveProperty("url");
    expect(frontmatter).not.toHaveProperty("first_author");
    expect(frontmatter).not.toHaveProperty("license");
    expect(frontmatter).not.toHaveProperty("kind");
    expect(content).toContain("type: llm-wiki");
    expect(content).toContain("tags:\n  - llm-wiki/ai");
    expect(content).toContain("aliases:\n  - Attention");
    expect(content).toContain("Machine-owned synthesis.");
    expect(content).toContain("```para-zk-props\ntype: llm-wiki\n```");
    expect(content).toContain("```para-zk-managed\n```");
    expect(content).not.toContain("url:");
    expect(content).not.toContain("first_author:");
    expect(content).not.toContain("license:");
    expect(content).not.toContain("kind:");
  });

  it("reads, updates, renames, and deletes a slash-path note through native commands", async () => {
    await cli.run("para-zk:create-llm-wiki", {
      title: "AI/Policy",
      body: "Initial.",
      open: "false"
    });

    const read = await cli.run("para-zk:read-llm-wiki", {
      title: "AI/Policy",
      key: "body"
    });
    expect(read).toMatchObject({
      ok: true,
      path: "LLM-Wiki/AI/Policy.md",
      type: "llm-wiki",
      key: "body",
      value: "Initial."
    });

    const set = await cli.run("para-zk:update-llm-wiki", {
      title: "AI/Policy",
      key: "body",
      op: "set",
      value: "Updated."
    });
    expect(set).toMatchObject({
      ok: true,
      path: "LLM-Wiki/AI/Policy.md",
      type: "llm-wiki",
      operation: "set",
      changed: true
    });

    const append = await cli.run("para-zk:update-llm-wiki", {
      title: "AI/Policy",
      key: "body",
      op: "append",
      value: "More synthesis."
    });
    expect(append.ok).toBe(true);
    const appended = await cli.run("para-zk:read-llm-wiki", {
      title: "AI/Policy",
      key: "body"
    });
    expect(String(appended.value)).toContain("Updated.");
    expect(String(appended.value)).toContain("More synthesis.");
    await cli.run("para-zk:create-resource", {
      title: "Wiki Consumer",
      body: "See [[LLM-Wiki/AI/Policy.md]].",
      open: "false"
    });

    const renamed = await cli.run("para-zk:rename-llm-wiki", {
      title: "AI/Policy",
      new_title: "Policy Wiki"
    });
    expect(renamed).toMatchObject({
      ok: true,
      fromPath: "LLM-Wiki/AI/Policy.md",
      toPath: "LLM-Wiki/AI/Policy Wiki.md",
      title: "Policy Wiki",
      changed: true
    });
    expect(cli.app.readPath("LLM-Wiki/AI/Policy.md")).toBeUndefined();
    const renamedContent = cli.app.readPath("LLM-Wiki/AI/Policy Wiki.md") ?? "";
    const renamedFrontmatter = frontmatterAt("LLM-Wiki/AI/Policy Wiki.md");
    expect(renamedFrontmatter.tags).toEqual(["llm-wiki/ai"]);
    expect(renamedContent).not.toMatch(/llm-wiki\/policy(?:\s|$)/);
    expect(renamedContent).toContain("llm-wiki/ai");
    const consumerContent = cli.app.readPath("PARA/Resources/Wiki Consumer.md") ?? "";
    expect(consumerContent).toContain("[[LLM-Wiki/AI/Policy Wiki.md]]");
    expect(consumerContent).not.toContain("[[LLM-Wiki/AI/Policy.md]]");

    const deleted = await cli.run("para-zk:delete-llm-wiki", {
      title: "AI/Policy Wiki"
    });
    expect(deleted).toMatchObject({
      ok: true,
      path: "LLM-Wiki/AI/Policy Wiki.md",
      type: "llm-wiki",
      deleted: true,
      trashed: true
    });
    expect(cli.app.readPath("LLM-Wiki/AI/Policy Wiki.md")).toBeUndefined();
  });

  it("updates aliases and references, then reads references and backlinks collections", async () => {
    await cli.run("para-zk:create-resource", { title: "Canonical Source", open: "false" });
    await cli.run("para-zk:create-llm-wiki", {
      title: "AI/Source Wiki",
      body: "[[PARA/Resources/Canonical Source.md]]",
      open: "false"
    });
    await cli.run("para-zk:create-resource", {
      title: "Wiki Index",
      body: "[[LLM-Wiki/AI/Source Wiki.md]]",
      open: "false"
    });

    const alias = await cli.run("para-zk:update-llm-wiki", {
      title: "Source Wiki",
      key: "frontmatter/aliases",
      op: "set",
      value_json: JSON.stringify([" Source Wiki Alias ", ""])
    });
    expect(alias).toMatchObject({ ok: true, changed: true });

    const inserted = await cli.run("para-zk:update-llm-wiki", {
      title: "Source Wiki",
      key: "references",
      op: "insert",
      value_json: JSON.stringify({
        link: "[[PARA/Resources/Canonical Source.md]]",
        description: "Canonical source"
      })
    });
    expect(inserted).toMatchObject({
      ok: true,
      changed: true,
      index: 0,
      link: "[[PARA/Resources/Canonical Source.md]]",
      added: true
    });

    const aliases = await cli.run("para-zk:read-llm-wiki", {
      title: "Source Wiki",
      key: "frontmatter/aliases"
    });
    expect(aliases.value).toEqual(["Source Wiki Alias"]);

    const references = await cli.run("para-zk:read-llm-wiki", {
      title: "Source Wiki",
      key: "references",
      limit: "all"
    });
    const refs = referenceItems(references);
    expect(refs).toHaveLength(1);
    expectGeneratedReferenceId(refs[0]?.id);
    expect(refs[0]).toMatchObject({
      link: "[[PARA/Resources/Canonical Source.md]]",
      path: "PARA/Resources/Canonical Source.md",
      description: "Canonical source"
    });

    const backlinks = await cli.run("para-zk:read-llm-wiki", {
      title: "Source Wiki",
      key: "backlinks",
      limit: "all"
    });
    expect(backlinks.value).toMatchObject({
      count: 1,
      returned: 1,
      items: {
        "0": {
          path: "PARA/Resources/Wiki Index.md",
          title: "Wiki Index",
          type: "resource"
        }
      }
    });
  });

  it("rejects legacy aliases at the CLI boundary", async () => {
    const aliasList = await cli.run("para-zk:create-llm-wiki", {
      title: "Alias Wiki",
      alias_list: "Alias"
    });
    expect(aliasList.ok).toBe(false);
    expect(String(aliasList.error)).toContain("Use alias instead of alias_list");

    const renameSetup = await cli.run("para-zk:create-llm-wiki", { title: "AI/Rename Wiki", open: "false" });
    expect(renameSetup.ok).toBe(true);
    const newTitle = await cli.run("para-zk:rename-llm-wiki", {
      title: "Rename Wiki",
      newTitle: "Renamed Wiki"
    });
    expect(newTitle.ok).toBe(false);
    expect(String(newTitle.error)).toContain("Use new_title instead of newTitle");
  });

  it("accepts only by for llm-wiki authorship and keeps created_by/updated_by read-only", async () => {
    const created = await cli.run("para-zk:create-llm-wiki", {
      title: "AI/Authored Wiki",
      body: "Initial synthesis.",
      by: "claude-opus-4-8",
      open: "false"
    });
    expect(created).toMatchObject({ ok: true, created: true });
    expect(frontmatterAt("LLM-Wiki/AI/Authored Wiki.md")).toMatchObject({
      created_by: "claude-opus-4-8",
      updated_by: "claude-opus-4-8"
    });

    const updated = await cli.run("para-zk:update-llm-wiki", {
      title: "Authored Wiki",
      key: "body",
      op: "set",
      value: "Changed synthesis.",
      by: "gpt-5.5"
    });
    expect(updated).toMatchObject({ ok: true, changed: true });
    expect(frontmatterAt("LLM-Wiki/AI/Authored Wiki.md")).toMatchObject({
      created_by: "claude-opus-4-8",
      updated_by: "gpt-5.5"
    });

    // A no-op write (set to the identical value) must NOT bump updated_by, even with `by`
    // present — otherwise it would falsely clear source_newer_than_wiki staleness.
    const noOp = await cli.run("para-zk:update-llm-wiki", {
      title: "Authored Wiki",
      key: "body",
      op: "set",
      value: "Changed synthesis.",
      by: "should-not-apply"
    });
    expect(noOp).toMatchObject({ ok: true, changed: false });
    expect(frontmatterAt("LLM-Wiki/AI/Authored Wiki.md")).toMatchObject({
      created_by: "claude-opus-4-8",
      updated_by: "gpt-5.5"
    });

    const noBy = await cli.run("para-zk:update-llm-wiki", {
      title: "Authored Wiki",
      key: "body",
      op: "append",
      value: "More synthesis."
    });
    expect(noBy).toMatchObject({ ok: true, changed: true });
    expect(frontmatterAt("LLM-Wiki/AI/Authored Wiki.md")).toMatchObject({
      created_by: "claude-opus-4-8",
      updated_by: "gpt-5.5"
    });

    const frontmatterRead = await cli.run("para-zk:read-llm-wiki", {
      title: "Authored Wiki",
      key: "frontmatter"
    });
    expect(frontmatterRead.value).toMatchObject({
      created_by: "claude-opus-4-8",
      updated_by: "gpt-5.5"
    });
    const updatedByRead = await cli.run("para-zk:read-llm-wiki", {
      title: "Authored Wiki",
      key: "frontmatter/updated_by"
    });
    expect(updatedByRead.value).toBe("gpt-5.5");

    const directCreatedBy = await cli.run("para-zk:update-llm-wiki", {
      title: "Authored Wiki",
      key: "created_by",
      op: "set",
      value: "spoof"
    });
    expect(directCreatedBy.ok).toBe(false);
    expect(String(directCreatedBy.error)).toContain("unknown update key");

    const frontmatterUpdatedBy = await cli.run("para-zk:update-llm-wiki", {
      title: "Authored Wiki",
      key: "frontmatter/updated_by",
      op: "set",
      value: "spoof"
    });
    expect(frontmatterUpdatedBy.ok).toBe(false);
    expect(String(frontmatterUpdatedBy.error)).toContain("unknown update key");

    const byAlias = await cli.run("para-zk:create-llm-wiki", {
      title: "Alias By Wiki",
      modelId: "gpt-5.5"
    });
    expect(byAlias.ok).toBe(false);
    expect(String(byAlias.error)).toContain("Use by instead of modelId");

    const updateAlias = await cli.run("para-zk:update-llm-wiki", {
      title: "Authored Wiki",
      key: "body",
      op: "set",
      value: "x",
      updated_by: "gpt-5.5"
    });
    expect(updateAlias.ok).toBe(false);
    expect(String(updateAlias.error)).toContain("Use by instead of updated_by");

    const otherSurface = await cli.run("para-zk:update-resource", {
      title: "Missing",
      key: "body",
      op: "set",
      value: "x",
      by: "gpt-5.5"
    });
    expect(otherSurface.ok).toBe(false);
    expect(String(otherSurface.error)).toContain("by is not accepted by para-zk:update-resource");
  });

  it("does not expose archived in help and explicitly rejects archived selectors", async () => {
    await cli.run("para-zk:create-llm-wiki", {
      title: "AI/No Archive",
      body: "Active only.",
      open: "false"
    });

    for (const command of [
      "para-zk:create-llm-wiki",
      "para-zk:read-llm-wiki",
      "para-zk:update-llm-wiki",
      "para-zk:rename-llm-wiki",
      "para-zk:delete-llm-wiki"
    ]) {
      const help = await cli.run(command, { help: "true" });
      expect(help.ok).toBe(true);
      expect(optionNames(help)).not.toContain("archived");
    }

    const read = await cli.run("para-zk:read-llm-wiki", {
      title: "No Archive",
      archived: "true",
      key: "body"
    });
    expect(read.ok).toBe(false);
    expect(String(read.error)).toContain("archived is not accepted");

    const update = await cli.run("para-zk:update-llm-wiki", {
      title: "No Archive",
      archived: "true",
      key: "body",
      op: "set",
      value: "x"
    });
    expect(update.ok).toBe(false);
    expect(String(update.error)).toContain("archived is not accepted");

    const rename = await cli.run("para-zk:rename-llm-wiki", {
      title: "No Archive",
      archived: "true",
      new_title: "Still No Archive"
    });
    expect(rename.ok).toBe(false);
    expect(String(rename.error)).toContain("archived is not accepted");

    const deleted = await cli.run("para-zk:delete-llm-wiki", {
      title: "No Archive",
      archived: "true"
    });
    expect(deleted.ok).toBe(false);
    expect(String(deleted.error)).toContain("archived is not accepted");
  });

  it("advertises domain/concept title creation and list type discovery", async () => {
    const createHelp = await cli.run("para-zk:create-llm-wiki", { help: "true" });
    expect(optionNames(createHelp)).toContain("by");
    const createTitle = (createHelp.options as Array<{ name: string; description: string }>)
      .find((option) => option.name === "title");
    expect(createTitle?.description).toContain("<domain>/<concept>");
    expect(createTitle?.description).toContain("AI/Diffusion Policy");

    const updateHelp = await cli.run("para-zk:update-llm-wiki", { help: "true" });
    expect(optionNames(updateHelp)).toContain("by");
    const projectUpdateHelp = await cli.run("para-zk:update-project", { help: "true" });
    expect(optionNames(projectUpdateHelp)).not.toContain("by");

    const listHelp = await cli.run("para-zk:list", { help: "true" });
    const listType = (listHelp.options as Array<{ name: string; value: string }>)
      .find((option) => option.name === "type");
    expect(listType?.value).toContain("llm-wiki");
  });
});
