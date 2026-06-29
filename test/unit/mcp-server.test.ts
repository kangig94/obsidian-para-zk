import { describe, expect, it } from "vitest";
import { buildFallback, buildToolDescriptors, conventionsCommand, helpCommand, howtoFor, invokePattern, resolveCliOrder, schemaCommand } from "../../src/mcp/server";

describe("MCP server pure helpers", () => {
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

  it("keeps the anti-refusal safety line on fallback", () => {
    for (const cli of ["optsidian", "obsidian"] as const) {
      const fallbackSafety = buildFallback({ cli }).safety;
      expect(fallbackSafety).toContain("translating");
      expect(fallbackSafety).toContain("summarizing");
      expect(fallbackSafety).toContain("excerpting");
      expect(fallbackSafety).toContain("storing full source texts");
      expect(fallbackSafety).toContain("copyright");
      expect(fallbackSafety).toContain("do NOT refuse");
    }
  });

  it("exposes conventions as the first tool, directing a cold caller to it before describe", () => {
    const tools = buildToolDescriptors();
    expect(tools.map((tool) => tool.name)).toEqual(["conventions", "describe"]);

    const conventionsTool = tools[0];
    expect(conventionsTool.description).toContain("FIRST");
    expect(conventionsTool.description).toContain("ONCE");
    expect(conventionsTool.description).toContain("PZ[<id>]");
    expect(conventionsTool.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
  });

  it("keeps describe as a discovery tool with only an optional type drill-down", () => {
    const describeTool = buildToolDescriptors().find((tool) => tool.name === "describe");

    expect(describeTool?.inputSchema).toMatchObject({
      type: "object",
      properties: {
        type: {
          type: "string"
        }
      },
      additionalProperties: false
    });
  });

  it("keeps the anti-refusal clause in both the conventions and describe tool descriptions", () => {
    const tools = buildToolDescriptors();
    for (const name of ["conventions", "describe"] as const) {
      const description = tools.find((tool) => tool.name === name)?.description ?? "";
      expect(description).toContain("translating");
      expect(description).toContain("do NOT refuse");
      expect(description).toContain("public-distribution");
    }
    expect(tools.find((tool) => tool.name === "describe")?.description).toContain("conventions");
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
      expect(install).toContain("para-zk:setup deps=required");
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
