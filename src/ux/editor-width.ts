import type { ParaZkPluginContext } from "../plugin-interface";
import { EDITOR_LINE_WIDTH_MAX, EDITOR_LINE_WIDTH_MIN, EDITOR_LINE_WIDTH_STEP } from "../types";

const WIDTH_VALUE_VAR = "--para-zk-editor-width";
const WIDTH_ACTIVE_CLASS = "para-zk-width-active";
const WIDTH_SLIDER_CLASS = "para-zk-width-slider";
const SAVE_DEBOUNCE_MS = 300;
const saveTimers = new WeakMap<ParaZkPluginContext, number>();

export function registerEditorWidthControl(plugin: ParaZkPluginContext): void {
  renderEditorWidthControl(plugin);

  plugin.register(() => {
    flushPendingSave(plugin);
    clearEditorWidth();
  });
}

// Re-applies the editor-width control to the current setting; called by the settings toggle.
export function refreshEditorWidthControl(plugin: ParaZkPluginContext): void {
  renderEditorWidthControl(plugin);
}

function renderEditorWidthControl(plugin: ParaZkPluginContext): void {
  removeEditorWidthControls();

  if (!plugin.settings.editorWidthSliderEnabled) {
    clearEditorWidth();
    return;
  }

  applyEditorWidth(plugin.settings.editorLineWidth);

  const item = plugin.addStatusBarItem();
  item.classList.add(WIDTH_SLIDER_CLASS);

  const slider = item.createEl("input", {
    type: "range",
    value: String(plugin.settings.editorLineWidth),
    cls: "para-zk-width-slider__input",
    attr: {
      min: String(EDITOR_LINE_WIDTH_MIN),
      max: String(EDITOR_LINE_WIDTH_MAX),
      step: String(EDITOR_LINE_WIDTH_STEP),
      "aria-label": "Editor line width"
    }
  });
  slider.title = "Editor line width";

  const label = item.createSpan({ cls: "para-zk-width-slider__label" });
  setLabel(label, plugin.settings.editorLineWidth);

  plugin.registerDomEvent(slider, "input", () => {
    const value = readSliderValue(slider, plugin.settings.editorLineWidth);
    plugin.settings.editorLineWidth = value;
    applyEditorWidth(value);
    setLabel(label, value);
    scheduleSave(plugin);
  });
}

function applyEditorWidth(px: number): void {
  activeDocument.body.classList.add(WIDTH_ACTIVE_CLASS);
  activeDocument.body.style.setProperty(WIDTH_VALUE_VAR, `${px}px`);
}

function clearEditorWidth(): void {
  activeDocument.body.classList.remove(WIDTH_ACTIVE_CLASS);
  activeDocument.body.style.removeProperty(WIDTH_VALUE_VAR);
}

function removeEditorWidthControls(): void {
  for (const item of activeDocument.querySelectorAll(`.${WIDTH_SLIDER_CLASS}`)) {
    item.remove();
  }
}

function saveCurrentWidth(plugin: ParaZkPluginContext): void {
  void plugin.saveSettings().catch((error) => {
    console.error("PARA-ZK: failed to save editor width setting", error);
  });
}

function scheduleSave(plugin: ParaZkPluginContext): void {
  const saveTimer = saveTimers.get(plugin);
  if (saveTimer !== undefined) window.clearTimeout(saveTimer);
  saveTimers.set(plugin, window.setTimeout(() => {
    saveTimers.delete(plugin);
    saveCurrentWidth(plugin);
  }, SAVE_DEBOUNCE_MS));
}

function flushPendingSave(plugin: ParaZkPluginContext): void {
  const saveTimer = saveTimers.get(plugin);
  if (saveTimer === undefined) return;
  window.clearTimeout(saveTimer);
  saveTimers.delete(plugin);
  saveCurrentWidth(plugin);
}

function readSliderValue(slider: HTMLInputElement, fallback: number): number {
  const value = Number(slider.value);
  return Number.isFinite(value) ? value : fallback;
}

function setLabel(label: HTMLElement, value: number): void {
  label.textContent = `${value}px`;
}
