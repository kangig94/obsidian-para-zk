import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParaZkPluginContext } from "../../src/plugin-interface";
import { DEFAULT_SETTINGS } from "../../src/types";
import { refreshEditorWidthControl, registerEditorWidthControl } from "../../src/ux/editor-width";

describe("editor width status control", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("preserves control order and attributes, saves input, and replaces or removes stale controls", async () => {
    const body = new FakeElement("body");
    const listeners = new Map<FakeElement, () => void>();
    const cleanups: Array<() => void> = [];
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    const plugin = {
      settings: structuredClone(DEFAULT_SETTINGS),
      addStatusBarItem: () => body.createDiv().asHtml(),
      register: (callback: () => void) => cleanups.push(callback),
      registerDomEvent: (element: HTMLElement, type: string, callback: () => void) => {
        expect(type).toBe("input");
        listeners.set(element as unknown as FakeElement, callback);
      },
      saveSettings
    } as unknown as ParaZkPluginContext;
    vi.stubGlobal("activeDocument", {
      body: body.asHtml(),
      querySelectorAll: (selector: string) => body.querySelectorAll(selector).map((element) => element.asHtml())
    });

    registerEditorWidthControl(plugin);

    const firstItem = body.querySelectorAll(".para-zk-width-slider")[0];
    expect(firstItem?.elementChildren().map((child) => child.tagName)).toEqual(["input", "span"]);
    const slider = firstItem?.elementChildren()[0];
    const label = firstItem?.elementChildren()[1];
    expect(slider?.value).toBe("700");
    expect(slider?.attrs).toMatchObject({
      type: "range",
      min: "600",
      max: "1600",
      step: "20",
      "aria-label": "Editor line width"
    });
    expect(label?.textContent).toBe("700px");

    if (!slider) throw new Error("missing editor-width slider");
    slider.value = "920";
    listeners.get(slider)?.();
    expect(plugin.settings.editorLineWidth).toBe(920);
    expect(label?.textContent).toBe("920px");
    expect(body.style.values.get("--para-zk-editor-width")).toBe("920px");
    await vi.advanceTimersByTimeAsync(300);
    expect(saveSettings).toHaveBeenCalledTimes(1);

    refreshEditorWidthControl(plugin);
    expect(body.querySelectorAll(".para-zk-width-slider")).toHaveLength(1);
    expect(body.querySelectorAll(".para-zk-width-slider")[0]).not.toBe(firstItem);

    plugin.settings.editorWidthSliderEnabled = false;
    refreshEditorWidthControl(plugin);
    expect(body.querySelectorAll(".para-zk-width-slider")).toHaveLength(0);
    expect(body.classes.has("para-zk-width-active")).toBe(false);
    expect(body.style.values.has("--para-zk-editor-width")).toBe(false);

    for (const cleanup of cleanups) cleanup();
  });
});

class FakeElement {
  readonly classes = new Set<string>();
  readonly attrs: Record<string, string> = {};
  readonly style = {
    values: new Map<string, string>(),
    setProperty: (key: string, value: string) => this.style.values.set(key, value),
    removeProperty: (key: string) => {
      this.style.values.delete(key);
      return "";
    }
  };
  readonly classList = {
    add: (...classes: string[]) => this.addClass(...classes),
    remove: (...classes: string[]) => {
      for (const className of classes) this.classes.delete(className);
    }
  };
  parentElement: FakeElement | undefined;
  value = "";
  title = "";
  private children: FakeElement[] = [];
  private text = "";

  constructor(readonly tagName: string) {}

  get textContent(): string {
    return this.text;
  }

  set textContent(value: string) {
    this.text = value;
  }

  createDiv(options?: ElementOptions): FakeElement {
    return this.createEl("div", options);
  }

  createSpan(options?: ElementOptions): FakeElement {
    return this.createEl("span", options);
  }

  createEl(tag: string, options: ElementOptions = {}): FakeElement {
    const child = new FakeElement(tag);
    child.parentElement = this;
    if (options.cls) child.addClass(...options.cls.split(/\s+/).filter(Boolean));
    if (options.value !== undefined) child.value = options.value;
    if (options.type !== undefined) child.attrs.type = options.type;
    Object.assign(child.attrs, options.attr);
    this.children.push(child);
    return child;
  }

  elementChildren(): FakeElement[] {
    return [...this.children];
  }

  addClass(...classes: string[]): void {
    for (const className of classes) this.classes.add(className);
  }

  remove(): void {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = undefined;
  }

  querySelectorAll(selector: string): FakeElement[] {
    const className = selector.startsWith(".") ? selector.slice(1) : undefined;
    const result: FakeElement[] = [];
    for (const child of this.children) {
      if (className && child.classes.has(className)) result.push(child);
      result.push(...child.querySelectorAll(selector));
    }
    return result;
  }

  asHtml(): HTMLElement {
    return this as unknown as HTMLElement;
  }
}

type ElementOptions = {
  cls?: string;
  type?: string;
  value?: string;
  attr?: Record<string, string>;
};
