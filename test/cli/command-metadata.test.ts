// Snapshot guard for the native CLI command table's user-facing metadata
// (command name, description, and option specs/help). The run() bodies are
// covered by the other cli/*.test.ts suites; this pins the help surface so a
// refactor of the command table (e.g. factory extraction) cannot silently
// drift any command name, description, or option text.
import { expect, it } from "vitest";
import { registerNativeCliHandlers } from "../../src/cli/handlers";
import type { ParaZkPluginContext } from "../../src/plugin-interface";
import { DEFAULT_SETTINGS } from "../../src/types";
import { MockApp } from "../harness/vault";

type CapturedCommand = { command: string; description: string; options: unknown };

it("native CLI command metadata is stable", () => {
  const captured: CapturedCommand[] = [];
  const plugin = {
    app: new MockApp(),
    settings: structuredClone(DEFAULT_SETTINGS),
    saveSettings: async () => {},
    setupVault: async () => {
      throw new Error("setupVault is not available in unit tests");
    },
    registerCliHandler: (command: string, description: string, options: unknown) => {
      captured.push({ command, description, options });
    }
  };

  registerNativeCliHandlers(plugin as unknown as ParaZkPluginContext);
  captured.sort((a, b) => a.command.localeCompare(b.command));

  expect(captured).toMatchSnapshot();
});
