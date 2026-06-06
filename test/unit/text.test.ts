import { describe, expect, it } from "vitest";
import { singleItemList } from "../../src/text";

describe("singleItemList", () => {
  it("wraps a non-empty value as a one-item list, trimmed", () => {
    expect(singleItemList("Foo")).toEqual(["Foo"]);
    expect(singleItemList("  Foo  ")).toEqual(["Foo"]);
  });

  it("returns an empty list for blank input", () => {
    expect(singleItemList("")).toEqual([]);
    expect(singleItemList("   ")).toEqual([]);
  });

  it("keeps the whole value as a single item (does not split on commas)", () => {
    expect(singleItemList("a, b")).toEqual(["a, b"]);
  });
});
