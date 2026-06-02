import type { Plugin } from "obsidian";
import type { SetupOptions, SetupResult, ParaZkSettings } from "./types";

export type ParaZkPluginContext = Plugin & {
  settings: ParaZkSettings;
  saveSettings(): Promise<void>;
  setupVault(options?: SetupOptions): Promise<SetupResult>;
};
