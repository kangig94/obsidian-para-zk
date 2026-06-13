import { describe, expect, it } from "vitest";
import { slugify } from "../../src/text";

describe("slugify", () => {
  it("lowercases and joins words with hyphens", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("collapses runs of separators (incl. underscores) to a single hyphen", () => {
    expect(slugify("a - b")).toBe("a-b");
    expect(slugify("a___b")).toBe("a-b");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  spaced  ")).toBe("spaced");
    expect(slugify("!!!edge!!!")).toBe("edge");
  });

  it("preserves Korean characters and path separators", () => {
    expect(slugify("안녕 hi")).toBe("안녕-hi");
    expect(slugify("a/b")).toBe("a/b");
  });

  it("falls back to 'untitled' for empty results", () => {
    expect(slugify("   ")).toBe("untitled");
    expect(slugify("!!!")).toBe("untitled");
  });
});
