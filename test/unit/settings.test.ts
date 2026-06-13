import { describe, expect, it } from "vitest";
import type { Plugin } from "obsidian";
import { loadSettings, mergeSettings } from "../../src/runtime/settings";
import { DEFAULT_SETTINGS } from "../../src/types";

describe("mergeSettings", () => {
  it("loads old data.json without wikiFolder using the default wiki folder", async () => {
    const plugin = {
      loadData: async () => ({
        paths: {
          resourcesFolder: "Library"
        }
      })
    } as unknown as Plugin;

    const settings = await loadSettings(plugin);

    expect(settings.paths).toMatchObject({
      resourcesFolder: "Library",
      wikiFolder: "LLM-Wiki"
    });
  });

  it("defaults editorLineWidth when absent", () => {
    expect(mergeSettings({}).editorLineWidth).toBe(DEFAULT_SETTINGS.editorLineWidth);
  });

  it("defaults wikiFolder when absent", () => {
    expect(mergeSettings({ paths: { resourcesFolder: "Library" } }).paths).toMatchObject({
      resourcesFolder: "Library",
      wikiFolder: "LLM-Wiki"
    });
  });

  it("adds the wiki folder to old saved layoutFolders arrays", () => {
    const settings = mergeSettings({
      layoutFolders: ["PARA", "PARA/Resources", "ZK"]
    });

    expect(settings.layoutFolders).toEqual(["PARA", "PARA/Resources", "ZK", "LLM-Wiki"]);
  });

  it("adds a custom wiki folder to old saved layoutFolders arrays", () => {
    const settings = mergeSettings({
      paths: { wikiFolder: "Machine/Wiki" },
      layoutFolders: ["PARA", "ZK"]
    });

    expect(settings.layoutFolders).toEqual(["PARA", "ZK", "Machine/Wiki"]);
  });

  it("preserves a valid editorLineWidth", () => {
    expect(mergeSettings({ editorLineWidth: 1100 }).editorLineWidth).toBe(1100);
  });

  it("falls back for invalid editorLineWidth values", () => {
    for (const editorLineWidth of [NaN, Infinity, "1100", 599, 1601, null]) {
      expect(mergeSettings({ editorLineWidth }).editorLineWidth).toBe(DEFAULT_SETTINGS.editorLineWidth);
    }
  });

  it("defaults editorWidthSliderEnabled when absent", () => {
    expect(mergeSettings({}).editorWidthSliderEnabled).toBe(true);
  });

  it("preserves boolean editorWidthSliderEnabled values", () => {
    expect(mergeSettings({ editorWidthSliderEnabled: true }).editorWidthSliderEnabled).toBe(true);
    expect(mergeSettings({ editorWidthSliderEnabled: false }).editorWidthSliderEnabled).toBe(false);
  });

  it("falls back for non-boolean editorWidthSliderEnabled values", () => {
    for (const editorWidthSliderEnabled of ["false", 0, 1, null, undefined]) {
      expect(mergeSettings({ editorWidthSliderEnabled }).editorWidthSliderEnabled)
        .toBe(DEFAULT_SETTINGS.editorWidthSliderEnabled);
    }
  });

  it("defaults showRibbon to true when absent", () => {
    expect(mergeSettings({}).showRibbon).toBe(true);
  });

  it("preserves boolean showRibbon values", () => {
    expect(mergeSettings({ showRibbon: true }).showRibbon).toBe(true);
    expect(mergeSettings({ showRibbon: false }).showRibbon).toBe(false);
  });

  it("falls back for non-boolean showRibbon values", () => {
    for (const showRibbon of ["false", 0, 1, null, undefined]) {
      expect(mergeSettings({ showRibbon }).showRibbon).toBe(DEFAULT_SETTINGS.showRibbon);
    }
  });
});
