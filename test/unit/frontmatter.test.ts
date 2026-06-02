import { describe, expect, it } from "vitest";
import { frontmatterLinks, yamlScalar } from "../../src/vault/frontmatter";

describe("yamlScalar", () => {
  it("JSON-quotes non-empty strings", () => {
    expect(yamlScalar("Alpha")).toBe('"Alpha"');
    expect(yamlScalar('quote"inside')).toBe('"quote\\"inside"');
  });

  it("returns an empty string for empty or missing values", () => {
    expect(yamlScalar(undefined)).toBe("");
    expect(yamlScalar("")).toBe("");
  });
});

describe("frontmatterLinks", () => {
  it("normalizes an array of strings, trimming and dropping empties", () => {
    expect(frontmatterLinks(["[[A]]", " [[B]] ", ""])).toEqual(["[[A]]", "[[B]]"]);
  });

  it("wraps a single non-empty string", () => {
    expect(frontmatterLinks("[[A]]")).toEqual(["[[A]]"]);
  });

  it("returns an empty array for blank, missing, or non-link values", () => {
    expect(frontmatterLinks(undefined)).toEqual([]);
    expect(frontmatterLinks("   ")).toEqual([]);
    expect(frontmatterLinks(42)).toEqual([]);
  });
});
