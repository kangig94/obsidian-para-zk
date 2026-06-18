import { describe, expect, it } from "vitest";
import { TFile } from "obsidian";
import { parseCitationKeys } from "../../src/citation-token";
import { buildCitationElement, registerCitationRenderers } from "../../src/ux/citations/renderer";
import type { ParaZkPluginContext } from "../../src/plugin-interface";
import type { ReferenceRead } from "../../src/workflows";

describe("parseCitationKeys", () => {
  it("returns a single stable id for PZ[<id>]", () => {
    expect(parseCitationKeys("PZ[a1b2c3]")).toEqual([{ id: "a1b2c3" }]);
    expect(parseCitationKeys("PZ[Ref_12-x]")).toEqual([{ id: "Ref_12-x" }]);
  });

  it("parses a comma-separated list, with or without spaces", () => {
    expect(parseCitationKeys("PZ[a1b2c3,d4e5f6]")).toEqual([{ id: "a1b2c3" }, { id: "d4e5f6" }]);
    expect(parseCitationKeys("PZ[a1b2c3, d4e5f6]")).toEqual([{ id: "a1b2c3" }, { id: "d4e5f6" }]);
    expect(parseCitationKeys("PZ[ a1b2c3 , d4e5f6 ]")).toEqual([{ id: "a1b2c3" }, { id: "d4e5f6" }]);
  });

  it("treats numeric-looking content as a key, not a positional index", () => {
    expect(parseCitationKeys("PZ[0]")).toEqual([{ id: "0" }]);
  });

  it("parses an optional section subpath after the id", () => {
    expect(parseCitationKeys("PZ[abc123#Training Loop]")).toEqual([{ id: "abc123", subpath: "Training Loop" }]);
    expect(parseCitationKeys("PZ[abc123#^blk-1]")).toEqual([{ id: "abc123", subpath: "^blk-1" }]);
    expect(parseCitationKeys("PZ[abc123#H1#H2]")).toEqual([{ id: "abc123", subpath: "H1#H2" }]);
  });

  it("mixes sectioned and plain ids in a multi-cite list", () => {
    expect(parseCitationKeys("PZ[a1#Intro, b2]")).toEqual([{ id: "a1", subpath: "Intro" }, { id: "b2" }]);
  });

  it("only matches when the whole string is the token", () => {
    expect(parseCitationKeys("see PZ[a1b2c3]")).toBeUndefined();
    expect(parseCitationKeys("PZ[a1b2c3] extra")).toBeUndefined();
  });

  it("rejects malformed forms", () => {
    expect(parseCitationKeys("PZ[]")).toBeUndefined();
    expect(parseCitationKeys("PZ[a.b]")).toBeUndefined();
    expect(parseCitationKeys("PZ[a1,]")).toBeUndefined();
    expect(parseCitationKeys("PZ[a1,,b2]")).toBeUndefined();
    expect(parseCitationKeys("PZ_INPUT[kind]")).toBeUndefined();
    expect(parseCitationKeys("")).toBeUndefined();
  });
});

