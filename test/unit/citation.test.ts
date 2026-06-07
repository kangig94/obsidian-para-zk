import { describe, expect, it } from "vitest";
import { parseCitationIndex } from "../../src/ux/citation-renderer";

describe("parseCitationIndex", () => {
  it("returns the 0-based index for a whole-content PZ[n] token", () => {
    expect(parseCitationIndex("PZ[0]")).toBe(0);
    expect(parseCitationIndex("PZ[12]")).toBe(12);
  });

  it("trims surrounding whitespace", () => {
    expect(parseCitationIndex("  PZ[3]  ")).toBe(3);
  });

  it("reads leading zeros as the numeric index", () => {
    expect(parseCitationIndex("PZ[00]")).toBe(0);
    expect(parseCitationIndex("PZ[007]")).toBe(7);
  });

  it("only matches when the whole string is the token (not embedded in prose)", () => {
    expect(parseCitationIndex("see PZ[0]")).toBeUndefined();
    expect(parseCitationIndex("PZ[0] extra")).toBeUndefined();
  });

  it("rejects malformed forms", () => {
    expect(parseCitationIndex("PZ[]")).toBeUndefined();
    expect(parseCitationIndex("PZ[a]")).toBeUndefined();
    expect(parseCitationIndex("PZ_INPUT[kind]")).toBeUndefined();
    expect(parseCitationIndex("")).toBeUndefined();
  });
});
