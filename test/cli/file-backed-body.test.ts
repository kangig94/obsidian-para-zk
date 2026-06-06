import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCliHarness, type CliHarness } from "../harness/cli";

let cli: CliHarness;
let tempDir: string;

beforeEach(async () => {
  cli = createCliHarness();
  tempDir = await mkdtemp(join(tmpdir(), "para-zk-body-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("file-backed body/content (@file)", () => {
  it("reads create body from an @file so large content needs no shell quoting", async () => {
    const file = join(tempDir, "body.md");
    const body = "# Attention\n\nLine with $VAR, `backticks`, \"quotes\" and 'apostrophes'.\n- bullet\n";
    await writeFile(file, body);

    const created = await cli.run("para-zk:create-resource", { title: "Doc", body: `@${file}`, open: "false" });
    expect(created.created).toBe(true);

    const content = cli.app.readPath(String(created.path)) ?? "";
    expect(content).toContain("Line with $VAR, `backticks`, \"quotes\" and 'apostrophes'.");
    expect(content).toContain("- bullet");
  });

  it("passes a literal (non-@) body through unchanged", async () => {
    const created = await cli.run("para-zk:create-resource", { title: "Inline", body: "just text", open: "false" });
    expect(created.created).toBe(true);
    expect(cli.app.readPath(String(created.path)) ?? "").toContain("just text");
  });

  it("does not treat journal content as a file path, so @mentions stay literal", async () => {
    const captured = await cli.run("para-zk:capture-journal", { content: "@alice sync notes", date: "2026-06-06", open: "false" });
    expect(captured.ok).toBe(true);
    expect(cli.app.readPath(String(captured.path)) ?? "").toContain("@alice sync notes");
  });

  it("rejects an @ value with no path", async () => {
    const result = await cli.run("para-zk:create-resource", { title: "Bad", body: "@", open: "false" });
    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain("@file value must include a path");
  });

  it("does not read a file for body=@ on a command without a body option", async () => {
    const created = await cli.run("para-zk:create-area", { title: "Topic", body: "@/no/such/file.md", open: "false" });
    expect(created.ok).toBe(true);
    expect(created.created).toBe(true);
  });
});
