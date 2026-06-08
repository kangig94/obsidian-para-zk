import { describe, expect, it } from "vitest";
import { buildCitationElement, parseCitationIndices } from "../../src/ux/citation-renderer";
import type { ParaZkPluginContext } from "../../src/plugin-interface";
import type { ReferenceRead } from "../../src/workflows";

describe("parseCitationIndices", () => {
  it("returns a single 0-based index for PZ[n]", () => {
    expect(parseCitationIndices("PZ[0]")).toEqual([0]);
    expect(parseCitationIndices("PZ[12]")).toEqual([12]);
  });

  it("parses a comma-separated list, with or without spaces", () => {
    expect(parseCitationIndices("PZ[1,2]")).toEqual([1, 2]);
    expect(parseCitationIndices("PZ[1, 2]")).toEqual([1, 2]);
    expect(parseCitationIndices("PZ[0, 3, 5]")).toEqual([0, 3, 5]);
    expect(parseCitationIndices("PZ[ 1 , 2 ]")).toEqual([1, 2]);
  });

  it("trims surrounding whitespace and reads leading zeros numerically", () => {
    expect(parseCitationIndices("  PZ[00, 07]  ")).toEqual([0, 7]);
  });

  it("only matches when the whole string is the token", () => {
    expect(parseCitationIndices("see PZ[0]")).toBeUndefined();
    expect(parseCitationIndices("PZ[0] extra")).toBeUndefined();
  });

  it("rejects malformed forms", () => {
    expect(parseCitationIndices("PZ[]")).toBeUndefined();
    expect(parseCitationIndices("PZ[a]")).toBeUndefined();
    expect(parseCitationIndices("PZ[1,]")).toBeUndefined();
    expect(parseCitationIndices("PZ[1,,2]")).toBeUndefined();
    expect(parseCitationIndices("PZ_INPUT[kind]")).toBeUndefined();
    expect(parseCitationIndices("")).toBeUndefined();
  });
});

describe("buildCitationElement", () => {
  it("keeps citation link text as the index for alias-bearing references", () => {
    const reference: ReferenceRead = {
      link: "[[PARA/Resources/Alias Demo P2.md|PMG]]",
      kind: "note",
      path: "PARA/Resources/Alias Demo P2.md"
    };
    const rendered = createCitationHost();

    buildCitationElement(fakePlugin(), [reference], [0], "PARA/Projects/Alpha/Alpha.md", rendered.host);

    expect(rendered.links).toHaveLength(1);
    expect(rendered.links[0].text).toBe("[0]");
    expect(rendered.links[0].attrs.title).toBe("PMG");
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

function createCitationHost(): { host: HTMLElement; links: FakeLink[] } {
  const links: FakeLink[] = [];
  const host = {
    appendText: () => {},
    createEl: (_tag: string, options?: { cls?: string; text?: string }) => {
      const link: FakeLink = {
        text: options?.text ?? "",
        attrs: {},
        classes: options?.cls ? [options.cls] : [],
        setAttr(key, value) {
          this.attrs[key] = value;
        },
        addClass(cls) {
          this.classes.push(cls);
        },
        addEventListener() {}
      };
      links.push(link);
      return link;
    }
  };
  return { host: host as unknown as HTMLElement, links };
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
