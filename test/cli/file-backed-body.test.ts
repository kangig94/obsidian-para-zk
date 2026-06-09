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

  it("reads update value from an @file for child body replacement", async () => {
    const file = join(tempDir, "update-body.md");
    const body = "# Plan\n\nLine with $VAR, `backticks`, \"quotes\" and 'apostrophes'.\n";
    await writeFile(file, body);

    await cli.run("para-zk:create-project", { title: "Alpha", open: "false" });
    await cli.run("para-zk:create-child", {
      type: "subnote",
      title: "Plan",
      root_type: "project",
      root_title: "Alpha",
      subnote_type: "plan",
      open: "false"
    });

    const updated = await cli.run("para-zk:update-child", {
      root_type: "project",
      root_title: "Alpha",
      title: "Plan",
      key: "body",
      op: "set",
      value: `@${file}`
    });
    expect(updated.changed).toBe(true);

    const read = await cli.run("para-zk:read-child", { root_type: "project", root_title: "Alpha", title: "Plan", key: "body" });
    expect(String(read.value)).toContain("Line with $VAR, `backticks`, \"quotes\" and 'apostrophes'.");
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

describe("values are verbatim (no escape decoding)", () => {
  it("preserves backslash escapes (LaTeX) when updating a body from an @file", async () => {
    const file = join(tempDir, "math.md");
    // \nabla / \theta / \tau / \times begin with \n and \t — the bug turned these
    // into a newline and a tab, corrupting the math. They must survive byte-for-byte.
    await writeFile(file, "# Math\n\n$\\nabla_\\theta \\pi_\\theta = \\tau$, with $a \\times b$.\n");

    await cli.run("para-zk:create-resource", { title: "Math", body: "# Math\n", open: "false" });
    const updated = await cli.run("para-zk:update-resource", { title: "Math", key: "body", op: "set", value: `@${file}` });
    expect(updated.changed).toBe(true);

    const read = await cli.run("para-zk:read-resource", { title: "Math", key: "body" });
    const value = String(read.value);
    expect(value).toContain("\\nabla_\\theta");
    expect(value).toContain("\\tau");
    expect(value).toContain("a \\times b");
    expect(value).not.toContain("\t");
    expect(value).not.toContain("\nabla");
  });

  it("stores an inline value verbatim, leaving backslash escapes literal", async () => {
    await cli.run("para-zk:create-resource", { title: "Lit", body: "# Lit\n", open: "false" });
    await cli.run("para-zk:update-resource", { title: "Lit", key: "body", op: "set", value: "alpha \\theta beta" });

    const read = await cli.run("para-zk:read-resource", { title: "Lit", key: "body" });
    expect(String(read.value)).toContain("alpha \\theta beta");
    expect(String(read.value)).not.toContain("\t");
  });

  it("matches and replaces a backslash-escape literally (op=replace match/with verbatim)", async () => {
    const file = join(tempDir, "src.md");
    await writeFile(file, "# T\n\n$\\theta$ appears here.\n");
    await cli.run("para-zk:create-resource", { title: "Repl", body: "# T\n", open: "false" });
    await cli.run("para-zk:update-resource", { title: "Repl", key: "body", op: "set", value: `@${file}` });

    const replaced = await cli.run("para-zk:update-resource", { title: "Repl", key: "body", op: "replace", match: "\\theta", with: "\\phi" });
    expect(replaced.changed).toBe(true);

    const read = await cli.run("para-zk:read-resource", { title: "Repl", key: "body" });
    expect(String(read.value)).toContain("$\\phi$");
    expect(String(read.value)).not.toContain("\\theta");
  });
});