describe("buildCitationElement", () => {
  it("renders the current position for an alias-bearing reference id", () => {
    const reference: ReferenceRead = {
      id: "pmg123",
      link: "[[PARA/Resources/Alias Demo P2.md|PMG]]",
      kind: "note",
      path: "PARA/Resources/Alias Demo P2.md"
    };
    const rendered = createCitationHost();

    buildCitationElement(fakePlugin(), [
      { id: "first1", link: "https://example.com/first", kind: "url", target: "https://example.com/first" },
      reference
    ], [{ id: "pmg123" }], "PARA/Projects/Alpha/Alpha.md", rendered.host);

    expect(rendered.links).toHaveLength(1);
    expect(rendered.links[0].text).toBe("[1]");
    expect(rendered.links[0].attrs.title).toBe("PMG");
  });

  it("renders the section hint and tooltip for a sectioned citation", () => {
    const reference: ReferenceRead = {
      id: "abc123",
      link: "[[PARA/Resources/Paper.md|Paper]]",
      kind: "note",
      path: "PARA/Resources/Paper.md"
    };
    const rendered = createCitationHost();

    buildCitationElement(fakePlugin(), [reference], [{ id: "abc123", subpath: "Training Loop" }], "Source.md", rendered.host);

    expect(rendered.links[0].text).toBe("[0 §Training Loop]");
    expect(rendered.links[0].attrs.title).toBe("Paper · §Training Loop");
  });

  it("renders the same id at a new position after references reorder", () => {
    const alpha: ReferenceRead = { id: "alpha1", link: "https://example.com/a", kind: "url", target: "https://example.com/a" };
    const beta: ReferenceRead = { id: "beta22", link: "https://example.com/b", kind: "url", target: "https://example.com/b" };
    const keys = parseCitationKeys("PZ[beta22]") ?? [];
    const before = createCitationHost();
    const after = createCitationHost();

    buildCitationElement(fakePlugin(), [alpha, beta], keys, "Source.md", before.host);
    buildCitationElement(fakePlugin(), [beta, alpha], keys, "Source.md", after.host);

    expect(keys).toEqual([{ id: "beta22" }]);
    expect(before.links[0].text).toBe("[1]");
    expect(after.links[0].text).toBe("[0]");
  });

  it("does not resolve a bare number positionally", () => {
    const reference: ReferenceRead = {
      id: "abc123",
      link: "https://example.com/source",
      kind: "url",
      target: "https://example.com/source"
    };
    const rendered = createCitationHost();

    buildCitationElement(fakePlugin(), [reference], [{ id: "0" }], "Source.md", rendered.host);

    expect(rendered.links).toHaveLength(1);
    expect(rendered.links[0].text).toBe("[?]");
    expect(rendered.links[0].attrs.title).toBe("No reference for 0");
    expect(rendered.links[0].classes).toContain("is-unresolved");
  });

  it("does not resolve references with null ids", () => {
    const reference: ReferenceRead = {
      id: null,
      link: "https://example.com/source",
      kind: "url",
      target: "https://example.com/source"
    };
    const rendered = createCitationHost();

    buildCitationElement(fakePlugin(), [reference], [{ id: "legacy1" }], "Source.md", rendered.host);

    expect(rendered.links[0].text).toBe("[?]");
    expect(rendered.links[0].attrs.title).toBe("No reference for legacy1");
    expect(rendered.links[0].classes).toContain("is-unresolved");
  });

  it("keeps comma spacing for multi-cite ids", () => {
    const alpha: ReferenceRead = { id: "alpha1", link: "https://example.com/a", kind: "url", target: "https://example.com/a" };
    const beta: ReferenceRead = { id: "beta22", link: "https://example.com/b", kind: "url", target: "https://example.com/b" };
    const rendered = createCitationHost();

    buildCitationElement(fakePlugin(), [alpha, beta], [{ id: "beta22" }, { id: "alpha1" }], "Source.md", rendered.host);

    expect(rendered.text()).toBe("[1, 0]");
  });

  it("renders a section hint on a non-first multi-cite entry", () => {
    const alpha: ReferenceRead = { id: "alpha1", link: "https://example.com/a", kind: "url", target: "https://example.com/a" };
    const beta: ReferenceRead = { id: "beta22", link: "https://example.com/b", kind: "url", target: "https://example.com/b" };
    const rendered = createCitationHost();

    buildCitationElement(fakePlugin(), [alpha, beta], [{ id: "alpha1" }, { id: "beta22", subpath: "Results" }], "Source.md", rendered.host);

    expect(rendered.text()).toBe("[0, 1 §Results]");
    expect(rendered.links[1].attrs.title).toBe("https://example.com/b · §Results");
  });

  it("keeps unresolved markers in place for mixed multi-cite ids", () => {
    const alpha: ReferenceRead = { id: "alpha1", link: "https://example.com/a", kind: "url", target: "https://example.com/a" };
    const beta: ReferenceRead = { id: "beta22", link: "https://example.com/b", kind: "url", target: "https://example.com/b" };
    const rendered = createCitationHost();

    buildCitationElement(fakePlugin(), [alpha, beta], [{ id: "beta22" }, { id: "MISSING" }, { id: "alpha1" }], "Source.md", rendered.host);

    expect(rendered.text()).toBe("[1, ?, 0]");
    expect(rendered.links[1].classes).toContain("is-unresolved");
    expect(rendered.links[1].attrs.title).toBe("No reference for MISSING");
  });
});

