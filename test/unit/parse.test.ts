import { describe, expect, it } from "vitest";
import { parseList } from "../../src/cli/parse";

describe("parseList", () => {
  it("parses a JSON array, trimming and dropping empties", () => {
    expect(parseList('["AI", " Software ", ""]')).toEqual(["AI", "Software"]);
  });

  it("falls back to comma and newline splitting", () => {
    expect(parseList("AI, Software")).toEqual(["AI", "Software"]);
    expect(parseList("AI\nSoftware")).toEqual(["AI", "Software"]);
  });

  it("treats non-array JSON as plain text", () => {
    expect(parseList('{"a":1}')).toEqual(['{"a":1}']);
  });

  it("returns an empty array for empty or whitespace input", () => {
    expect(parseList(undefined)).toEqual([]);
    expect(parseList("   ")).toEqual([]);
  });
});
