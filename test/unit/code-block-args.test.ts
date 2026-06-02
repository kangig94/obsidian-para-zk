import { describe, expect, it } from "vitest";
import { parseCodeBlockKeyValues } from "../../src/ux/code-block-args";

describe("parseCodeBlockKeyValues", () => {
  it("parses key: value lines, trimming whitespace", () => {
    expect(parseCodeBlockKeyValues("type: project\n  key :  value  ")).toEqual({
      type: "project",
      key: "value"
    });
  });

  it("ignores lines without a key: value shape", () => {
    expect(parseCodeBlockKeyValues("type: project\njust a comment\n\nx: 1")).toEqual({
      type: "project",
      x: "1"
    });
  });

  it("keeps the last value when a key repeats", () => {
    expect(parseCodeBlockKeyValues("k: a\nk: b")).toEqual({ k: "b" });
  });
});