describe("registerCitationRenderers", () => {
  it("updates reading-view citation hosts when source metadata changes", () => {
    const file = fakeFile("Source.md");
    let frontmatter = {
      references: [
        { id: "beta22", link: "https://example.com/b" },
        { id: "alpha1", link: "https://example.com/a" }
      ]
    };
    const changedListeners: Array<(file: TFile) => void> = [];
    let postProcessor: ((el: HTMLElement, ctx: { sourcePath: string; addChild: (child: { load: () => void }) => void }) => void) | undefined;
    const plugin = fakeRendererPlugin({
      file,
      frontmatter: () => frontmatter,
      onMetadataChanged: (listener) => changedListeners.push(listener),
      registerPostProcessor: (processor) => {
        postProcessor = processor;
      }
    });
    const root = fakeMarkdownSectionWithCode("PZ[beta22]");

    registerCitationRenderers(plugin);
    postProcessor?.(root.asHtml(), {
      sourcePath: file.path,
      addChild: (child) => child.load()
    });

    expect(root.text()).toBe("[0]");
    expect(root.links()[0].attrs.href).toBe("https://example.com/b");

    frontmatter = {
      references: [
        { id: "alpha1", link: "https://example.com/a" },
        { id: "beta22", link: "https://example.com/b" }
      ]
    };
    changedListeners[0]?.(file);

    expect(root.text()).toBe("[1]");
    expect(root.links()[0].attrs.href).toBe("https://example.com/b");
  });
});

type FakeLink = {
  text: string;
  attrs: Record<string, string>;
  classes: string[];
  setAttr: (key: string, value: string) => void;
  addClass: (cls: string) => void;
  addEventListener: () => void;
};

function createCitationHost(): { host: HTMLElement; links: FakeLink[]; text: () => string } {
  const links: FakeLink[] = [];
  const textParts: string[] = [];
  const host = {
    appendText: (text: string) => {
      textParts.push(text);
    },
    createEl: (_tag: string, options?: { cls?: string; text?: string }) => {
      const link: FakeLink = {
        text: options?.text ?? "",
        attrs: {},
        classes: options?.cls ? options.cls.split(/\s+/) : [],
        setAttr(key, value) {
          this.attrs[key] = value;
        },
        addClass(cls) {
          this.classes.push(cls);
        },
        addEventListener() {}
      };
      links.push(link);
      textParts.push(link.text);
      return link;
    }
  };
  return { host: host as unknown as HTMLElement, links, text: () => textParts.join("") };
}

function fakePlugin(): ParaZkPluginContext {
  return {
    app: {
      workspace: {
        trigger: () => {}
      }
    }
  } as unknown as ParaZkPluginContext;
}

function fakeFile(path: string): TFile {
  const file = new TFile();
  file.path = path;
  file.name = path.split("/").pop() ?? path;
  file.basename = file.name.replace(/\.md$/i, "");
  file.extension = file.name.includes(".") ? file.name.split(".").pop() ?? "" : "";
  return file;
}

