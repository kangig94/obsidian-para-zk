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
    expect(help.command).toBe("para-zk:create-area");
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
    expect(help.command).toBe("para-zk:create-area");
    expect((help.options as unknown[]).length).toBeGreaterThan(0);
  });

  it("treats help=false as a normal run — the command executes and reports its real error", async () => {
    const result = await cli.run("para-zk:create-area", { help: "false" });

    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain("title");
  });
});
