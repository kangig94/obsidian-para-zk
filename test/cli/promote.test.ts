import { beforeEach, describe, expect, it } from "vitest";
import { createCliHarness, type CliHarness } from "../harness/cli";

let cli: CliHarness;

beforeEach(() => {
  cli = createCliHarness();
});

describe("promote-resource", () => {
  it("creates a literature ZK note linked back to the resource", async () => {
    await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });
    const resource = await cli.run("para-zk:create-resource", {
      title: "Source",
      path: "PARA/Projects/Alpha/Alpha.md",
      link: "true",
      open: "false"
    });

    const promoted = await cli.run("para-zk:promote-resource", {
      path: String(resource.path),
      title: "Promoted source",
      kind: "literature",
      open: "false"
    });
    expect(promoted.created).toBe(true);
    const content = cli.app.readPath(String(promoted.path)) ?? "";
    expect(content).toContain("type: zk_literature");
    expect(content).toContain(`[[${resource.path}]]`);

    const sourceContent = cli.app.readPath(String(resource.path)) ?? "";
    expect(sourceContent).toContain(`[[${promoted.path}|Promoted source]]`);
    expect(sourceContent).toContain("```para-zk-managed");
  });
});

describe("promote-fleeting", () => {
  it("creates a permanent note and keeps the processed fleeting source in place", async () => {
    const fleeting = await cli.run("para-zk:create-zk", { title: "Spark", kind: "fleeting", open: "false" });

    const promoted = await cli.run("para-zk:promote-fleeting", {
      path: String(fleeting.path),
      title: "Evergreen spark",
      kind: "permanent",
      maturity: "evergreen",
      open: "false"
    });
    expect(promoted.created).toBe(true);

    const promotedContent = cli.app.readPath(String(promoted.path)) ?? "";
    expect(promotedContent).toContain("type: zk_permanent");
    expect(promotedContent).toContain("maturity: evergreen");
    expect(promotedContent).toContain(`[[${fleeting.path}]]`);

    const fleetingContent = cli.app.readPath(String(fleeting.path));
    expect(fleetingContent, "fleeting source should remain after promotion").toBeDefined();
    expect(fleetingContent).toContain("processed: true");
    expect(fleetingContent).toContain(String(promoted.path));
  });
});
