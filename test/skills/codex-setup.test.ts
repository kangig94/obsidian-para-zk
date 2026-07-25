import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length) rmSync(tempRoots.pop()!, { recursive: true, force: true });
});

describe("codex-setup", () => {
  it("installs wiki-weaver without requiring Optsidian MCP and preserves CLI fallback guidance", () => {
    const outDir = mkdtempSync(path.join(os.tmpdir(), "para-zk-codex-agents-"));
    tempRoots.push(outDir);

    const output = execFileSync(
      process.execPath,
      [
        path.resolve("clients/skills/codex-setup/scripts/install-codex-agents.mjs"),
        "--out-dir",
        outDir,
        "--source-dir",
        path.resolve("clients/agents")
      ],
      { cwd: path.resolve("."), encoding: "utf8" }
    );

    expect(output).toContain(`installed: ${path.join(outDir, "wiki-weaver.toml")}`);

    const generated = readFileSync(path.join(outDir, "wiki-weaver.toml"), "utf8");
    expect(generated).toContain("prefer the Optsidian MCP command runner when available");
    expect(generated).toContain("Otherwise use Bash with `optsidian`");
    expect(generated).toContain("fall back to the native `obsidian` CLI");
    expect(generated).not.toContain("requires the Optsidian MCP command runner");
  });

  it("documents runtime transport checks as non-blocking setup diagnostics", () => {
    const skill = readFileSync(path.resolve("clients/skills/codex-setup/SKILL.md"), "utf8");

    expect(skill).toContain("Do not block installation on Optsidian or its MCP");
    expect(skill).toContain("The agent files are still installed successfully.");
    expect(skill).not.toContain("if that tool is missing,\n   stop");
  });
});
