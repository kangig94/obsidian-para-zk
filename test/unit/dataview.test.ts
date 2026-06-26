import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarkdownRenderer } from "obsidian";
import { DEFAULT_SETTINGS } from "../../src/types";
import type { ParaZkPluginContext } from "../../src/plugin-interface";
import { DataviewViewRenderChild } from "../../src/ux/blocks/dataview";

describe("DataviewViewRenderChild", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("rerenders when Obsidian finishes resolving metadata", async () => {
    const metadata = createEventBus();
    const plugin = fakeDataviewPlugin(metadata);
    const root = new FakeElement("div");
    const render = vi.spyOn(MarkdownRenderer, "render")
      .mockImplementation(async (_app, _markdown, el) => {
        renderSettledDataview(el);
      });
    const child = new DataviewViewRenderChild(plugin, root.asHtml(), {
      key: "cited-by",
      title: "Cited by"
    }, "PARA/Resources/Paper.md");

    child.load();
    await flushPromises();
    expect(render).toHaveBeenCalledTimes(1);

    metadata.emit("resolve");
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    expect(render).toHaveBeenCalledTimes(2);
    child.unload();
  });

  it("retries the initial render after the reading view opens", async () => {
    const plugin = fakeDataviewPlugin(createEventBus());
    const root = new FakeElement("div");
    const render = vi.spyOn(MarkdownRenderer, "render")
      .mockImplementation(async (_app, _markdown, el) => {
        renderSettledDataview(el);
      });
    const child = new DataviewViewRenderChild(plugin, root.asHtml(), {
      key: "cited-by",
      title: "Cited by"
    }, "PARA/Resources/Paper.md");

    child.load();
    await flushPromises();
    expect(render).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1199);
    await flushPromises();
    expect(render).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();
    expect(render).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(2300);
    await flushPromises();
    expect(render).toHaveBeenCalledTimes(3);
    child.unload();
  });
});

type EventName = "changed" | "resolve" | "resolved";
type Listener = () => void;

function createEventBus(): {
  on: (name: EventName, listener: Listener) => { detach: () => void };
  emit: (name: EventName) => void;
} {
  const listeners = new Map<EventName, Listener[]>();
  return {
    on: (name, listener) => {
      const current = listeners.get(name) ?? [];
      current.push(listener);
      listeners.set(name, current);
      return {
        detach: () => {
          const next = (listeners.get(name) ?? []).filter((candidate) => candidate !== listener);
          listeners.set(name, next);
        }
      };
    },
    emit: (name) => {
      for (const listener of listeners.get(name) ?? []) listener();
    }
  };
}

function fakeDataviewPlugin(metadata: ReturnType<typeof createEventBus>): ParaZkPluginContext {
  return {
    app: {
      vault: {
        on: () => ({ detach: () => {} })
      },
      metadataCache: {
        on: metadata.on
      }
    },
    settings: DEFAULT_SETTINGS
  } as unknown as ParaZkPluginContext;
}

function renderSettledDataview(el: HTMLElement): void {
  const body = el as unknown as FakeElement;
  const dataview = body.createDiv({ cls: "block-language-dataview" });
  const table = dataview.createEl("table");
  const row = table.createEl("tr");
  row.createEl("th", { text: "Filename" });
  row.createEl("th", { text: "Type" });
  row.createEl("th", { text: "Updated" });
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

type FakeChild = FakeElement | string;

class FakeElement {
  readonly ownerDocument = fakeDocument;
  parentElement: FakeElement | null = null;
  private readonly classes = new Set<string>();
  private readonly attributes = new Map<string, string>();
  private children: FakeChild[] = [];

  constructor(private readonly tag: string) {}

  get childNodes(): FakeChild[] {
    return this.children;
  }

  get classList(): string[] {
    return [...this.classes];
  }

  get textContent(): string {
    return this.children.map((child) => typeof child === "string" ? child : child.textContent).join("");
  }

  set textContent(value: string) {
    this.children = [value];
  }

  createDiv(options?: { cls?: string; text?: string }): FakeElement {
    return this.createEl("div", options);
  }

  createEl(tag: string, options?: { cls?: string; text?: string }): FakeElement {
    const child = new FakeElement(tag.toLowerCase());
    child.parentElement = this;
    if (options?.cls) child.addClass(...options.cls.split(/\s+/).filter(Boolean));
    if (options?.text !== undefined) child.textContent = options.text;
    this.children.push(child);
    return child;
  }

  empty(): void {
    for (const child of this.children) {
      if (typeof child !== "string") child.parentElement = null;
    }
    this.children = [];
  }

  addClass(...classes: string[]): void {
    for (const className of classes) this.classes.add(className);
  }

  removeClass(...classes: string[]): void {
    for (const className of classes) this.classes.delete(className);
  }

  setCssProps(_props: Record<string, string>): void {}

  setAttribute(key: string, value: string): void {
    this.attributes.set(key, value);
  }

  getBoundingClientRect(): { width: number; height: number } {
    return { width: 320, height: 0 };
  }

  after(next: FakeElement): void {
    if (!this.parentElement) return;
    const index = this.parentElement.children.indexOf(this);
    if (index === -1) return;
    next.parentElement = this.parentElement;
    this.parentElement.children.splice(index + 1, 0, next);
  }

  replaceChildren(...nextChildren: FakeChild[]): void {
    this.empty();
    this.children = nextChildren;
    for (const child of this.children) {
      if (typeof child !== "string") child.parentElement = this;
    }
  }

  remove(): void {
    if (!this.parentElement) return;
    const index = this.parentElement.children.indexOf(this);
    if (index !== -1) this.parentElement.children.splice(index, 1);
    this.parentElement = null;
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    const matches: FakeElement[] = [];
    for (const child of this.children) {
      if (typeof child === "string") continue;
      if (child.matches(selector)) matches.push(child);
      matches.push(...child.querySelectorAll(selector));
    }
    return matches;
  }

  cloneNode(deep?: boolean): FakeElement {
    const clone = new FakeElement(this.tag);
    clone.addClass(...this.classList);
    clone.textContent = deep
      ? this.children.map((child) => typeof child === "string" ? child : child.cloneNode(true).textContent).join("")
      : "";
    return clone;
  }

  asHtml(): HTMLElement {
    return this as unknown as HTMLElement;
  }

  private matches(selector: string): boolean {
    if (selector.startsWith(".")) {
      return selector.slice(1).split(".").every((className) => this.classes.has(className));
    }
    return this.tag === selector.toLowerCase();
  }
}

const fakeDocument = {
  createElement: (tag: string) => new FakeElement(tag.toLowerCase()).asHtml()
};
