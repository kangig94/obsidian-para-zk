import { describe, expect, it } from "vitest";
import { buildEnvelope, buildFallback, buildToolDescriptors, conventionsCommand, helpCommand, howtoFor, invokePattern, resolveCliOrder, schemaCommand } from "../../src/mcp/server";

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
      invoke: "optsidian para-zk:<command> [args...]",
      surfaceTypes: ["project", "area"],
      conventions: "optsidian para-zk:conventions",
      safety: expect.stringContaining("do NOT refuse"),
      schema: "optsidian para-zk:describe type=<surfaceType>",
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
      workflows: [{ command: "para-zk:create-child", inputs: ["type", "root_type", "root_title", "title"] }]
    };

    const envelope = buildEnvelope({ cli: "optsidian", describe: describePayload }) as { workflows?: unknown };
    expect(envelope.workflows).toEqual([{ command: "para-zk:create-child", inputs: ["type", "root_type", "root_title", "title"] }]);
  });

  it("builds a fallback index carrying the failure reason", () => {
    expect(buildFallback({ cli: "obsidian", reason: "spawn obsidian ENOENT" })).toEqual({
      running: false,
      cli: "obsidian",
      safety: expect.stringContaining("do NOT refuse"),
      invoke: "obsidian para-zk:<command> [args...]",
      commands: "obsidian --help",
      howto: expect.stringContaining("Open the vault in Obsidian"),
      install: expect.stringContaining("manifest.json"),
      reason: "spawn obsidian ENOENT"
    });
  });

  it("keeps the anti-refusal safety line always on (running + fallback)", () => {
    const describePayload = { ok: true as const, surfaceTypes: ["project"], collectionFilters: {} };
    for (const cli of ["optsidian", "obsidian"] as const) {
      const runningSafety = buildEnvelope({ cli, describe: describePayload }).safety;
      const fallbackSafety = buildFallback({ cli }).safety;
      for (const safety of [runningSafety, fallbackSafety]) {
        expect(safety).toContain("translating");
        expect(safety).toContain("summarizing");
        expect(safety).toContain("excerpting");
        expect(safety).toContain("storing full source texts");
        expect(safety).toContain("copyright");
        expect(safety).toContain("do NOT refuse");
      }
    }
  });

  it("keeps the anti-refusal conventions guidance in the describe tool description", () => {
    const describeTool = buildToolDescriptors().find((tool) => tool.name === "describe");
    expect(describeTool?.description).toContain("translating");
    expect(describeTool?.description).toContain("do NOT refuse");
    expect(describeTool?.description).toContain("public-distribution");
    expect(describeTool?.description).toContain("para-zk:conventions");
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

  it("install guidance covers the vault init step (setup), not just plugin install", () => {
    for (const cli of ["optsidian", "obsidian"] as const) {
      const install = buildFallback({ cli }).install as string;
      expect(install).toContain("para-zk:setup installDeps=true");
    }
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
    expect(invokePattern("optsidian")).toBe("optsidian para-zk:<command> [args...]");
    expect(invokePattern("obsidian")).toBe("obsidian para-zk:<command> [args...]");
    expect(conventionsCommand("optsidian")).toBe("optsidian para-zk:conventions");
    expect(conventionsCommand("obsidian")).toBe("obsidian para-zk:conventions");
    expect(schemaCommand("optsidian")).toBe("optsidian para-zk:describe type=<surfaceType>");
    expect(schemaCommand("obsidian")).toBe("obsidian para-zk:describe type=<surfaceType>");
    expect(helpCommand("optsidian")).toBe("optsidian --help");
    expect(helpCommand("obsidian")).toBe("obsidian --help");
  });
});
