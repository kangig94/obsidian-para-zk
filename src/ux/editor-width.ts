import type { ParaZkPluginContext } from "../plugin-interface";
import { EDITOR_LINE_WIDTH_MAX, EDITOR_LINE_WIDTH_MIN, EDITOR_LINE_WIDTH_STEP } from "../types";

const FILE_LINE_WIDTH_VAR = "--file-line-width";
const WIDTH_SLIDER_CLASS = "para-zk-width-slider";
const SAVE_DEBOUNCE_MS = 300;
const saveTimers = new WeakMap<ParaZkPluginContext, number>();

export function registerEditorWidthControl(plugin: ParaZkPluginContext): void {
  renderEditorWidthControl(plugin);

  plugin.register(() => {
    flushPendingSave(plugin);
    document.body.style.removeProperty(FILE_LINE_WIDTH_VAR);
  });
}

// Re-applies the editor-width control to the current setting; called by the settings toggle.
export function refreshEditorWidthControl(plugin: ParaZkPluginContext): void {
  renderEditorWidthControl(plugin);
}

function renderEditorWidthControl(plugin: ParaZkPluginContext): void {
  removeEditorWidthControls();

  if (!plugin.settings.editorWidthSliderEnabled) {
    document.body.style.removeProperty(FILE_LINE_WIDTH_VAR);
    return;
  }

  applyEditorWidth(plugin.settings.editorLineWidth);

  const item = plugin.addStatusBarItem();
  item.classList.add(WIDTH_SLIDER_CLASS);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = String(EDITOR_LINE_WIDTH_MIN);
  slider.max = String(EDITOR_LINE_WIDTH_MAX);
  slider.step = String(EDITOR_LINE_WIDTH_STEP);
  slider.value = String(plugin.settings.editorLineWidth);
  slider.classList.add("para-zk-width-slider__input");
  slider.setAttribute("aria-label", "Editor line width");
  slider.title = "Editor line width";

  const label = document.createElement("span");
  label.classList.add("para-zk-width-slider__label");
  setLabel(label, plugin.settings.editorLineWidth);

  item.append(slider, label);

  plugin.registerDomEvent(slider, "input", () => {
    const value = readSliderValue(slider, plugin.settings.editorLineWidth);
    plugin.settings.editorLineWidth = value;
    applyEditorWidth(value);
    setLabel(label, value);
    scheduleSave(plugin);
  });
}

function applyEditorWidth(px: number): void {
  document.body.style.setProperty(FILE_LINE_WIDTH_VAR, `${px}px`);
}

function removeEditorWidthControls(): void {
  for (const item of document.querySelectorAll(`.${WIDTH_SLIDER_CLASS}`)) {
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
