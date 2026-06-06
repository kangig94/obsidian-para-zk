import { describe, expect, it } from "vitest";
import { buildEnvelope, buildFallback, helpCommand, howtoFor, invokePattern, resolveCliOrder, schemaCommand } from "../../src/mcp/server";

describe("MCP server pure helpers", () => {
  it("maps describe JSON into a compact discovery index", () => {
    const describePayload = {
      ok: true as const,
      command: "para-zk:describe",
      surfaces: [{ type: "project", readKeys: [], writeKeys: [] }, { type: "area" }, { notype: true }],
      collectionFilters: {}
    };

    expect(buildEnvelope({ cli: "optsidian", describe: describePayload })).toEqual({
      running: true,
      cli: "optsidian",
      invoke: "optsidian raw para-zk:<command> [args...] format=json",
      surfaceTypes: ["project", "area"],
      schema: "optsidian raw para-zk:describe type=<surfaceType> format=json",
      commands: "optsidian --help",
      howto: expect.stringContaining("Locale-neutral"),
      install: expect.stringContaining("plugin:install")
    });
  });

  it("passes named workflows through to the discovery index", () => {
    const describePayload = {
      ok: true as const,
      surfaceTypes: ["project"],
      collectionFilters: {},
      workflows: [{ command: "para-zk:add-reference", inputs: ["type", "title", "target"] }]
    };

    const envelope = buildEnvelope({ cli: "optsidian", describe: describePayload }) as { workflows?: unknown };
    expect(envelope.workflows).toEqual([{ command: "para-zk:add-reference", inputs: ["type", "title", "target"] }]);
  });

  it("builds a fallback index carrying the failure reason", () => {
    expect(buildFallback({ cli: "obsidian", reason: "spawn obsidian ENOENT" })).toEqual({
      running: false,
      cli: "obsidian",
      invoke: "obsidian para-zk:<command> [args...] format=json",
      commands: "obsidian --help",
      howto: expect.stringContaining("Open the vault in Obsidian"),
      install: expect.stringContaining("manifest.json"),
      reason: "spawn obsidian ENOENT"
    });
  });

  it("omits reason from fallback when none is given", () => {
    expect(buildFallback({ cli: "optsidian" })).not.toHaveProperty("reason");
  });

  it("guides optsidian users to launch via open-gui in the fallback howto", () => {
    expect(buildFallback({ cli: "optsidian" }).howto).toContain("optsidian open-gui");
    expect(buildFallback({ cli: "obsidian" }).howto).not.toContain("open-gui");
  });

  it("offers CLI-matched vault install guidance (both running states)", () => {
    expect(buildFallback({ cli: "optsidian" }).install).toContain("plugin:install url=");
    expect(buildFallback({ cli: "obsidian" }).install).toContain("manifest.json");
  });

  it("explains optsidian only when it is the chosen CLI", () => {
    expect(howtoFor("optsidian")).toContain("Obsidian-based optimized CLI");
    expect(howtoFor("optsidian")).toContain("do not substitute `obsidian`");
    expect(howtoFor("obsidian")).not.toContain("optimized");
    expect(howtoFor("obsidian")).toContain("Locale-neutral");
  });

  it("resolves CLI order from the environment", () => {
    expect(resolveCliOrder({})).toEqual(["optsidian", "obsidian"]);
    expect(resolveCliOrder({ PARA_ZK_CLI: "obsidian" })).toEqual(["obsidian"]);
    expect(resolveCliOrder({ PARA_ZK_CLI: "optsidian" })).toEqual(["optsidian"]);
  });

  it("documents CLI invocation, schema drill-down, and help commands", () => {
    expect(invokePattern("optsidian")).toBe("optsidian raw para-zk:<command> [args...] format=json");
    expect(invokePattern("obsidian")).toBe("obsidian para-zk:<command> [args...] format=json");
    expect(schemaCommand("optsidian")).toBe("optsidian raw para-zk:describe type=<surfaceType> format=json");
    expect(schemaCommand("obsidian")).toBe("obsidian para-zk:describe type=<surfaceType> format=json");
    expect(helpCommand("optsidian")).toBe("optsidian --help");
    expect(helpCommand("obsidian")).toBe("obsidian --help");
  });
});
