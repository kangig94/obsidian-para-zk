import { describe, expect, it } from "vitest";
import { referenceTitle } from "../../src/ux/reference-link";
import type { ReferenceRead } from "../../src/workflows";

describe("referenceTitle", () => {
  it("uses the URL target when present", () => {
    const reference: ReferenceRead = {
      link: "https://example.com/source",
      kind: "url",
      target: "https://example.com/canonical"
    };

    expect(referenceTitle(reference)).toBe("https://example.com/canonical");
  });

  it("falls back to the raw URL link when no URL target is present", () => {
    const reference: ReferenceRead = {
      link: "https://example.com/source",
      kind: "url"
    };

    expect(referenceTitle(reference)).toBe("https://example.com/source");
  });

  it("uses the raw link for text references", () => {
    const reference: ReferenceRead = {
      link: "unresolved raw reference",
      kind: "text"
    };

    expect(referenceTitle(reference)).toBe("unresolved raw reference");
  });

  it("uses a wikilink alias as the display title", () => {
    const reference: ReferenceRead = {
      link: "[[PARA/Resources/Alias Demo P2.md|PMG]]",
      kind: "note",
      path: "PARA/Resources/Alias Demo P2.md"
    };

    expect(referenceTitle(reference)).toBe("PMG");
  });

  it("uses a wikilink alias for unresolved wiki references", () => {
    const reference: ReferenceRead = {
      link: "[[Missing/Alias Demo P2.md|PMG]]",
      kind: "wiki",
      target: "Missing/Alias Demo P2.md"
    };

    expect(referenceTitle(reference)).toBe("PMG");
  });

  it("falls back to the target basename when no alias is present", () => {
    const reference: ReferenceRead = {
      link: "[[PARA/Resources/Alias Demo P2.md]]",
      kind: "note",
      path: "PARA/Resources/Alias Demo P2.md"
    };

    expect(referenceTitle(reference)).toBe("Alias Demo P2");
  });

  it("falls back to the target basename when the alias is empty", () => {
    const reference: ReferenceRead = {
      link: "[[PARA/Resources/Alias Demo P2.md|]]",
      kind: "note",
      path: "PARA/Resources/Alias Demo P2.md"
    };

    expect(referenceTitle(reference)).toBe("Alias Demo P2");
  });
});
