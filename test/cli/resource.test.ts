import { beforeEach, describe, expect, it } from "vitest";
import { createCliHarness, type CliHarness } from "../harness/cli";

let cli: CliHarness;

beforeEach(() => {
  cli = createCliHarness();
});

describe("resource provenance frontmatter", () => {
  it("creates a nested resource from a Resources-relative title path using basename metadata", async () => {
    const created = await cli.run("para-zk:create-resource", {
      title: "AI/Foo",
      open: "false"
    });

    expect(created.ok).toBe(true);
    expect(created.created).toBe(true);
    expect(created.path).toBe("PARA/Resources/AI/Foo.md");
    expect(created.title).toBe("Foo");
    expect(cli.app.readPath("PARA/Resources/Foo.md")).toBeUndefined();

    const content = cli.app.readPath("PARA/Resources/AI/Foo.md") ?? "";
    expect(content).toContain("type: resource");
    expect(content).toContain("tags:\n  - resource/foo");
    expect(content).not.toContain("resource/ai/foo");
  });

  it("creates a three-level resource title path using basename metadata", async () => {
    const created = await cli.run("para-zk:create-resource", {
      title: "AI/ML/Foo",
      open: "false"
    });

    expect(created.ok).toBe(true);
    expect(created.created).toBe(true);
    expect(created.path).toBe("PARA/Resources/AI/ML/Foo.md");
    expect(created.title).toBe("Foo");

    const content = cli.app.readPath("PARA/Resources/AI/ML/Foo.md") ?? "";
    expect(content).toContain("tags:\n  - resource/foo");
    expect(content).not.toContain("resource/ml/foo");
  });

  it("reads, updates, and deletes a nested resource by exact title path", async () => {
    await cli.run("para-zk:create-resource", {
      title: "AI/Foo",
      body: "Initial notes",
      open: "false"
    });

    const read = await cli.run("para-zk:read-resource", {
      title: "AI/Foo",
      key: "body"
    });
    expect(read.ok).toBe(true);
    expect(read.path).toBe("PARA/Resources/AI/Foo.md");
    expect(String(read.value)).toContain("Initial notes");

    const update = await cli.run("para-zk:update-resource", {
      title: "AI/Foo",
      key: "body",
      op: "set",
      value: "Updated notes"
    });
    expect(update.ok).toBe(true);
    expect(update.path).toBe("PARA/Resources/AI/Foo.md");

    const updated = await cli.run("para-zk:read-resource", {
      title: "AI/Foo",
      key: "body"
    });
    expect(updated.ok).toBe(true);
    expect(String(updated.value)).toContain("Updated notes");

    const deleted = await cli.run("para-zk:delete-resource", { title: "AI/Foo" });
    expect(deleted.ok).toBe(true);
    expect(deleted.path).toBe("PARA/Resources/AI/Foo.md");
    expect(cli.app.readPath("PARA/Resources/AI/Foo.md")).toBeUndefined();
  });

  it("keeps bare-title flat-first and recursive unique lookup behavior", async () => {
    await cli.run("para-zk:create-resource", {
      title: "AI/Foo",
      body: "Nested",
      open: "false"
    });

    const nestedUnique = await cli.run("para-zk:read-resource", {
      title: "Foo",
      key: "body"
    });
    expect(nestedUnique.ok).toBe(true);
    expect(nestedUnique.path).toBe("PARA/Resources/AI/Foo.md");

    await cli.run("para-zk:create-resource", {
      title: "Foo",
      body: "Flat",
      open: "false"
    });
    const flatFirst = await cli.run("para-zk:read-resource", {
      title: "Foo",
      key: "body"
    });
    expect(flatFirst.path).toBe("PARA/Resources/Foo.md");
    expect(String(flatFirst.value)).toContain("Flat");

    await cli.run("para-zk:delete-resource", { title: "Foo" });
    await cli.run("para-zk:create-resource", {
      title: "ML/Foo",
      body: "Duplicate nested",
      open: "false"
    });

    const exact = await cli.run("para-zk:read-resource", {
      title: "AI/Foo",
      key: "body"
    });
    expect(exact.ok).toBe(true);
    expect(exact.path).toBe("PARA/Resources/AI/Foo.md");

    const ambiguous = await cli.run("para-zk:read-resource", {
      title: "Foo",
      key: "body"
    });
    expect(ambiguous.ok).toBe(false);
    expect(String(ambiguous.error)).toContain("resource title is ambiguous: Foo");
  });

  it.each(["../x", "/x", "x/", "a//b", ".."])("rejects unsafe resource title paths: %s", async (title) => {
    const before = cli.app.listPaths();
    const created = await cli.run("para-zk:create-resource", {
      title,
      open: "false"
    });
    expect(created.ok).toBe(false);
    expect(String(created.error)).toContain("resource title");

    const read = await cli.run("para-zk:read-resource", {
      title,
      key: "body"
    });
    expect(read.ok).toBe(false);
    expect(String(read.error)).toContain("resource title");
    expect(cli.app.listPaths()).toEqual(before);
  });

  it("create-resource records url/first_author/license/kind in frontmatter", async () => {
    const created = await cli.run("para-zk:create-resource", {
      title: "Attention",
      url: "https://arxiv.org/abs/1706.03762",
      first_author: "Ashish Vaswani",
      license: "arXiv",
      kind: "paper",
      open: "false"
    });
    expect(created.created).toBe(true);

    const url = await cli.run("para-zk:read-resource", { title: "Attention", key: "frontmatter/url" });
    expect(url.value).toBe("https://arxiv.org/abs/1706.03762");
    const author = await cli.run("para-zk:read-resource", { title: "Attention", key: "frontmatter/first_author" });
    expect(author.value).toBe("Ashish Vaswani");
    const license = await cli.run("para-zk:read-resource", { title: "Attention", key: "frontmatter/license" });
    expect(license.value).toBe("arXiv");
    const kind = await cli.run("para-zk:read-resource", { title: "Attention", key: "frontmatter/kind" });
    expect(kind.value).toBe("paper");
  });

  it("sets a single alias at create time and leaves omitted aliases empty", async () => {
    const aliased = await cli.run("para-zk:create-resource", {
      title: "Resource Alias",
      alias: ["PMG"],
      open: "false"
    });
    expect(aliased.created).toBe(true);

    const read = await cli.run("para-zk:read-resource", {
      title: "Resource Alias",
      key: "frontmatter/aliases"
    });
    expect(read.value).toEqual(["PMG"]);
    expect(cli.app.readPath("PARA/Resources/Resource Alias.md")).toContain("aliases:\n  - PMG");

    await cli.run("para-zk:create-resource", { title: "No Resource Alias", open: "false" });
    const omitted = await cli.run("para-zk:read-resource", {
      title: "No Resource Alias",
      key: "frontmatter/aliases"
    });
    expect(omitted.value).toBeNull();

    await cli.run("para-zk:create-resource", { title: "Blank Resource Alias", alias: "", open: "false" });
    const blank = await cli.run("para-zk:read-resource", {
      title: "Blank Resource Alias",
      key: "frontmatter/aliases"
    });
    expect(blank.value).toBeNull();
  });

  it("rejects an unknown kind code at create time, naming the valid codes", async () => {
    const result = await cli.run("para-zk:create-resource", { title: "Bad kind", kind: "journal", open: "false" });
    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain("kind");
    expect(String(result.error)).toContain("paper");
  });

  it("round-trips frontmatter/kind through update and read, validating the code", async () => {
    await cli.run("para-zk:create-resource", { title: "Doc", open: "false" });

    const update = await cli.run("para-zk:update-resource", {
      title: "Doc", key: "frontmatter/kind", op: "set", value: "article"
    });
    expect(update.changed).toBe(true);

    const read = await cli.run("para-zk:read-resource", { title: "Doc", key: "frontmatter/kind" });
    expect(read.value).toBe("article");

    const rejected = await cli.run("para-zk:update-resource", {
      title: "Doc", key: "frontmatter/kind", op: "set", value: "bogus"
    });
    expect(rejected.ok).toBe(false);
    expect(String(rejected.error)).toContain("kind");
  });

  it("treats license/url/first_author as free text on update (not code-validated)", async () => {
    await cli.run("para-zk:create-resource", { title: "Free", open: "false" });

    const set = await cli.run("para-zk:update-resource", {
      title: "Free", key: "frontmatter/license", op: "set", value: "CC-BY-4.0"
    });
    expect(set.changed).toBe(true);
    const license = await cli.run("para-zk:read-resource", { title: "Free", key: "frontmatter/license" });
    expect(license.value).toBe("CC-BY-4.0");

    const author = await cli.run("para-zk:update-resource", {
      title: "Free", key: "frontmatter/first_author", op: "set", value: "Ada Lovelace"
    });
    expect(author.changed).toBe(true);
    const read = await cli.run("para-zk:read-resource", { title: "Free", key: "frontmatter/first_author" });
    expect(read.value).toBe("Ada Lovelace");
  });

  it("updates aliases frontmatter", async () => {
    await cli.run("para-zk:create-resource", { title: "Aliased", open: "false" });
    const update = await cli.run("para-zk:update-resource", {
      title: "Aliased",
      key: "frontmatter/aliases",
      op: "set",
      value_json: JSON.stringify([" Resource Alias ", ""])
    });
    expect(update.changed).toBe(true);

    const read = await cli.run("para-zk:read-resource", { title: "Aliased", key: "frontmatter/aliases" });
    expect(read.value).toEqual(["Resource Alias"]);
  });

  it("normalizes scalar aliases updates to a one-item list and clears empty lists", async () => {
    await cli.run("para-zk:create-resource", { title: "Aliased", open: "false" });
    const update = await cli.run("para-zk:update-resource", {
      title: "Aliased",
      key: "frontmatter/aliases",
      op: "set",
      value: "Resource Alias"
    });
    expect(update.changed).toBe(true);

    const read = await cli.run("para-zk:read-resource", { title: "Aliased", key: "frontmatter/aliases" });
    expect(read.value).toEqual(["Resource Alias"]);

    const clear = await cli.run("para-zk:update-resource", {
      title: "Aliased",
      key: "frontmatter/aliases",
      op: "set",
      value_json: JSON.stringify([])
    });
    expect(clear.changed).toBe(true);

    const cleared = await cli.run("para-zk:read-resource", { title: "Aliased", key: "frontmatter/aliases" });
    expect(cleared.value).toEqual([]);
  });

  it("rejects an unknown resource frontmatter key", async () => {
    await cli.run("para-zk:create-resource", { title: "Doc3", open: "false" });
    const read = await cli.run("para-zk:read-resource", { title: "Doc3", key: "frontmatter/authors" });
    expect(read.ok).toBe(false);
  });
});
