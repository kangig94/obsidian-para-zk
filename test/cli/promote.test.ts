import { beforeEach, describe, expect, it } from "vitest";
import { createCliHarness, type CliHarness } from "../harness/cli";

let cli: CliHarness;

beforeEach(() => {
  cli = createCliHarness();
});

describe("create-from-resource", () => {
  it("creates a digest ZK note that references the preserved resource", async () => {
    await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });
    const resource = await cli.run("para-zk:create-resource", {
      title: "Source",
      source_type: "project",
      source_title: "Alpha",
      link: "true",
      open: "false"
    });

    const created = await cli.run("para-zk:create-from-resource", {
      source_title: "Source",
      title: "Distilled source",
      kind: "digest",
      open: "false"
    });
    expect(created.created).toBe(true);
    expect(created.kind).toBe("digest");
    const content = cli.app.readPath(String(created.path)) ?? "";
    expect(content).toContain("type: digest");
    expect(content).toContain(`[[${resource.path}]]`);

    // Single-direction reference: the resource is preserved but gets no reverse
    // link written back into it — the new note surfaces via Obsidian backlinks.
    const resourceContent = cli.app.readPath(String(resource.path)) ?? "";
    expect(resourceContent, "resource should remain after creating a ZK note").not.toBe("");
    expect(resourceContent).not.toContain(`[[${created.path}`);
    expect(resourceContent).toContain("```para-zk-managed");
  });

  it("returns the existing ZK note on a duplicate title without clobbering its body", async () => {
    await cli.run("para-zk:create-resource", { title: "Src", open: "false" });
    const first = await cli.run("para-zk:create-from-resource", { source_title: "Src", title: "Promoted", kind: "digest", body: "Original.", open: "false" });
    expect(first.created).toBe(true);

    const dup = await cli.run("para-zk:create-from-resource", { source_title: "Src", title: "Promoted", kind: "digest", body: "Replacement.", open: "false" });
    expect(dup).toMatchObject({ created: false, path: first.path });
    const content = cli.app.readPath(String(first.path)) ?? "";
    expect(content).toContain("Original.");
    expect(content).not.toContain("Replacement.");
  });
});

describe("create-from-digest", () => {
  it("creates a permanent note that references the preserved source", async () => {
    const source = await cli.run("para-zk:create-zk", { title: "Book note", kind: "digest", open: "false" });

    const created = await cli.run("para-zk:create-from-digest", {
      source_title: "Book note",
      title: "Evergreen book note",
      maturity: "refined",
      open: "false"
    });
    expect(created.created).toBe(true);
    expect(created.kind).toBe("permanent");

    const createdContent = cli.app.readPath(String(created.path)) ?? "";
    expect(createdContent).toContain("type: permanent");
    expect(createdContent).toContain("maturity: refined");
    expect(createdContent).toContain(`[[${source.path}]]`);

    const sourceContent = cli.app.readPath(String(source.path));
    expect(sourceContent, "source should remain after creating a permanent note").toBeDefined();
    expect(sourceContent).not.toContain(`[[${created.path}`);
    expect(sourceContent).not.toContain("processed: true");
  });
});

describe("distill-spark", () => {
  it("distills a spark into a permanent note and marks the spark processed", async () => {
    const spark = await cli.run("para-zk:create-zk", { title: "Spark", kind: "spark", open: "false" });

    const distilled = await cli.run("para-zk:distill-spark", {
      source_title: "Spark",
      title: "Evergreen spark",
      maturity: "evergreen",
      open: "false"
    });
    expect(distilled.created).toBe(true);
    expect(distilled.kind).toBe("permanent");

    const distilledContent = cli.app.readPath(String(distilled.path)) ?? "";
    expect(distilledContent).toContain("type: permanent");
    expect(distilledContent).toContain("maturity: evergreen");
    // The spark is ephemeral: the permanent does not reference it.
    expect(distilledContent).not.toContain(`[[${spark.path}]]`);

    // The spark is preserved (discard is a separate, manual action), marked processed,
    // and records what it became via distilled_to (the pointer lives on the spark).
    const sparkContent = cli.app.readPath(String(spark.path));
    expect(sparkContent, "spark should remain after distillation").toBeDefined();
    expect(sparkContent).toContain("processed: true");
    expect(sparkContent).toContain("distilled_to");
    expect(sparkContent).toContain(String(distilled.path));
  });

  it("cleans the spark's distilled_to when the distilled permanent is deleted", async () => {
    const spark = await cli.run("para-zk:create-zk", { title: "Lingering spark", kind: "spark", open: "false" });
    const distilled = await cli.run("para-zk:distill-spark", {
      source_title: "Lingering spark",
      title: "Distilled permanent",
      open: "false"
    });
    expect(cli.app.readPath(String(spark.path)) ?? "").toContain(String(distilled.path));

    await cli.run("para-zk:delete-zk", { title: "Distilled permanent", kind: "permanent" });

    // Deleting the permanent must not leave a dangling distilled_to pointer on the spark.
    const sparkContent = cli.app.readPath(String(spark.path)) ?? "";
    expect(sparkContent).not.toContain(String(distilled.path));
  });

  it("discards the spark when discard=true", async () => {
    const spark = await cli.run("para-zk:create-zk", { title: "Throwaway spark", kind: "spark", open: "false" });

    const distilled = await cli.run("para-zk:distill-spark", {
      source_title: "Throwaway spark",
      title: "Kept permanent",
      discard: "true",
      open: "false"
    });
    expect(distilled.created).toBe(true);
    expect(cli.app.readPath(String(distilled.path)) ?? "").toContain("type: permanent");

    // The spark is gone (moved to trash), and the permanent never referenced it.
    expect(cli.app.readPath(String(spark.path)), "spark should be removed when discarded").toBeFalsy();
  });

  it("does not discard the spark when the target permanent already exists", async () => {
    await cli.run("para-zk:create-zk", { title: "Idea", kind: "spark", open: "false" });
    const first = await cli.run("para-zk:distill-spark", { source_title: "Idea", title: "Evergreen Idea", open: "false" });
    expect(first.created).toBe(true);
    expect(cli.app.readPath("ZK/Spark/Idea.md")).toBeDefined();

    // Re-distilling into the now-existing permanent with discard=true creates nothing new
    // (created:false) and must NOT trash the spark — no new permanent was produced.
    const second = await cli.run("para-zk:distill-spark", { source_title: "Idea", title: "Evergreen Idea", discard: "true", open: "false" });
    expect(second.created).toBe(false);
    expect(cli.app.readPath("ZK/Spark/Idea.md"), "spark must survive when no new permanent was created").toBeDefined();
  });
});
