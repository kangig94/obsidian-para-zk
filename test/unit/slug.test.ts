import { describe, expect, it } from "vitest";
import { slugify } from "../../src/text";

describe("slugify", () => {
  it("lowercases and joins words with underscores", () => {
    expect(slugify("Hello World")).toBe("hello_world");
  });

  it("converts hyphens and runs of separators to a single underscore", () => {
    expect(slugify("a - b")).toBe("a_b");
    expect(slugify("a___b")).toBe("a_b");
  });

  it("trims leading and trailing underscores", () => {
    expect(slugify("  spaced  ")).toBe("spaced");
    expect(slugify("!!!edge!!!")).toBe("edge");
  });

  it("preserves Korean characters and path separators", () => {
    expect(slugify("안녕 hi")).toBe("안녕_hi");
    expect(slugify("a/b")).toBe("a/b");
  });

  it("falls back to 'untitled' for empty results", () => {
    expect(slugify("   ")).toBe("untitled");
    expect(slugify("!!!")).toBe("untitled");
  });
});
