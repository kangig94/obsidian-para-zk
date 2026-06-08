import { beforeEach, describe, expect, it } from "vitest";
import { createCliHarness, type CliHarness } from "../harness/cli";

let cli: CliHarness;

beforeEach(() => {
  cli = createCliHarness();
});

describe("resource provenance frontmatter", () => {
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
