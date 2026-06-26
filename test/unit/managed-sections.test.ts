import { beforeEach, describe, expect, it, vi } from "vitest";
import { MarkdownRenderChild } from "obsidian";
import { DEFAULT_SETTINGS } from "../../src/types";
import type { ParaZkPluginContext } from "../../src/plugin-interface";

const childCounts = vi.hoisted(() => ({
  dataview: 0,
  references: 0,
  tasks: 0,
  unloaded: 0,
  connectedLoads: {
    dataview: [] as boolean[],
    references: [] as boolean[],
    tasks: [] as boolean[]
  }
}));

vi.mock("../../src/ux/blocks/dataview", () => ({
  DataviewViewRenderChild: class {
    readonly containerEl: HTMLElement;

    constructor(
      _plugin: ParaZkPluginContext,
      containerEl: HTMLElement
    ) {
      this.containerEl = containerEl;
      childCounts.dataview += 1;
    }

    load(): void {
      childCounts.connectedLoads.dataview.push(this.containerEl.isConnected);
      this.containerEl.createDiv({ cls: "mock-dataview" });
    }

    unload(): void {
      childCounts.unloaded += 1;
    }
  }
}));

vi.mock("../../src/ux/blocks/references", () => ({
  ReferenceBlockRenderChild: class {
    readonly containerEl: HTMLElement;

    constructor(
      _plugin: ParaZkPluginContext,
      _args: unknown,
      containerEl: HTMLElement
    ) {
      this.containerEl = containerEl;
      childCounts.references += 1;
    }

    load(): void {
      childCounts.connectedLoads.references.push(this.containerEl.isConnected);
      this.containerEl.createDiv({ cls: "mock-references" });
    }

    unload(): void {
      childCounts.unloaded += 1;
    }
  }
}));

vi.mock("../../src/ux/blocks/tasks", () => ({
  TaskBlockRenderChild: class {
    readonly containerEl: HTMLElement;

    constructor(
      _plugin: ParaZkPluginContext,
      _args: unknown,
      containerEl: HTMLElement
    ) {
      this.containerEl = containerEl;
      childCounts.tasks += 1;
    }

    load(): void {
      childCounts.connectedLoads.tasks.push(this.containerEl.isConnected);
      this.containerEl.createDiv({ cls: "mock-tasks" });
    }

    unload(): void {
      childCounts.unloaded += 1;
    }
  }
}));

describe("ManagedPanelController", () => {
  beforeEach(() => {
    childCounts.dataview = 0;
    childCounts.references = 0;
    childCounts.tasks = 0;
    childCounts.unloaded = 0;
    childCounts.connectedLoads.dataview.length = 0;
    childCounts.connectedLoads.references.length = 0;
    childCounts.connectedLoads.tasks.length = 0;
  });

  it("reuses block children when the managed layout is unchanged", async () => {
    const { ManagedPanelController } = await import("../../src/ux/blocks/managed-sections");
    const root = new FakeElement("div");
    fakeDocumentBody.appendChild(root);
    const parent = new MarkdownRenderChild(root.asHtml());
    parent.load();
    const controller = new ManagedPanelController(fakePlugin(), root.asHtml(), parent);

    controller.update("PARA/Resources/Paper.md", "resource");

    const view = root.querySelector(".block-language-para-zk-view");
    const references = root.querySelector(".block-language-para-zk-references");
    expect(view).not.toBeNull();
    expect(references).not.toBeNull();
    expect(childCounts.dataview).toBe(1);
    expect(childCounts.references).toBe(1);
    expect(childCounts.connectedLoads.dataview).toEqual([true]);
    expect(childCounts.connectedLoads.references).toEqual([true]);
    expect(root.replaceChildrenCalls).toBe(0);

    controller.update("PARA/Resources/Paper.md", "resource");

    expect(root.querySelector(".block-language-para-zk-view")).toBe(view);
    expect(root.querySelector(".block-language-para-zk-references")).toBe(references);
    expect(childCounts.dataview).toBe(1);
    expect(childCounts.references).toBe(1);
    expect(childCounts.unloaded).toBe(0);
    expect(root.replaceChildrenCalls).toBe(0);

    controller.dispose();
    expect(childCounts.unloaded).toBe(2);
  });
});

function fakePlugin(): ParaZkPluginContext {
  return {
    app: {
      vault: {
        getFileByPath: () => null
      },
      metadataCache: {
        getFileCache: () => null
      }
    },
    settings: DEFAULT_SETTINGS
  } as unknown as ParaZkPluginContext;
}

type FakeChild = FakeElement | string;

class FakeElement {
  parentElement: FakeElement | null = null;
  replaceChildrenCalls = 0;
  private readonly classes = new Set<string>();
  private children: FakeChild[] = [];

  constructor(
    private readonly tag: string,
    private readonly connectedRoot = false
  ) {}

  get ownerDocument(): typeof fakeDocument {
    return fakeDocument;
  }

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
    this.empty();
    if (value) this.children = [value];
  }

  get isConnected(): boolean {
    return this.connectedRoot || this.parentElement?.isConnected === true;
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

  appendChild(child: FakeElement): FakeElement {
    child.remove();
    child.parentElement = this;
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

  replaceChildren(...children: FakeChild[]): void {
    this.replaceChildrenCalls += 1;
    this.empty();
    this.children = children;
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

const fakeDocumentBody = new FakeElement("body", true);
const fakeDocument = {
  body: fakeDocumentBody.asHtml(),
  createElement: (tag: string) => new FakeElement(tag.toLowerCase()).asHtml()
};
