import { describe, expect, it } from "vitest";
import type { Plugin } from "obsidian";
import { loadSettings, mergeSettings } from "../../src/runtime/settings";
import { DEFAULT_SETTINGS } from "../../src/types";

describe("mergeSettings", () => {
  it("loads old data.json while ignoring removed path settings", async () => {
    const plugin = {
      loadData: async () => ({
        paths: {
          resourcesFolder: "Library"
        },
        layoutFolders: ["Custom"],
        setupAt: "2026-01-01T00:00:00.000Z",
        managedFiles: {
          "Templates/para-zk/template_project.md": {
            hash: "abc",
            updatedAt: "2026-01-01T00:00:00.000Z"
          }
        },
        locale: "ko"
      })
    } as unknown as Plugin;

    const settings = await loadSettings(plugin);

    expect(settings.locale).toBe("ko");
    expect("paths" in settings).toBe(false);
    expect("layoutFolders" in settings).toBe(false);
    expect("setupAt" in settings).toBe(false);
    expect("managedFiles" in settings).toBe(false);
    expect(settings).toEqual({ ...DEFAULT_SETTINGS, locale: "ko" });
  });

  it("defaults editorLineWidth when absent", () => {
    expect(mergeSettings({}).editorLineWidth).toBe(DEFAULT_SETTINGS.editorLineWidth);
  });

  it("returns only runtime-mutable settings and ignores unknown keys", () => {
    const settings = mergeSettings({
      paths: { resourcesFolder: "Library", wikiFolder: "Generated/Wiki" },
      layoutFolders: ["PARA", "PARA/Resources", "ZK"],
      managedFiles: { "README.md": { hash: "abc", updatedAt: "2026-01-01T00:00:00.000Z" } },
      setupAt: "2026-01-01T00:00:00.000Z",
      extra: true,
      locale: "en",
      showRibbon: false,
      showEmptyTrashAction: false,
      editorWidthSliderEnabled: false,
      editorLineWidth: 1100
    });

    expect(settings).toEqual({
      locale: "en",
      showRibbon: false,
      showEmptyTrashAction: false,
      editorWidthSliderEnabled: false,
      editorLineWidth: 1100
    });
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

  it("defaults showEmptyTrashAction to true when absent", () => {
    expect(mergeSettings({}).showEmptyTrashAction).toBe(true);
  });

  it("preserves boolean showEmptyTrashAction values", () => {
    expect(mergeSettings({ showEmptyTrashAction: true }).showEmptyTrashAction).toBe(true);
    expect(mergeSettings({ showEmptyTrashAction: false }).showEmptyTrashAction).toBe(false);
  });

  it("falls back for non-boolean showEmptyTrashAction values", () => {
    for (const showEmptyTrashAction of ["false", 0, 1, null, undefined]) {
      expect(mergeSettings({ showEmptyTrashAction }).showEmptyTrashAction).toBe(DEFAULT_SETTINGS.showEmptyTrashAction);
    }
  });

  it("returns defaults when loadData returns null (first install)", async () => {
    const settings = await loadSettings({ loadData: async () => null } as unknown as Plugin);
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });
});
