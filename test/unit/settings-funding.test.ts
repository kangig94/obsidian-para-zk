import { describe, expect, it } from "vitest";
import type { PluginManifest } from "obsidian";
import { localePack } from "../../src/i18n";
import type { ParaZkPluginContext } from "../../src/plugin-interface";
import { DEFAULT_SETTINGS } from "../../src/types";
import { ParaZkSettingTab, fundingLinks } from "../../src/ux/settings";

function manifest(fundingUrl?: unknown): PluginManifest {
  return {
    id: "para-zk",
    name: "Para-ZK",
    version: "0.0.0",
    minAppVersion: "1.0.0",
    description: "",
    author: "kangig94",
    ...(fundingUrl === undefined ? {} : { fundingUrl })
  } as unknown as PluginManifest;
}

describe("fundingLinks", () => {
  it("derives GitHub Sponsors and Buy Me a Coffee URLs from the funding handle", () => {
    expect(fundingLinks(manifest("https://github.com/sponsors/kangig94"))).toEqual({
      githubSponsors: "https://github.com/sponsors/kangig94",
      buyMeACoffee: "https://www.buymeacoffee.com/kangig94"
    });
  });

  it("returns null when no fundingUrl is configured", () => {
    expect(fundingLinks(manifest())).toBeNull();
  });

  it("returns null for a non-string fundingUrl", () => {
    expect(fundingLinks(manifest({ "GitHub Sponsors": "https://github.com/sponsors/kangig94" }))).toBeNull();
  });
});

describe("ParaZkSettingTab definitions", () => {
  it("exposes every setting to Obsidian settings search", () => {
    const plugin = {
      app: {},
      manifest: manifest("https://github.com/sponsors/kangig94"),
      settings: DEFAULT_SETTINGS
    } as unknown as ParaZkPluginContext;
    const labels = localePack("en").labels;

    const definitions = new ParaZkSettingTab(plugin).getSettingDefinitions();

    expect(definitions.map((definition) => definition.name)).toEqual([
      labels.settingsHeading,
      labels.settingsSetupVault,
      labels.setupRequiredDeps,
      labels.setupEnhancementDeps,
      labels.settingsShowRibbon,
      labels.settingsEmptyTrashAction,
      labels.settingsEditorWidthSlider,
      labels.settingsRememberCursorPosition,
      labels.settingsSupportHeading
    ]);
    expect(definitions.every((definition) => typeof definition.render === "function")).toBe(true);
  });

  it("omits the support row when the manifest has no funding URL", () => {
    const plugin = {
      app: {},
      manifest: manifest(),
      settings: DEFAULT_SETTINGS
    } as unknown as ParaZkPluginContext;

    const definitions = new ParaZkSettingTab(plugin).getSettingDefinitions();

    expect(definitions).toHaveLength(8);
  });
});