function fakeRendererPlugin(options: {
  file: TFile;
  frontmatter: () => Record<string, unknown>;
  onMetadataChanged: (listener: (file: TFile) => void) => void;
  registerPostProcessor: (
    processor: (el: HTMLElement, ctx: { sourcePath: string; addChild: (child: { load: () => void }) => void }) => void
  ) => void;
}): ParaZkPluginContext {
  return {
    app: {
      vault: {
        getFileByPath: (path: string) => path === options.file.path ? options.file : null,
        getAbstractFileByPath: () => null,
        getMarkdownFiles: () => [],
        read: async () => "",
        cachedRead: async () => "",
        create: async () => options.file,
        createFolder: async () => {},
        modify: async () => {},
        trash: async () => {}
      },
      fileManager: {
        processFrontMatter: async () => {},
        renameFile: async () => {}
      },
      metadataCache: {
        getFileCache: () => ({ frontmatter: options.frontmatter() }),
        getFirstLinkpathDest: () => null,
        resolvedLinks: {},
        on: (name: string, listener: (file: TFile) => void) => {
          expect(name).toBe("changed");
          options.onMetadataChanged(listener);
          return { detach: () => {} };
        }
      },
      workspace: {
        getActiveFile: () => null,
        getLeaf: () => ({ openFile: async () => {} }),
        openLinkText: async () => {},
        trigger: () => {}
      }
    },
    settings: {},
    registerMarkdownPostProcessor: (processor: unknown) => {
      options.registerPostProcessor(processor as Parameters<typeof options.registerPostProcessor>[0]);
      return processor;
    }
  } as unknown as ParaZkPluginContext;
}

type FakeChild = FakeElement | string;

class FakeElement {
  readonly ownerDocument = fakeDocument;
  parent: FakeElement | undefined;
  className = "";
  attrs: Record<string, string> = {};
  private readonly tag: string;
  private children: FakeChild[] = [];

  constructor(tag: string, text?: string) {
    this.tag = tag.toLowerCase();
    if (text !== undefined) this.children.push(text);
  }

  get textContent(): string {
    return this.children.map((child) => typeof child === "string" ? child : child.textContent).join("");
  }

  set textContent(value: string) {
    this.children = [value];
  }

  querySelectorAll(tag: string): FakeElement[] {
    const normalized = tag.toLowerCase();
    const matches: FakeElement[] = [];
    for (const child of this.children) {
      if (typeof child === "string") continue;
      if (child.tag === normalized) matches.push(child);
      matches.push(...child.querySelectorAll(normalized));
    }
    return matches;
  }

  closest(tag: string): FakeElement | null {
    const normalized = tag.toLowerCase();
    for (let current: FakeElement | undefined = this; current; current = current.parent) {
      if (current.tag === normalized) return current;
    }
    return null;
  }

  replaceWith(next: FakeElement): void {
    if (!this.parent) return;
    const index = this.parent.children.indexOf(this);
    if (index === -1) return;
    next.parent = this.parent;
    this.parent.children[index] = next;
    this.parent = undefined;
  }

  createEl(tag: string, options?: { cls?: string; text?: string }): FakeElement {
    const child = new FakeElement(tag, options?.text);
    child.parent = this;
    if (options?.cls) child.className = options.cls;
    this.children.push(child);
    return child;
  }

  appendText(text: string): void {
    this.children.push(text);
  }

  empty(): void {
    this.children = [];
  }

  setAttr(key: string, value: string): void {
    this.attrs[key] = value;
  }

  addClass(...classes: string[]): void {
    const existing = this.className ? this.className.split(/\s+/) : [];
    this.className = [...existing, ...classes].join(" ");
  }

  addEventListener(): void {}

  asHtml(): HTMLElement {
    return this as unknown as HTMLElement;
  }
}

const fakeDocument = {
  createElement: (tag: string) => new FakeElement(tag)
};

function fakeMarkdownSectionWithCode(codeText: string): { asHtml: () => HTMLElement; text: () => string; links: () => FakeElement[] } {
  const root = new FakeElement("div");
  root.createEl("code", { text: codeText });
  return {
    asHtml: () => root.asHtml(),
    text: () => root.textContent,
    links: () => root.querySelectorAll("a")
  };
}
