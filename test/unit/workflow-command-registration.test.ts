import { describe, expect, it } from "vitest";
import type { ParaZkPluginContext } from "../../src/plugin-interface";
import { DEFAULT_SETTINGS } from "../../src/types";
import { registerInitCommands, registerWorkflowCommands } from "../../src/ux/actions/workflows";

describe("workflow command registration", () => {
  it("registers only setup for init commands", () => {
    const commandIds: string[] = [];
    const plugin = {
      settings: structuredClone(DEFAULT_SETTINGS),
      addCommand: (command: { id: string }) => {
        commandIds.push(command.id);
      }
    } as unknown as ParaZkPluginContext;

    registerInitCommands(plugin);

    expect(commandIds).toEqual(["setup-vault"]);
  });

  it("registers workflow commands separately from init commands", () => {
    const commandIds: string[] = [];
    const plugin = {
      settings: structuredClone(DEFAULT_SETTINGS),
      addCommand: (command: { id: string }) => {
        commandIds.push(command.id);
      }
    } as unknown as ParaZkPluginContext;

    registerWorkflowCommands(plugin);

    expect(commandIds).toContain("create-project");
    expect(commandIds).toContain("capture-journal");
  });
});
