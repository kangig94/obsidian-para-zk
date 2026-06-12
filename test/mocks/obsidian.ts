// Runtime stub for the `obsidian` module, aliased in vitest.config.ts.
// The real package ships types only (no runtime), so tests need concrete
// values for the symbols src code imports. TFile/TFolder/TAbstractFile and
// parseYaml are implemented faithfully because workflow logic depends on them;
// UI component classes are inert because UI rendering is exercised live in the
// smoke test, not here.
import { parse as parseYamlImpl } from "yaml";

export class TAbstractFile {
  path = "";
  name = "";
  parent: TFolder | null = null;
}

export class TFile extends TAbstractFile {
  basename = "";
  extension = "";
  stat = { ctime: 0, mtime: 0, size: 0 };
}

export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];

  isRoot(): boolean {
    return this.path === "" || this.path === "/";
  }
}

export function parseYaml(value: string): unknown {
  return parseYamlImpl(value);
}

export class App {
  metadataCache = {
    resolvedLinks: {} as Record<string, Record<string, number>>,
    unresolvedLinks: {} as Record<string, Record<string, number>>
  };
}
export class Component {
  private readonly registeredCallbacks: Array<() => void> = [];

  load(): void {
    this.onload();
  }

  onload(): void {}

  unload(): void {
    this.onunload();
    for (const callback of this.registeredCallbacks) callback();
    this.registeredCallbacks.length = 0;
  }

  onunload(): void {}

  addChild<T extends Component>(component: T): T {
    component.load();
    return component;
  }

  removeChild<T extends Component>(component: T): T {
    component.unload();
    return component;
  }

  register(callback: () => void): void {
    this.registeredCallbacks.push(callback);
  }

  registerEvent(eventRef: { detach?: () => void }): void {
    this.register(() => eventRef.detach?.());
  }
}
export class Plugin extends Component {}
export class MarkdownRenderChild extends Component {
  constructor(public containerEl: HTMLElement) {
    super();
  }
}
export class MarkdownView {
  file: TFile | null = null;
  leaf: unknown = null;
  containerEl: HTMLElement = undefined as unknown as HTMLElement;
  editor = {
    getValue: () => "",
    setCursor: (_cursor: { line: number; ch: number }) => {},
    focus: () => {}
  };

  getMode(): string {
    return "preview";
  }

  getState(): Record<string, unknown> {
    return {};
  }

  async setState(_state: Record<string, unknown>, _options?: Record<string, unknown>): Promise<void> {}
}
export class Modal {
  contentEl: HTMLElement = undefined as unknown as HTMLElement;
}
export class PluginSettingTab {}
export class Setting {}

type ElementFactoryOptions = {
  cls?: string;
  text?: string;
  attr?: Record<string, string>;
};

type ObsidianTestElement = HTMLElement & {
  addClass?: (...classes: string[]) => void;
  createEl?: (tag: string, options?: ElementFactoryOptions) => HTMLElement;
  setAttr?: (key: string, value: string) => void;
};

function createChildElement(container: HTMLElement, tag: string): HTMLElement {
  const host = container as ObsidianTestElement;
  if (typeof host.createEl === "function") return host.createEl(tag);

  const documentRef = container.ownerDocument ?? (typeof document === "undefined" ? undefined : document);
  if (!documentRef) throw new Error("No document available for Obsidian test element creation");
  const el = documentRef.createElement(tag);
  container.appendChild(el);
  return el;
}

function addElementClass(el: HTMLElement, ...classes: string[]): void {
  const target = el as ObsidianTestElement;
  if (typeof target.addClass === "function") {
    target.addClass(...classes);
    return;
  }
  el.classList.add(...classes);
}

function setElementAttr(el: HTMLElement, key: string, value: string): void {
  const target = el as ObsidianTestElement;
  if (typeof target.setAttr === "function") {
    target.setAttr(key, value);
    return;
  }
  el.setAttribute(key, value);
}

export class ButtonComponent {
  readonly buttonEl: HTMLButtonElement;

  constructor(container: HTMLElement) {
    this.buttonEl = createChildElement(container, "button") as HTMLButtonElement;
    this.buttonEl.type = "button";
  }

  setIcon(icon: string): this {
    setIcon(this.buttonEl, icon);
    return this;
  }

  setButtonText(text: string): this {
    this.buttonEl.textContent = text;
    return this;
  }

  setTooltip(text: string): this {
    setElementAttr(this.buttonEl, "title", text);
    return this;
  }

  setDisabled(disabled: boolean): this {
    this.buttonEl.disabled = disabled;
    return this;
  }

  setCta(): this {
    addElementClass(this.buttonEl, "mod-cta");
    return this;
  }

  onClick(callback: () => void): this {
    this.buttonEl.addEventListener("click", callback);
    return this;
  }
}

export class DropdownComponent {
  readonly selectEl: HTMLSelectElement;

  constructor(container: HTMLElement) {
    this.selectEl = createChildElement(container, "select") as HTMLSelectElement;
  }

  addOption(value: string, label: string): this {
    const option = createChildElement(this.selectEl, "option") as HTMLOptionElement;
    option.value = value;
    option.textContent = label;
    return this;
  }

  setValue(value: string): this {
    this.selectEl.value = value;
    return this;
  }

  setDisabled(disabled: boolean): this {
    this.selectEl.disabled = disabled;
    return this;
  }

  onChange(callback: (value: string) => void): this {
    this.selectEl.addEventListener("change", () => callback(this.selectEl.value));
    return this;
  }
}

export class TextComponent {
  readonly inputEl: HTMLInputElement;

  constructor(container: HTMLElement) {
    this.inputEl = createChildElement(container, "input") as HTMLInputElement;
  }

  setValue(value: string): this {
    this.inputEl.value = value;
    return this;
  }

  getValue(): string {
    return this.inputEl.value;
  }

  setDisabled(disabled: boolean): this {
    this.inputEl.disabled = disabled;
    return this;
  }
}
export class SuggestModal<T> extends Modal {
  constructor(public app: App) {
    super();
  }

  setPlaceholder(_placeholder: string): void {}
  getSuggestions(_query: string): T[] {
    return [];
  }
  renderSuggestion(_suggestion: T, _el: HTMLElement): void {}
  onChooseSuggestion(_suggestion: T): void {}
  open(): void {}
}
export class EditorSuggest<T> {
  context: unknown = null;
  limit = 100;

  constructor(public app: App) {}

  setInstructions(): void {}
  open(): void {}
  close(): void {}
}

export class Notice {
  constructor(_message?: string | DocumentFragment, _duration?: number) {}
}

export function requestUrl(): never {
  throw new Error("requestUrl is not available in unit tests");
}

export function setIcon(el: HTMLElement, icon: string): void {
  setElementAttr(el, "data-icon", icon);
}

export const editorInfoField = {};
export const editorLivePreviewField = {};
