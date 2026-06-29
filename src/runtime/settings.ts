import type { Plugin } from "obsidian";
import { normalizeLocale } from "../i18n";
import {
  DEFAULT_SETTINGS,
  EDITOR_LINE_WIDTH_MAX,
  EDITOR_LINE_WIDTH_MIN,
  EDITOR_LINE_WIDTH_STEP,
  RETOPOLOGY_CACHE_MAX_MIB_MAX,
  RETOPOLOGY_CACHE_MAX_MIB_MIN,
  type ParaZkSettings
} from "../types";
import { isRecord } from "../records";

export async function loadSettings(plugin: Plugin): Promise<ParaZkSettings> {
  return mergeSettings(await plugin.loadData());
}

export async function saveSettings(plugin: Plugin, settings: ParaZkSettings): Promise<void> {
  await plugin.saveData(settings);
}

export function mergeSettings(loaded: unknown): ParaZkSettings {
  const data = isRecord(loaded) ? loaded : {};
  return {
    ...DEFAULT_SETTINGS,
    locale: normalizeLocale(data.locale, DEFAULT_SETTINGS.locale),
    showRibbon: typeof data.showRibbon === "boolean"
      ? data.showRibbon
      : DEFAULT_SETTINGS.showRibbon,
    showEmptyTrashAction: typeof data.showEmptyTrashAction === "boolean"
      ? data.showEmptyTrashAction
      : DEFAULT_SETTINGS.showEmptyTrashAction,
    editorWidthSliderEnabled: typeof data.editorWidthSliderEnabled === "boolean"
      ? data.editorWidthSliderEnabled
      : DEFAULT_SETTINGS.editorWidthSliderEnabled,
    rememberCursorPosition: typeof data.rememberCursorPosition === "boolean"
      ? data.rememberCursorPosition
      : DEFAULT_SETTINGS.rememberCursorPosition,
    editorLineWidth: readEditorLineWidth(data.editorLineWidth),
    retopologyCacheMaxMiB: readRetopologyCacheMaxMiB(data.retopologyCacheMaxMiB)
  };
}

function readEditorLineWidth(value: unknown): number {
  if (
    typeof value !== "number"
    || !Number.isFinite(value)
    || value < EDITOR_LINE_WIDTH_MIN
    || value > EDITOR_LINE_WIDTH_MAX
  ) {
    return DEFAULT_SETTINGS.editorLineWidth;
  }
  return Math.round(value / EDITOR_LINE_WIDTH_STEP) * EDITOR_LINE_WIDTH_STEP;
}

function readRetopologyCacheMaxMiB(value: unknown): number {
  if (
    typeof value !== "number"
    || !Number.isFinite(value)
    || value < RETOPOLOGY_CACHE_MAX_MIB_MIN
    || value > RETOPOLOGY_CACHE_MAX_MIB_MAX
  ) {
    return DEFAULT_SETTINGS.retopologyCacheMaxMiB;
  }
  return Math.round(value);
}
