import { beforeEach, describe, expect, it } from "vitest";
import { createCliHarness, type CliHarness } from "../harness/cli";

let cli: CliHarness;

beforeEach(() => {
  cli = createCliHarness();
});

describe("create-from-resource", () => {
  it("creates a source ZK note that references the preserved resource", async () => {
    await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });
    const resource = await cli.run("para-zk:create-resource", {
      title: "Source",
      path: "PARA/Projects/Alpha/Alpha.md",
      link: "true",
      open: "false"
    });

    const created = await cli.run("para-zk:create-from-resource", {
      path: String(resource.path),
      title: "Distilled source",
      kind: "source",
      open: "false"
    });
    expect(created.created).toBe(true);
    const content = cli.app.readPath(String(created.path)) ?? "";
    expect(content).toContain("type: zk_source");
    expect(content).toContain(`[[${resource.path}]]`);

    // Single-direction reference: the resource is preserved but gets no reverse
    // link written back into it — the new note surfaces via Obsidian backlinks.
    const resourceContent = cli.app.readPath(String(resource.path)) ?? "";
    expect(resourceContent, "resource should remain after creating a ZK note").not.toBe("");
    expect(resourceContent).not.toContain(`[[${created.path}`);
    expect(resourceContent).toContain("```para-zk-managed");
  });
});

describe("create-permanent", () => {
  it("creates a permanent note that references the preserved source", async () => {
    const source = await cli.run("para-zk:create-zk", { title: "Book note", kind: "source", open: "false" });

    const created = await cli.run("para-zk:create-permanent", {
      path: String(source.path),
      title: "Evergreen book note",
      maturity: "refined",
      open: "false"
    });
    expect(created.created).toBe(true);
    expect(created.kind).toBe("Permanent");

    const createdContent = cli.app.readPath(String(created.path)) ?? "";
    expect(createdContent).toContain("type: zk_permanent");
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
      path: String(spark.path),
      title: "Evergreen spark",
      maturity: "evergreen",
      open: "false"
    });
    expect(distilled.created).toBe(true);
    expect(distilled.kind).toBe("Permanent");

    const distilledContent = cli.app.readPath(String(distilled.path)) ?? "";
    expect(distilledContent).toContain("type: zk_permanent");
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
      path: String(spark.path),
      title: "Distilled permanent",
      open: "false"
    });
    expect(cli.app.readPath(String(spark.path)) ?? "").toContain(String(distilled.path));

    await cli.run("para-zk:delete-zk", { path: String(distilled.path) });

    // Deleting the permanent must not leave a dangling distilled_to pointer on the spark.
    const sparkContent = cli.app.readPath(String(spark.path)) ?? "";
    expect(sparkContent).not.toContain(String(distilled.path));
  });

  it("discards the spark when discard=true", async () => {
    const spark = await cli.run("para-zk:create-zk", { title: "Throwaway spark", kind: "spark", open: "false" });

    const distilled = await cli.run("para-zk:distill-spark", {
      path: String(spark.path),
      title: "Kept permanent",
      discard: "true",
      open: "false"
    });
    expect(distilled.created).toBe(true);
    expect(cli.app.readPath(String(distilled.path)) ?? "").toContain("type: zk_permanent");

    // The spark is gone (moved to trash), and the permanent never referenced it.
    expect(cli.app.readPath(String(spark.path)), "spark should be removed when discarded").toBeFalsy();
  });
});
