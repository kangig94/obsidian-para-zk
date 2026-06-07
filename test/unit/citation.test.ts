import { describe, expect, it } from "vitest";
import { parseCitationIndices } from "../../src/ux/citation-renderer";

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
