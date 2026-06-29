import { beforeEach, describe, expect, it } from "vitest";
import { createCliHarness, type CliHarness } from "../harness/cli";

let cli: CliHarness;

beforeEach(() => {
  cli = createCliHarness();
});

describe("per-command help", () => {
  it("answers help=true with the command's own option schema instead of running it", async () => {
    const help = await cli.run("para-zk:create-area", { help: "true" });

    expect(help.ok).toBe(true);
    expect(help).not.toHaveProperty("command");
    expect(String(help.description)).toContain("area");

    const options = help.options as Array<{ name: string; value: string | null; description: string }>;
    expect(options.map((option) => option.name)).toContain("title");
    expect(options.find((option) => option.name === "title")?.description).toBeTruthy();

    // Help describes the command; it must not have executed the create side effect.
    expect(help).not.toHaveProperty("created");
  });

  it("honors a forwarded --help flag the same way", async () => {
    const help = await cli.run("para-zk:create-area", { "--help": true });

    expect(help.ok).toBe(true);
    expect(help).not.toHaveProperty("command");
    expect((help.options as unknown[]).length).toBeGreaterThan(0);
  });

  it("advertises the fetch-once conventions command", async () => {
    const help = await cli.run("para-zk:conventions", { help: "true" });

    expect(help.ok).toBe(true);
    expect(String(help.description)).toContain("once per task");
    const options = help.options as Array<{ name: string }>;
    expect(options.map((option) => option.name)).toEqual([]);
  });

  it("advertises resource subdirectory title paths in per-command help", async () => {
    const createHelp = await cli.run("para-zk:create-resource", { help: "true" });
    const createOptions = createHelp.options as Array<{ name: string; description: string }>;
    expect(createOptions.find((option) => option.name === "title")?.description).toContain("Resources-relative path");
    expect(createOptions.find((option) => option.name === "title")?.description).toContain("AI/Foo");

    const readHelp = await cli.run("para-zk:read-resource", { help: "true" });
    const readOptions = readHelp.options as Array<{ name: string; description: string }>;
    expect(readOptions.find((option) => option.name === "title")?.description).toContain("Resources-relative path");

    const renameHelp = await cli.run("para-zk:rename-resource", { help: "true" });
    const renameOptions = renameHelp.options as Array<{ name: string; description: string }>;
    expect(renameOptions.find((option) => option.name === "title")?.description).toContain("Resources-relative path");

    const deleteHelp = await cli.run("para-zk:delete-resource", { help: "true" });
    const deleteOptions = deleteHelp.options as Array<{ name: string; description: string }>;
    expect(deleteOptions.find((option) => option.name === "title")?.description).toContain("Resources-relative path");
  });

  it("treats help=false as a normal run — the command executes and reports its real error", async () => {
    const result = await cli.run("para-zk:create-area", { help: "false" });

    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain("title");
  });
});
