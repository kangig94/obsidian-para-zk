import { beforeEach, describe, expect, it } from "vitest";
import { createCliHarness, type CliHarness } from "../harness/cli";

let cli: CliHarness;

beforeEach(() => {
  cli = createCliHarness();
});

function noteWithBareRef(link: string): string {
  return ["---", "type: resource", "references:", `  - link: "${link}"`, "    id: aaa111", "---", "body line"].join("\n");
}

describe("CLI text output (default format)", () => {
  it("audit renders findings, not just a static summary", async () => {
    await cli.app.vault.create("PARA/Resources/Paper/ASAP.md", "---\ntype: resource\n---\n");
    await cli.app.vault.create("Note.md", noteWithBareRef("[[ASAP]]"));

    const text = await cli.runText("para-zk:audit", { check: "bare_reference" });

    expect(text).not.toContain("vault audited");
    expect(text).toContain("bare_reference: 1");
    expect(text).toContain("Note.md");
    expect(text).toContain("[[ASAP]] -> PARA/Resources/Paper/ASAP.md");
  });

  it("audit reports a clean vault as 'no findings'", async () => {
    const text = await cli.runText("para-zk:audit", { check: "bare_reference" });
    expect(text).toBe("no findings");
  });

  it("list renders each note with its path", async () => {
    await cli.run("para-zk:create-project", { title: "Demo" });

    const text = await cli.runText("para-zk:list", { type: "project" });

    expect(text).toContain("1 notes");
    expect(text).toContain("Demo");
    expect(text).toContain("PARA/Projects/Demo/Demo.md");
  });

  it("mutation renders the summary and the resulting path", async () => {
    const text = await cli.runText("para-zk:create-project", { title: "Made In Text" });

    expect(text.split("\n")[0]).toBe("project created");
    expect(text).toContain("path: PARA/Projects/Made In Text/Made In Text.md");
  });

  it("read renders a path header instead of a bare confirmation", async () => {
    await cli.run("para-zk:create-project", { title: "Readable" });

    const text = await cli.runText("para-zk:read-project", { title: "Readable" });

    expect(text).not.toContain("project read");
    expect(text.split("\n")[0]).toBe("project  PARA/Projects/Readable/Readable.md");
  });

  it("errors render as a single error line", async () => {
    const text = await cli.runText("para-zk:read-project", { title: "Missing" });
    expect(text.startsWith("error: ")).toBe(true);
  });

  it("format=json stays an opt-in machine envelope", async () => {
    await cli.app.vault.create("PARA/Resources/Paper/ASAP.md", "---\ntype: resource\n---\n");
    await cli.app.vault.create("Note.md", noteWithBareRef("[[ASAP]]"));

    const json = await cli.runText("para-zk:audit", { check: "bare_reference", format: "json" });
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed.ok).toBe(true);
    expect((parsed.findings as unknown[]).length).toBeGreaterThan(0);
  });
});
