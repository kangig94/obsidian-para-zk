import type { Plugin } from "obsidian";
import type { InitOptions, InitResult, ParaZkSettings } from "./types";

export type ParaZkPluginContext = Plugin & {
  settings: ParaZkSettings;
  saveSettings(): Promise<void>;
  initializeVault(options?: InitOptions): Promise<InitResult>;
};
