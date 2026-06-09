import { describe, expect, it } from "vitest";
import type { ParaZkPluginContext } from "../../src/plugin-interface";
import { DEFAULT_SETTINGS } from "../../src/types";
import { registerPropsControlRenderers } from "../../src/ux/props-controls";
import { MockApp } from "../harness/vault";

type CodeBlockProcessor = (
  source: string,
  el: HTMLElement,
  ctx: { sourcePath: string; addChild: <T extends { load: () => void }>(child: T) => T }
) => void;

type FakeEvent = {
  type: string;
  key?: string;
  preventDefault?: () => void;
};

describe("props url control", () => {
  it("renders a valid https URL as a clickable link with an edit button", async () => {
    const url = "https://example.com/paper?x=1";
    const { control } = await renderResourceProps(url);

    const link = control.querySelector("a.para-zk-block__url-link");
    expect(link?.textContent).toBe(url);
    expect(link?.getAttribute("href")).toBe(url);
    expect(link?.getAttribute("rel")).toBe("noopener");
    expect(control.querySelector("input.para-zk-block__input")).toBeNull();

    const edit = control.querySelector("button.para-zk-block__url-edit");
    expect(edit?.getAttribute("aria-label")).toBe("Edit URL");
    expect(edit?.getAttribute("data-icon")).toBe("pencil");
  });

  it.each(["", "ftp://example.com/source"])("renders %j as the editable text input branch", async (url) => {
    const { control } = await renderResourceProps(url);

    expect(control.querySelector("a.para-zk-block__url-link")).toBeNull();
    const input = control.querySelector("input.para-zk-block__input") as FakeElement | null;
    expect(input).not.toBeNull();
    expect(input?.value).toBe(url);
  });

  it("swaps the valid URL link to an input and commits edits on blur", async () => {
    const oldUrl = "https://example.com/old";
    const newUrl = "https://example.com/new";
    const { app, control, file } = await renderResourceProps(oldUrl);

    const edit = control.querySelector("button.para-zk-block__url-edit") as FakeElement;
    edit.dispatchEvent({ type: "click" });

    expect(control.querySelector("a.para-zk-block__url-link")).toBeNull();
    const input = control.querySelector("input.para-zk-block__input") as FakeElement | null;
    expect(input?.value).toBe(oldUrl);

    input!.value = newUrl;
    input!.dispatchEvent({ type: "blur" });
    await nextMicrotask();

    expect(app.metadataCache.getFileCache(file)?.frontmatter?.url).toBe(newUrl);
  });

  it("commits a URL typed into the empty input on blur", async () => {
    const newUrl = "https://example.com/added";
    const { app, control, file } = await renderResourceProps("");

    const input = control.querySelector("input.para-zk-block__input") as FakeElement;
    input.value = newUrl;
    input.dispatchEvent({ type: "blur" });
    await nextMicrotask();

    expect(app.metadataCache.getFileCache(file)?.frontmatter?.url).toBe(newUrl);
  });

  it("reverts to the link when an edit is blurred without changes", async () => {
    const url = "https://example.com/keep";
    const { root, control } = await renderResourceProps(url);

    (control.querySelector("button.para-zk-block__url-edit") as FakeElement).dispatchEvent({ type: "click" });
    const input = control.querySelector("input.para-zk-block__input") as FakeElement;
    expect(input).not.toBeNull();

    input.dispatchEvent({ type: "blur" });

    // The grid re-rendered: the URL field is the link again, not a stranded input.
    const after = propsFieldControl(root, "URL");
    expect(after.querySelector("a.para-zk-block__url-link")?.getAttribute("href")).toBe(url);
    expect(after.querySelector("input.para-zk-block__input")).toBeNull();
  });

  it("confirms an edit with Enter (blurs to commit)", async () => {
    const newUrl = "https://example.com/enter";
    const { app, control, file } = await renderResourceProps("https://example.com/old");

    (control.querySelector("button.para-zk-block__url-edit") as FakeElement).dispatchEvent({ type: "click" });
    const input = control.querySelector("input.para-zk-block__input") as FakeElement;
    input.value = newUrl;
    input.dispatchEvent({ type: "keydown", key: "Enter" });
    await nextMicrotask();

    expect(app.metadataCache.getFileCache(file)?.frontmatter?.url).toBe(newUrl);
  });

  it("discards an edit with Escape and keeps the stored URL", async () => {
    const url = "https://example.com/keep";
    const { app, root, control, file } = await renderResourceProps(url);

    (control.querySelector("button.para-zk-block__url-edit") as FakeElement).dispatchEvent({ type: "click" });
    const input = control.querySelector("input.para-zk-block__input") as FakeElement;
    input.value = "https://example.com/typed-but-discarded";
    input.dispatchEvent({ type: "keydown", key: "Escape" });

    expect(propsFieldControl(root, "URL").querySelector("a.para-zk-block__url-link")?.getAttribute("href")).toBe(url);

    // A blur after Escape already settled the field — it must not write the discarded value.
    input.dispatchEvent({ type: "blur" });
    await nextMicrotask();
    expect(app.metadataCache.getFileCache(file)?.frontmatter?.url).toBe(url);
  });

  it("commits only once when blur fires twice (settled guard)", async () => {
    const newUrl = "https://example.com/once";
    const { app, control, file } = await renderResourceProps("https://example.com/old");

    (control.querySelector("button.para-zk-block__url-edit") as FakeElement).dispatchEvent({ type: "click" });
    const input = control.querySelector("input.para-zk-block__input") as FakeElement;
    input.value = newUrl;
    input.dispatchEvent({ type: "blur" });
    await nextMicrotask();

    // A second blur (e.g. the re-render detaching the focused input) must not re-write.
    input.value = "https://example.com/second-write";
    input.dispatchEvent({ type: "blur" });
    await nextMicrotask();

    expect(app.metadataCache.getFileCache(file)?.frontmatter?.url).toBe(newUrl);
  });

  it("clears a stored URL to empty on blur", async () => {
    const { app, control, file } = await renderResourceProps("https://example.com/remove");

    (control.querySelector("button.para-zk-block__url-edit") as FakeElement).dispatchEvent({ type: "click" });
    const input = control.querySelector("input.para-zk-block__input") as FakeElement;
    input.value = "";
    input.dispatchEvent({ type: "blur" });
    await nextMicrotask();

    expect(app.metadataCache.getFileCache(file)?.frontmatter?.url).toBe("");
  });
});

