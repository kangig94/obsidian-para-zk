import { describe, expect, it, vi } from "vitest";
import type { ParaZkPluginContext } from "../../src/plugin-interface";
import { DEFAULT_SETTINGS } from "../../src/types";
import { renderPropsPanel, writeFrontmatterValue } from "../../src/ux/props-controls";
import { MockApp } from "../harness/vault";

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
    await waitForFrontmatterValue(app, file, "url", newUrl);

    expect(app.metadataCache.getFileCache(file)?.frontmatter?.url).toBe(newUrl);
  });

  it("commits a URL typed into the empty input on blur", async () => {
    const newUrl = "https://example.com/added";
    const { app, control, file } = await renderResourceProps("");

    const input = control.querySelector("input.para-zk-block__input") as FakeElement;
    input.value = newUrl;
    input.dispatchEvent({ type: "blur" });
    await waitForFrontmatterValue(app, file, "url", newUrl);

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
    await waitForFrontmatterValue(app, file, "url", newUrl);

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
    await waitForFrontmatterValue(app, file, "url", newUrl);

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
    await waitForFrontmatterValue(app, file, "url", "");

    expect(app.metadataCache.getFileCache(file)?.frontmatter?.url).toBe("");
  });
});

describe("props timestamp display controls", () => {
  it("renders created as a read-only absolute timestamp (T stripped), not an editable input", async () => {
    const { root } = await renderPropsBlock("resource", "PARA/Resources/Doc.md", [
      "---",
      "type: resource",
      "created: 2026-06-10T08:30",
      "updated: 2020-01-01 09:45",
      "url: https://example.com/source",
      "---",
      ""
    ].join("\n"));

    const created = propsFieldControl(root, "Created");
    expect(created.textContent).toBe("2026-06-10 08:30");
    expect(created.querySelector("input.para-zk-block__input")).toBeNull();

    // updated older than the 30-day horizon falls back to the same absolute format
    const updated = propsFieldControl(root, "Updated");
    expect(updated.textContent).toBe("2020-01-01 09:45");
    expect(updated.querySelector("input.para-zk-block__input")).toBeNull();
  });

  it("renders a recent updated as relative text with the absolute value on hover", async () => {
    // Pin the clock so the relative phrase is exact, not minute-boundary dependent.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 14, 12, 30));
    try {
      const { root } = await renderPropsBlock("resource", "PARA/Resources/Recent.md", [
        "---",
        "type: resource",
        "created: 2026-06-10T08:30",
        "updated: 2026-06-14 10:00", // 2h30m before the pinned now
        "---",
        ""
      ].join("\n"));

      const updated = propsFieldControl(root, "Updated");
      const span = updated.querySelector(".para-zk-block__timestamp") as FakeElement;
      expect(span.textContent).toBe("2h 30m ago"); // en locale relative phrase
      expect(span.getAttribute("title")).toBe("2026-06-14 10:00"); // hover reveals the absolute time
      expect(updated.querySelector("input.para-zk-block__input")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders llm-wiki authorship as readonly display values", async () => {
    const { root } = await renderPropsBlock("llm-wiki", "LLM-Wiki/AI/Policy.md", [
      "---",
      "type: llm-wiki",
      "created: 2026-06-10 08:30",
      "updated: 2026-06-11 09:45",
      "created_by: claude-opus-4-8",
      "updated_by: gpt-5.5",
      "---",
      ""
    ].join("\n"));

    const createdBy = propsFieldControl(root, "Created by");
    expect(createdBy.textContent).toBe("claude-opus-4-8");
    expect(createdBy.querySelector("input.para-zk-block__input")).toBeNull();

    const updatedBy = propsFieldControl(root, "Updated by");
    expect(updatedBy.textContent).toBe("gpt-5.5");
    expect(updatedBy.querySelector("input.para-zk-block__input")).toBeNull();
  });
});

describe("props frontmatter workflow routing", () => {
  it("keeps project status writes on the workflow path, including archive moves", async () => {
    const app = new MockApp();
    const file = await app.vault.create("PARA/Projects/Alpha.md", [
      "---",
      "type: project",
      "status: in_progress",
      "---",
      ""
    ].join("\n"));

    await writePropsFrontmatter(app, file, "status", "archived");

    expect(file.path).toBe("PARA/Archives/Projects/Alpha.md");
    expect(app.listPaths()).not.toContain("PARA/Projects/Alpha.md");
    expect(app.metadataCache.getFileCache(file)?.frontmatter?.status).toBe("archived");
  });

  it("routes area writes through the workflow writable-key contract", async () => {
    const app = new MockApp();
    const file = await app.vault.create("PARA/Areas/Health.md", [
      "---",
      "type: area",
      "created: 2026-06-10 08:30",
      "---",
      ""
    ].join("\n"));

    await expectConsoleErrorDuring(() => writePropsFrontmatter(app, file, "created", "2026-06-11 09:45"));

    expect(app.metadataCache.getFileCache(file)?.frontmatter?.created).toBe("2026-06-10 08:30");
  });

  it("routes resource writes through workflow validation and alias normalization", async () => {
    const app = new MockApp();
    const file = await app.vault.create("PARA/Resources/Doc.md", [
      "---",
      "type: resource",
      "kind: paper",
      "---",
      ""
    ].join("\n"));

    await expectConsoleErrorDuring(() => writePropsFrontmatter(app, file, "kind", "invalid-kind"));
    expect(app.metadataCache.getFileCache(file)?.frontmatter?.kind).toBe("paper");

    await writePropsFrontmatter(app, file, "aliases", ["Research Note"]);
    expect(app.metadataCache.getFileCache(file)?.frontmatter?.aliases).toEqual(["Research Note"]);
  });

  it("routes journal writes by file path through workflow validation", async () => {
    const app = new MockApp();
    const file = await app.vault.create("Journal/2026-06/2026-06-11.md", [
      "---",
      "type: journal",
      "date: 2026-06-11",
      "energy: normal",
      "---",
      ""
    ].join("\n"));

    await expectConsoleErrorDuring(() => writePropsFrontmatter(app, file, "energy", "wired"));

    expect(app.metadataCache.getFileCache(file)?.frontmatter?.energy).toBe("normal");
  });

  it("routes retro list frontmatter through workflow area resolution", async () => {
    const app = new MockApp();
    await app.vault.create("PARA/Areas/Health.md", [
      "---",
      "type: area",
      "---",
      ""
    ].join("\n"));
    const file = await app.vault.create("PARA/Retros/Retro.md", [
      "---",
      "type: retro",
      "areas: []",
      "---",
      ""
    ].join("\n"));

    await writePropsFrontmatter(app, file, "areas", ["Health"]);

    expect(app.metadataCache.getFileCache(file)?.frontmatter?.areas).toEqual(["[[PARA/Areas/Health.md|Health]]"]);
  });

  it("routes ZK spark writes through workflow boolean normalization", async () => {
    const app = new MockApp();
    const file = await app.vault.create("ZK/Spark/Seed.md", [
      "---",
      "type: spark",
      "processed: false",
      "---",
      ""
    ].join("\n"));

    await writePropsFrontmatter(app, file, "processed", "true");

    expect(app.metadataCache.getFileCache(file)?.frontmatter?.processed).toBe(true);
  });

  it("routes ZK digest writes by path through updateZk", async () => {
    const app = new MockApp();
    const file = await app.vault.create("ZK/Digest/Source.md", [
      "---",
      "type: digest",
      "sourceTitle: Old source",
      "---",
      ""
    ].join("\n"));

    await writePropsFrontmatter(app, file, "sourceTitle", "New source");

    expect(app.metadataCache.getFileCache(file)?.frontmatter?.sourceTitle).toBe("New source");
  });

  it("routes ZK permanent writes through workflow validation", async () => {
    const app = new MockApp();
    const file = await app.vault.create("ZK/Permanent/Claim.md", [
      "---",
      "type: permanent",
      "maturity: draft",
      "---",
      ""
    ].join("\n"));

    await expectConsoleErrorDuring(() => writePropsFrontmatter(app, file, "maturity", "polished"));

    expect(app.metadataCache.getFileCache(file)?.frontmatter?.maturity).toBe("draft");
  });

  it("keeps the subnote path-only fallback isolated to subnote frontmatter writes", async () => {
    const app = new MockApp();
    const file = await app.vault.create("PARA/Projects/Alpha/Meeting.md", [
      "---",
      "type: doc",
      "subnote_type: free",
      "---",
      ""
    ].join("\n"));

    await writePropsFrontmatter(app, file, "subnote_type", "meeting");

    expect(app.metadataCache.getFileCache(file)?.frontmatter?.subnote_type).toBe("meeting");
  });

  it("keeps llm-wiki props display-only with no workflow write route", async () => {
    const app = new MockApp();
    const file = await app.vault.create("LLM-Wiki/AI/Policy.md", [
      "---",
      "type: llm-wiki",
      "created_by: claude-opus-4-8",
      "---",
      ""
    ].join("\n"));

    await expectConsoleErrorDuring(() => writePropsFrontmatter(app, file, "created_by", "gpt-5.5"));

    expect(app.metadataCache.getFileCache(file)?.frontmatter?.created_by).toBe("claude-opus-4-8");
  });
});

async function renderResourceProps(url: string): Promise<{
  app: MockApp;
  root: FakeElement;
  control: FakeElement;
  file: Awaited<ReturnType<MockApp["vault"]["create"]>>;
}> {
  const { app, root, file } = await renderPropsBlock("resource", "PARA/Resources/Doc.md", [
    "---",
    "type: resource",
    `url: ${url}`,
    "---",
    ""
  ].join("\n"));

  return { app, root, control: propsFieldControl(root, "URL"), file };
}

async function renderPropsBlock(_type: string, path: string, content: string): Promise<{
  app: MockApp;
  root: FakeElement;
  file: Awaited<ReturnType<MockApp["vault"]["create"]>>;
}> {
  const app = new MockApp();
  const file = await app.vault.create(path, content);

  stubAppEvents(app);
  const plugin = createPropsPlugin(app);
  const root = new FakeElement("div");
  renderPropsPanel(plugin, root.asHtml(), file.path);

  return { app, root, file };
}

async function writePropsFrontmatter(
  app: MockApp,
  file: Awaited<ReturnType<MockApp["vault"]["create"]>>,
  key: string,
  value: string | string[]
): Promise<void> {
  const plugin = createPropsPlugin(app);
  await writeFrontmatterValue(plugin, file.path, new FakeElement("div").asHtml(), key, value);
}

function createPropsPlugin(app: MockApp): ParaZkPluginContext {
  return {
    app,
    settings: DEFAULT_SETTINGS,
    registerMarkdownCodeBlockProcessor: () => {},
    registerMarkdownPostProcessor: () => {}
  } as unknown as ParaZkPluginContext;
}

function stubAppEvents(app: MockApp): void {
  Object.assign(app.vault, {
    on: () => ({ detach: () => {} })
  });
  Object.assign(app.metadataCache, {
    on: () => ({ detach: () => {} })
  });
}

async function expectConsoleErrorDuring(run: () => Promise<void>): Promise<void> {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await run();
  } finally {
    error.mockRestore();
  }
}

function propsFieldControl(root: FakeElement, label: string): FakeElement {
  const field = root
    .querySelectorAll(".para-zk-block__field")
    .find((candidate) => candidate.querySelector(".para-zk-block__label")?.textContent === label);
  const control = field?.querySelector(".para-zk-block__control");
  if (!control) throw new Error(`field not found: ${label}`);
  return control;
}

async function nextMicrotask(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function waitForFrontmatterValue(
  app: MockApp,
  file: Awaited<ReturnType<MockApp["vault"]["create"]>>,
  key: string,
  value: unknown
): Promise<void> {
  await waitFor(() => Object.is(app.metadataCache.getFileCache(file)?.frontmatter?.[key], value));
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(condition()).toBe(true);
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

  createSpan(options?: { cls?: string; text?: string; attr?: Record<string, string> }): FakeElement {
    return this.createEl("span", options);
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
