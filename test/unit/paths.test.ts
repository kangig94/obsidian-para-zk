import { describe, expect, it } from "vitest";
import {
  joinVaultPath,
  normalizeVaultPath,
  sanitizeFileName,
  wikiLink
} from "../../src/vault/paths";

describe("normalizeVaultPath", () => {
  it("converts backslashes, trims, and strips surrounding slashes", () => {
    expect(normalizeVaultPath("\\PARA\\Projects\\")).toBe("PARA/Projects");
    expect(normalizeVaultPath("  /a/b/  ")).toBe("a/b");
  });

  it("collapses repeated slashes and handles empty input", () => {
    expect(normalizeVaultPath("a//b///c")).toBe("a/b/c");
    expect(normalizeVaultPath(undefined)).toBe("");
    expect(normalizeVaultPath("   ")).toBe("");
  });
});

describe("joinVaultPath", () => {
  it("drops falsy parts and normalizes the result", () => {
    expect(joinVaultPath("PARA", undefined, "Projects", "")).toBe("PARA/Projects");
    expect(joinVaultPath("a/", "/b")).toBe("a/b");
  });
});

describe("sanitizeFileName", () => {
  it("replaces forbidden characters with single spaces", () => {
    expect(sanitizeFileName('a/b:c*d?e"f<g>h|i#j^k[l]m')).toBe("a b c d e f g h i j k l m");
  });

  it("collapses whitespace and trims", () => {
    expect(sanitizeFileName("  hello    world  ")).toBe("hello world");
  });

  it("caps length at 120 characters", () => {
    expect(sanitizeFileName("x".repeat(200))).toHaveLength(120);
  });
});

describe("wikiLink", () => {
  it("formats with and without an alias", () => {
    expect(wikiLink("PARA/Projects/Alpha.md")).toBe("[[PARA/Projects/Alpha.md]]");
    expect(wikiLink("\\PARA\\Alpha.md", "Alpha")).toBe("[[PARA/Alpha.md|Alpha]]");
  });
});