async function renderResourceProps(url: string): Promise<{
  app: MockApp;
  root: FakeElement;
  control: FakeElement;
  file: Awaited<ReturnType<MockApp["vault"]["create"]>>;
}> {
  const app = new MockApp();
  const file = await app.vault.create("PARA/Resources/Doc.md", [
    "---",
    "type: resource",
    `url: ${url}`,
    "---",
    ""
  ].join("\n"));
  const processors = new Map<string, CodeBlockProcessor>();

  Object.assign(app.vault, {
    on: () => ({ detach: () => {} })
  });
  Object.assign(app.metadataCache, {
    on: () => ({ detach: () => {} })
  });

  const plugin = {
    app,
    settings: DEFAULT_SETTINGS,
    registerMarkdownCodeBlockProcessor: (language: string, processor: CodeBlockProcessor) => {
      processors.set(language, processor);
      return processor;
    },
    registerMarkdownPostProcessor: () => {}
  } as unknown as ParaZkPluginContext;

  registerPropsControlRenderers(plugin);
  const processor = processors.get("para-zk-props");
  if (!processor) throw new Error("props code block processor was not registered");

  const root = new FakeElement("div");
  processor("type: resource", root.asHtml(), {
    sourcePath: file.path,
    addChild: (child) => {
      child.load();
      return child;
    }
  });

  return { app, root, control: propsFieldControl(root, "URL"), file };
}

function propsFieldControl(root: FakeElement, label: string): FakeElement {
  const field = root
    .querySelectorAll(".para-zk-block__field")
    .find((candidate) => candidate.querySelector(".para-zk-block__label")?.textContent === label);
  const control = field?.querySelector(".para-zk-block__control");
  if (!control) throw new Error(`field not found: ${label}`);
  return control;
}

function nextMicrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

class FakeElement {
  readonly ownerDocument = fakeDocument;
  readonly isConnected = true;
  parentElement: FakeElement | null = null;
  value = "";
  type = "";
  disabled = false;
  private readonly classes = new Set<string>();
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Array<(event: FakeEvent) => void>>();
  private children: Array<FakeElement | string> = [];

  constructor(private readonly tag: string) {}

  get classList(): string[] {
    return [...this.classes];
  }

  get className(): string {
    return [...this.classes].join(" ");
  }

  set className(value: string) {
    this.classes.clear();
    for (const token of value.split(/\s+/).filter(Boolean)) this.classes.add(token);
  }

  get textContent(): string {
    return this.children.map((child) => typeof child === "string" ? child : child.textContent).join("");
  }

  set textContent(value: string) {
    this.children = [value];
  }

  createDiv(options?: { cls?: string; text?: string; attr?: Record<string, string> }): FakeElement {
    return this.createEl("div", options);
  }

  createEl(tag: string, options?: { cls?: string; text?: string; attr?: Record<string, string> }): FakeElement {
    const child = new FakeElement(tag.toLowerCase());
    child.parentElement = this;
    if (options?.cls) child.addClass(...options.cls.split(/\s+/).filter(Boolean));
    if (options?.text !== undefined) child.textContent = options.text;
    for (const [key, value] of Object.entries(options?.attr ?? {})) child.setAttr(key, value);
    this.children.push(child);
    return child;
  }

  empty(): void {
    this.children = [];
  }

  addClass(...classes: string[]): void {
    for (const cls of classes) this.classes.add(cls);
  }

  removeClass(...classes: string[]): void {
    for (const cls of classes) this.classes.delete(cls);
  }

  setAttr(key: string, value: string): void {
    this.attributes.set(key, value);
  }

  setAttribute(key: string, value: string): void {
    this.setAttr(key, value);
  }

  getAttribute(key: string): string | null {
    return this.attributes.get(key) ?? null;
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

  addEventListener(type: string, listener: (event: FakeEvent) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event: FakeEvent): boolean {
    const normalized = {
      preventDefault: () => {},
      ...event
    };
    for (const listener of this.listeners.get(event.type) ?? []) listener(normalized);
    return true;
  }

  focus(): void {}
  select(): void {}
  blur(): void {
    this.dispatchEvent({ type: "blur" });
  }

  asHtml(): HTMLElement {
    return this as unknown as HTMLElement;
  }

  private matches(selector: string): boolean {
    const match = selector.match(/^(?:(\w+))?(?:\.([A-Za-z0-9_-]+))?$/);
    if (!match) return false;
    const [, tag, cls] = match;
    return (!tag || this.tag === tag.toLowerCase()) && (!cls || this.classes.has(cls));
  }
}

const fakeDocument = {
  createElement: (tag: string) => new FakeElement(tag.toLowerCase()).asHtml()
};
