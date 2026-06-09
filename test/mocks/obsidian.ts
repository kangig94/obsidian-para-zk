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

export class App {}
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
export class Modal {}
export class PluginSettingTab {}
export class Setting {}
export class ButtonComponent {}
export class DropdownComponent {}
export class TextComponent {}
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

export function setIcon(): void {}

export const editorInfoField = {};
export const editorLivePreviewField = {};
