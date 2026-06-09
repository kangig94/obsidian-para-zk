import { describe, expect, it } from "vitest";
import { buildCitationElement, parseCitationKeys } from "../../src/ux/citation-renderer";
import type { ParaZkPluginContext } from "../../src/plugin-interface";
import type { ReferenceRead } from "../../src/workflows";

describe("parseCitationKeys", () => {
  it("returns a single stable id for PZ[<id>]", () => {
    expect(parseCitationKeys("PZ[a1b2c3]")).toEqual(["a1b2c3"]);
    expect(parseCitationKeys("PZ[Ref_12-x]")).toEqual(["Ref_12-x"]);
  });

  it("parses a comma-separated list, with or without spaces", () => {
    expect(parseCitationKeys("PZ[a1b2c3,d4e5f6]")).toEqual(["a1b2c3", "d4e5f6"]);
    expect(parseCitationKeys("PZ[a1b2c3, d4e5f6]")).toEqual(["a1b2c3", "d4e5f6"]);
    expect(parseCitationKeys("PZ[ a1b2c3 , d4e5f6 ]")).toEqual(["a1b2c3", "d4e5f6"]);
  });

  it("treats numeric-looking content as a key, not a positional index", () => {
    expect(parseCitationKeys("PZ[0]")).toEqual(["0"]);
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
    ], ["pmg123"], "PARA/Projects/Alpha/Alpha.md", rendered.host);

    expect(rendered.links).toHaveLength(1);
    expect(rendered.links[0].text).toBe("[1]");
    expect(rendered.links[0].attrs.title).toBe("PMG");
  });

  it("renders the same id at a new position after references reorder", () => {
    const alpha: ReferenceRead = { id: "alpha1", link: "https://example.com/a", kind: "url", target: "https://example.com/a" };
    const beta: ReferenceRead = { id: "beta22", link: "https://example.com/b", kind: "url", target: "https://example.com/b" };
    const keys = parseCitationKeys("PZ[beta22]") ?? [];
    const before = createCitationHost();
    const after = createCitationHost();

    buildCitationElement(fakePlugin(), [alpha, beta], keys, "Source.md", before.host);
    buildCitationElement(fakePlugin(), [beta, alpha], keys, "Source.md", after.host);

    expect(keys).toEqual(["beta22"]);
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

    buildCitationElement(fakePlugin(), [reference], ["0"], "Source.md", rendered.host);

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

    buildCitationElement(fakePlugin(), [reference], ["legacy1"], "Source.md", rendered.host);

    expect(rendered.links[0].text).toBe("[?]");
    expect(rendered.links[0].attrs.title).toBe("No reference for legacy1");
    expect(rendered.links[0].classes).toContain("is-unresolved");
  });

  it("keeps comma spacing for multi-cite ids", () => {
    const alpha: ReferenceRead = { id: "alpha1", link: "https://example.com/a", kind: "url", target: "https://example.com/a" };
    const beta: ReferenceRead = { id: "beta22", link: "https://example.com/b", kind: "url", target: "https://example.com/b" };
    const rendered = createCitationHost();

    buildCitationElement(fakePlugin(), [alpha, beta], ["beta22", "alpha1"], "Source.md", rendered.host);

    expect(rendered.text()).toBe("[1, 0]");
  });

  it("keeps unresolved markers in place for mixed multi-cite ids", () => {
    const alpha: ReferenceRead = { id: "alpha1", link: "https://example.com/a", kind: "url", target: "https://example.com/a" };
    const beta: ReferenceRead = { id: "beta22", link: "https://example.com/b", kind: "url", target: "https://example.com/b" };
    const rendered = createCitationHost();

    buildCitationElement(fakePlugin(), [alpha, beta], ["beta22", "MISSING", "alpha1"], "Source.md", rendered.host);

    expect(rendered.text()).toBe("[1, ?, 0]");
    expect(rendered.links[1].classes).toContain("is-unresolved");
    expect(rendered.links[1].attrs.title).toBe("No reference for MISSING");
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
