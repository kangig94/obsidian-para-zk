// CLI harness: drives the same native CLI handlers the smoke test exercises,
// but against the in-memory MockApp instead of a live Obsidian.
import { registerNativeCliHandlers, runNativeCliCommandPayload } from "../../src/cli/handlers";
import type { ParaZkPluginContext } from "../../src/plugin-interface";
import { DEFAULT_SETTINGS, type ParaZkSettings } from "../../src/types";
import { MockApp } from "./vault";

type CliHandler = (args?: Record<string, unknown>) => string | Promise<string>;

export type CliHarness = {
  app: MockApp;
  settings: ParaZkSettings;
  run: (command: string, args?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  // Invokes a command through the public text renderer and returns the raw
  // string, so tests can assert the human-facing output.
  runText: (command: string, args?: Record<string, unknown>) => Promise<string>;
};

export function createCliHarness(overrides: Partial<ParaZkSettings> = {}): CliHarness {
  const app = new MockApp();
  const settings: ParaZkSettings = { ...structuredClone(DEFAULT_SETTINGS), ...overrides };
  const handlers = new Map<string, CliHandler>();

  const plugin = {
    app,
    settings,
    saveSettings: async () => {},
    setupVault: async () => {
      throw new Error("setupVault is not available in unit tests");
    },
    registerCliHandler: (command: string, _d: string, _o: unknown, handler: CliHandler) => {
      handlers.set(command, handler);
    }
  };

  registerNativeCliHandlers(plugin as unknown as ParaZkPluginContext);

  return {
    app,
    settings,
    run: (command, args = {}) => runNativeCliCommandPayload(plugin as unknown as ParaZkPluginContext, command, args),
    runText: async (command, args = {}) => {
      const handler = handlers.get(command);
      if (!handler) throw new Error(`unknown CLI command: ${command}`);
      return handler(args);
    }
  };
}
