import { describe, expect, it } from "vitest";
import { splitCitationTokens } from "../../src/ux/citation-renderer";

describe("splitCitationTokens", () => {
  it("returns the whole string as one text run when there is no citation", () => {
    expect(splitCitationTokens("plain prose")).toEqual([{ kind: "text", value: "plain prose" }]);
  });

  it("splits a single citation out of surrounding text", () => {
    expect(splitCitationTokens("see PZ[0].")).toEqual([
      { kind: "text", value: "see " },
      { kind: "cite", index: 0 },
      { kind: "text", value: "." }
    ]);
  });

  it("keeps multi-digit indices whole and handles several citations", () => {
    expect(splitCitationTokens("PZ[0] and PZ[12]")).toEqual([
      { kind: "cite", index: 0 },
      { kind: "text", value: " and " },
      { kind: "cite", index: 12 }
    ]);
  });

  it("handles adjacent citations with no text between", () => {
    expect(splitCitationTokens("PZ[0]PZ[1]")).toEqual([
      { kind: "cite", index: 0 },
      { kind: "cite", index: 1 }
    ]);
  });

  it("leaves malformed forms (no digits) as literal text", () => {
    expect(splitCitationTokens("PZ[] PZ[a] PZ[1]")).toEqual([
      { kind: "text", value: "PZ[] PZ[a] " },
      { kind: "cite", index: 1 }
    ]);
  });

  it("returns an empty list for an empty string", () => {
    expect(splitCitationTokens("")).toEqual([]);
  });

  it("reads leading zeros as the numeric index (PZ[00] -> 0)", () => {
    expect(splitCitationTokens("PZ[00]")).toEqual([{ kind: "cite", index: 0 }]);
    expect(splitCitationTokens("PZ[007]")).toEqual([{ kind: "cite", index: 7 }]);
  });

  it("is stateless across calls (fresh regex, no shared lastIndex)", () => {
    const input = "PZ[0] and PZ[1]";
    expect(splitCitationTokens(input)).toEqual(splitCitationTokens(input));
  });
});
