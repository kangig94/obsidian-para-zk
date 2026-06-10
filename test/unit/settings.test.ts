import { describe, expect, it } from "vitest";
import { mergeSettings } from "../../src/runtime/settings";
import { DEFAULT_SETTINGS } from "../../src/types";

describe("mergeSettings", () => {
  it("defaults editorLineWidth when absent", () => {
    expect(mergeSettings({}).editorLineWidth).toBe(DEFAULT_SETTINGS.editorLineWidth);
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
